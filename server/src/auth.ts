// Per-request better-auth factory.
//
// The D1 binding only exists on `env` at request time (never in module scope on
// Workers), so the auth instance is built per request rather than as a
// singleton. This is the documented Hono + Cloudflare pattern.
//
// U1 wires the core: email/password, a Kysely D1 dialect, database-backed rate
// limiting, and trustedOrigins locked to the web origin(s) plus the app's
// custom scheme. U2 layers verification + captcha + the Resend sender on top of
// the same factory; U3 adds social providers; U5 adds the entitlement/Stripe
// fields.

import { betterAuth } from 'better-auth';
import type { BetterAuthOptions } from 'better-auth';
import { D1Dialect } from 'kysely-d1';

export interface Env {
  // D1 binding (wrangler.toml). Present on every request; never at module load.
  DB: D1Database;
  // Signing secret for sessions/tokens. Set with `wrangler secret put`.
  BETTER_AUTH_SECRET: string;
  // Public base URL of the deployed Worker, e.g. https://pusoy-now-auth.<sub>.workers.dev
  // Used for callback URLs and email links. Optional in local dev.
  BETTER_AUTH_URL?: string;
  // Comma-separated extra web origins allowed to talk to the auth API
  // (e.g. "http://localhost:8095,https://pusoynow.pages.dev"). The app's own
  // `pusoynow://` scheme is always trusted regardless of this value.
  TRUSTED_ORIGINS?: string;
  // --- U2: email verification via Resend (dev-mailbox mode until set) --------
  RESEND_API_KEY?: string;
  // From-address for verification/reset emails. Falls back to a Resend sandbox.
  EMAIL_FROM?: string;
  // --- U2: Turnstile captcha (managed widget) -------------------------------
  TURNSTILE_SECRET_KEY?: string;
}

// The app's own deep-link scheme is always trusted: sessions must survive the
// native OAuth/verify round trip back into the app. Web origins are additive
// and come from env so staging/prod URLs never require a code change.
const APP_SCHEME = 'pusoynow://';

// Local Expo/web dev origins. Kept here so `wrangler dev` works out of the box
// without a TRUSTED_ORIGINS secret; production adds its origin via env.
const DEV_ORIGINS = ['http://localhost:8081', 'http://localhost:8095', 'http://localhost:19006'];

export function trustedOriginsFor(env: Env): string[] {
  const extra = (env.TRUSTED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [APP_SCHEME, ...DEV_ORIGINS, ...extra];
}

// Build the better-auth options for a request. Split out from `makeAuth` so
// tests can assert on the resolved config (trustedOrigins, rate limit) without
// standing up a D1 database.
export function authOptions(env: Env): BetterAuthOptions {
  return {
    database: {
      dialect: new D1Dialect({ database: env.DB }),
      type: 'sqlite',
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth',
    trustedOrigins: trustedOriginsFor(env),
    emailAndPassword: {
      enabled: true,
      // Passwords must be at least 8 chars; the client mirrors this rule so bad
      // input is rejected before any network call.
      minPasswordLength: 8,
      // U2 flips this to true and wires the verification email. Kept false in U1
      // so the health/scaffold round has a working sign-up path to smoke-test.
      requireEmailVerification: false,
    },
    session: {
      // 30-day sessions, refreshed when the user is active within a day of
      // expiry, so a returning player is not logged out mid-week.
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    // Database-backed rate limiting so limits are shared across the Worker's
    // isolates (in-memory would reset per isolate). Requires the `rateLimit`
    // table from the migration.
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
    },
    advanced: {
      // The app is served cross-site from the Worker origin, so session cookies
      // need SameSite=None; Secure to ride along on fetch/XHR.
      defaultCookieAttributes: {
        sameSite: 'none',
        secure: true,
        httpOnly: true,
      },
    },
  };
}

export function makeAuth(env: Env): ReturnType<typeof betterAuth> {
  return betterAuth(authOptions(env));
}
