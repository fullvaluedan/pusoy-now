// Store-compliant account deletion (U4): a real, irreversible purge of every
// row belonging to a user, plus best-effort Apple token revocation.
//
// Both the App Store and Google Play mandate in-app account deletion. D1's
// foreign keys cascade from the `user` row (session/account/entitlement/
// player_profile/friendship/player_stats/marketing_consent all reference
// `user` ON DELETE CASCADE), so deleting the user row purges all of those in
// one statement. The only exception is `verification`: its rows are keyed by
// the user's email with no FK, so they need an explicit delete.
//
// The store seam and pure deleteAccount logic are split from D1 - the same
// shape as profile.ts / consent.ts - so the purge, the Apple-revocation hook,
// and the unknown-user case are all unit-testable with no D1. The route
// (session gating, live D1) is wired in index.ts.

export interface DeletionStore {
  // The user's email, or null when no such user exists. Also the "does this
  // user exist?" check the route turns into a 404.
  getUserEmail(userId: string): Promise<string | null>;
  // True when the user has an `account` row with providerId 'apple' (Apple
  // requires token revocation on deletion for Sign in with Apple accounts).
  hasAppleLink(userId: string): Promise<boolean>;
  // Delete the `verification` rows keyed by this email (no FK, so not covered
  // by the user-row cascade).
  deleteVerificationsByIdentifier(email: string): Promise<void>;
  // Delete the `user` row; D1 cascades every FK-linked table.
  deleteUser(userId: string): Promise<void>;
}

export type DeletionResult = { status: 'deleted' } | { status: 'not-found' };

export interface DeleteAccountOptions {
  // Best-effort Apple token revocation, invoked before deletion only when the
  // user has an apple-linked account. Supplied by the route only when Apple
  // credentials are configured (feature-detected; ships disabled until then).
  // deleteAccount swallows any error it throws so revocation can never block
  // the deletion Apple itself mandates.
  revokeApple?: (userId: string) => Promise<void>;
}

// Purge a user's account. Resolves the email first (also the existence check:
// an unknown user returns not-found without touching anything). If the user is
// apple-linked and a revocation hook was supplied, revoke first - best-effort,
// a failure is caught and never blocks deletion. Then delete verification rows
// by email and the user row (which cascades every other table).
export async function deleteAccount(
  store: DeletionStore,
  userId: string,
  options: DeleteAccountOptions = {},
): Promise<DeletionResult> {
  const email = await store.getUserEmail(userId);
  if (email === null) return { status: 'not-found' };

  if (options.revokeApple && (await store.hasAppleLink(userId))) {
    try {
      await options.revokeApple(userId);
    } catch {
      // Apple mandates revocation but a revocation outage must never trap a
      // user in an undeletable account. Log-and-continue (the route logs).
    }
  }

  await store.deleteVerificationsByIdentifier(email);
  await store.deleteUser(userId);
  return { status: 'deleted' };
}

// --- Apple token revocation --------------------------------------------------

// POST a token to Apple's revocation endpoint. Throws on a non-2xx response so
// the caller (deleteAccount's hook) can log it; deleteAccount swallows it.
// https://developer.apple.com/documentation/sign_in_with_apple/revoke_tokens
export async function revokeAppleToken(
  clientId: string,
  clientSecret: string,
  token: string,
  tokenTypeHint: 'refresh_token' | 'access_token',
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    token,
    token_type_hint: tokenTypeHint,
  });
  const res = await fetchImpl('https://appleid.apple.com/auth/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Apple token revocation failed: ${res.status}`);
}

// Apple credentials, feature-detected the same way as the social providers.
// Until both exist the revocation hook is never built and deletion runs with
// no Apple call (U8 provisions these secrets).
export interface AppleRevocationEnv {
  APPLE_CLIENT_ID?: string;
  APPLE_CLIENT_SECRET?: string;
}

// Build the best-effort Apple revocation hook for deleteAccount, or undefined
// when Apple credentials are not configured. The hook reads the user's stored
// Apple token from the `account` table and posts it to Apple's revoke
// endpoint. Returning undefined (rather than a no-op) means deleteAccount skips
// the hasAppleLink check entirely when Apple is not wired up.
export function appleRevocationHook(
  db: D1Database,
  env: AppleRevocationEnv,
  fetchImpl: typeof fetch = fetch,
): ((userId: string) => Promise<void>) | undefined {
  const clientId = env.APPLE_CLIENT_ID;
  const clientSecret = env.APPLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return undefined;
  return async (userId: string) => {
    const row = await db
      .prepare(
        "SELECT refreshToken, accessToken FROM account WHERE userId = ? AND providerId = 'apple' LIMIT 1",
      )
      .bind(userId)
      .first<{ refreshToken: string | null; accessToken: string | null }>();
    const token = row?.refreshToken ?? row?.accessToken ?? null;
    if (!token) return;
    const hint = row?.refreshToken ? 'refresh_token' : 'access_token';
    await revokeAppleToken(clientId, clientSecret, token, hint, fetchImpl);
  };
}

// --- D1-backed store ---------------------------------------------------------

export function d1DeletionStore(db: D1Database): DeletionStore {
  return {
    async getUserEmail(userId) {
      const row = await db
        .prepare('SELECT email FROM "user" WHERE id = ?')
        .bind(userId)
        .first<{ email: string }>();
      return row?.email ?? null;
    },
    async hasAppleLink(userId) {
      const row = await db
        .prepare("SELECT 1 AS one FROM account WHERE userId = ? AND providerId = 'apple' LIMIT 1")
        .bind(userId)
        .first<{ one: number }>();
      return row != null;
    },
    async deleteVerificationsByIdentifier(email) {
      await db.prepare('DELETE FROM verification WHERE identifier = ?').bind(email).run();
    },
    async deleteUser(userId) {
      await db.prepare('DELETE FROM "user" WHERE id = ?').bind(userId).run();
    },
  };
}
