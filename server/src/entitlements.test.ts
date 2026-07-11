// Tests for the entitlement logic and the Stripe event processor.
//
// The pure timestamp logic and the dedupe-then-apply flow run against an
// in-memory store, so the plan's key scenario - "a completed checkout flips the
// entitlement exactly once, idempotent on retry" - is proven with no D1 and no
// Stripe. The live pieces (real signature verification, a real Checkout Session
// flipping remote D1) are exercised by the orchestrator in test mode.
//
// Run: tsx src/entitlements.test.ts (or via npm test)

import {
  extendPremium,
  isPremium,
  ONE_YEAR_MS,
  processStripeEvent,
  type EntitlementStore,
} from './entitlements';
import { stripeEventUserId, type StripeLikeEvent } from './stripe';

let pass = 0;
let fail = 0;

function ok(name: string, cond: boolean, info?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}`, info ?? '');
  }
}

function memStore() {
  const premium = new Map<string, number>();
  const events = new Set<string>();
  const store: EntitlementStore = {
    async getPremiumUntil(userId) {
      return premium.has(userId) ? (premium.get(userId) as number) : null;
    },
    async setPremiumUntil(userId, until) {
      premium.set(userId, until);
    },
    async markEventProcessed(eventId) {
      if (events.has(eventId)) return false;
      events.add(eventId);
      return true;
    },
  };
  return { store, premium, events };
}

function checkoutEvent(id: string, userId: string): StripeLikeEvent {
  return { id, type: 'checkout.session.completed', data: { object: { client_reference_id: userId } } };
}

async function main() {
  const now = 1_000_000_000_000; // fixed, so no clock is read

  // --- isPremium ------------------------------------------------------------
  ok('a future expiry is premium', isPremium(now + 1000, now));
  ok('a past expiry is not premium', !isPremium(now - 1000, now));
  ok('a null expiry is not premium', !isPremium(null, now));

  // --- extendPremium --------------------------------------------------------
  ok('a first purchase grants one year from now', extendPremium(null, now) === now + ONE_YEAR_MS);
  ok('an expired entitlement grants a year from now', extendPremium(now - 5, now) === now + ONE_YEAR_MS);
  ok(
    'an active entitlement stacks a year onto the remaining time',
    extendPremium(now + ONE_YEAR_MS, now) === now + 2 * ONE_YEAR_MS,
  );

  // --- stripeEventUserId ----------------------------------------------------
  ok('client_reference_id is read', stripeEventUserId(checkoutEvent('e1', 'user-1')) === 'user-1');
  ok(
    'metadata.userId is the fallback',
    stripeEventUserId({ id: 'e', type: 'invoice.paid', data: { object: { metadata: { userId: 'user-2' } } } }) ===
      'user-2',
  );
  ok(
    'no reference yields null',
    stripeEventUserId({ id: 'e', type: 'invoice.paid', data: { object: {} } }) === null,
  );

  // --- processStripeEvent: flips once, idempotent on retry ------------------
  {
    const { store, premium } = memStore();
    const first = await processStripeEvent(store, checkoutEvent('evt_1', 'user-1'), now);
    ok('a completed checkout applies', first.applied === true);
    ok('the entitlement is a year out', premium.get('user-1') === now + ONE_YEAR_MS);

    const retry = await processStripeEvent(store, checkoutEvent('evt_1', 'user-1'), now);
    ok('the same event id is a no-op on retry', retry.applied === false);
    ok('premium was not double-extended', premium.get('user-1') === now + ONE_YEAR_MS);
  }

  // --- invoice.paid also flips ---------------------------------------------
  {
    const { store, premium } = memStore();
    const res = await processStripeEvent(
      store,
      { id: 'inv_1', type: 'invoice.paid', data: { object: { metadata: { userId: 'user-3' } } } },
      now,
    );
    ok('invoice.paid applies', res.applied === true && premium.get('user-3') === now + ONE_YEAR_MS);
  }

  // --- irrelevant / unattributable events do nothing -----------------------
  {
    const { store } = memStore();
    const other = await processStripeEvent(
      store,
      { id: 'evt_x', type: 'customer.created', data: { object: { client_reference_id: 'user-1' } } },
      now,
    );
    ok('an unrelated event type does not apply', other.applied === false);

    const noUser = await processStripeEvent(store, { id: 'evt_y', type: 'checkout.session.completed', data: { object: {} } }, now);
    ok('a completed checkout with no user id does not apply', noUser.applied === false);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

void main();
