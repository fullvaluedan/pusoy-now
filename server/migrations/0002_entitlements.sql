-- Entitlements + Stripe webhook idempotency (U5).
--
-- These are the app's own tables, not better-auth's, so timestamps are plain
-- integer epoch-ms (simpler than better-auth's date affinity). One entitlement
-- row per user; premiumUntil null means never premium.

CREATE TABLE IF NOT EXISTS "entitlement" (
  "userId" text NOT NULL PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  "premiumUntil" integer,
  "updatedAt" integer NOT NULL
);

-- Every processed Stripe event id, so retries of the same webhook are no-ops.
-- INSERT OR IGNORE against this table is the idempotency guarantee.
CREATE TABLE IF NOT EXISTS "stripe_event" (
  "id" text NOT NULL PRIMARY KEY,
  "processedAt" integer NOT NULL
);
