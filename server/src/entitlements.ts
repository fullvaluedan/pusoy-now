// Entitlements: the free-vs-premium record and the logic that flips it.
//
// An entitlement is one row per user with a `premiumUntil` epoch-ms timestamp
// (null = never premium). Premium is simply "premiumUntil is in the future".
// Stripe webhooks extend it a year at a time. Everything money-related is
// dark-launched: this is plumbing, not a gate.
//
// The pure logic (isPremium, extendPremium) and the event processor are split
// from the D1 SQL behind an EntitlementStore interface, so the whole flow -
// including "a completed checkout flips the entitlement exactly once, idempotent
// on retry" - is unit-testable against an in-memory store with no D1.

import type { Env } from './auth';
import { makeAuth } from './auth';
import { stripeEventUserId, type StripeLikeEvent } from './stripe';

export const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// Premium is a timestamp comparison, nothing more.
export function isPremium(premiumUntil: number | null, now: number): boolean {
  return premiumUntil != null && premiumUntil > now;
}

// Extend premium by a year from whichever is later - now, or the current expiry
// - so a renewal that arrives early stacks onto the remaining time instead of
// throwing it away.
export function extendPremium(currentUntil: number | null, now: number): number {
  const base = currentUntil != null && currentUntil > now ? currentUntil : now;
  return base + ONE_YEAR_MS;
}

// Storage seam. The route wires the D1 implementation; tests pass an in-memory
// fake. markEventProcessed returns true only the first time an event id is
// seen, which is what makes webhook handling idempotent.
export interface EntitlementStore {
  getPremiumUntil(userId: string): Promise<number | null>;
  setPremiumUntil(userId: string, until: number, now: number): Promise<void>;
  markEventProcessed(eventId: string, now: number): Promise<boolean>;
}

// Process a verified Stripe event: dedupe on event id, then extend premium for
// the referenced user. Returns whether the entitlement was actually changed.
// Called only after the signature is verified by the route.
export async function processStripeEvent(
  store: EntitlementStore,
  event: StripeLikeEvent,
  now: number,
): Promise<{ applied: boolean }> {
  // Stripe retries webhooks; the first record of an event id wins and every
  // retry is a no-op. This is the idempotency guarantee.
  const fresh = await store.markEventProcessed(event.id, now);
  if (!fresh) return { applied: false };

  if (event.type !== 'checkout.session.completed' && event.type !== 'invoice.paid') {
    return { applied: false };
  }

  const userId = stripeEventUserId(event);
  if (!userId) return { applied: false };

  const current = await store.getPremiumUntil(userId);
  await store.setPremiumUntil(userId, extendPremium(current, now), now);
  return { applied: true };
}

// --- D1-backed store -------------------------------------------------------

export function d1Store(db: D1Database): EntitlementStore {
  return {
    async getPremiumUntil(userId) {
      const row = await db
        .prepare('SELECT premiumUntil FROM entitlement WHERE userId = ?')
        .bind(userId)
        .first<{ premiumUntil: number | null }>();
      return row?.premiumUntil ?? null;
    },
    async setPremiumUntil(userId, until, now) {
      await db
        .prepare(
          `INSERT INTO entitlement (userId, premiumUntil, updatedAt) VALUES (?, ?, ?)
           ON CONFLICT(userId) DO UPDATE SET premiumUntil = excluded.premiumUntil, updatedAt = excluded.updatedAt`,
        )
        .bind(userId, until, now)
        .run();
    },
    async markEventProcessed(eventId, now) {
      // INSERT OR IGNORE + the changes count is an atomic "was this new?" check,
      // so two concurrent deliveries of the same event can't both apply.
      const res = await db
        .prepare('INSERT OR IGNORE INTO stripe_event (id, processedAt) VALUES (?, ?)')
        .bind(eventId, now)
        .run();
      return (res.meta?.changes ?? 0) > 0;
    },
  };
}

// Resolve the signed-in user id from a request's headers via better-auth, or
// null when there is no valid session. Used to gate GET /api/entitlement and
// the checkout route.
export async function requireUserId(env: Env, headers: Headers): Promise<string | null> {
  const session = await makeAuth(env).api.getSession({ headers });
  return session?.user?.id ?? null;
}

// Pure decision, split out so it is unit-testable without standing up
// better-auth/D1. A claimant is a session that exists, has a user id, and is NOT
// anonymous. Returns the id or null.
export function claimantIdFromSession(
  session: { user?: { id?: string; isAnonymous?: boolean } } | null | undefined,
): string | null {
  const user = session?.user;
  if (!user?.id) return null;
  if (user.isAnonymous === true) return null;
  return user.id;
}

// Like requireUserId, but ONLY returns an id for a real (non-anonymous) account.
// The anonymous plugin is always on (server/src/auth.ts), so guests get a valid
// session with a user id and `user.isAnonymous === true`. Username claim/rename/
// check must be gated on a genuine account, so those routes use this helper: a
// guest resolves to null and is refused, keeping its generated name.
export async function requireClaimantUserId(env: Env, headers: Headers): Promise<string | null> {
  const session = await makeAuth(env).api.getSession({ headers });
  return claimantIdFromSession(session as Parameters<typeof claimantIdFromSession>[0]);
}
