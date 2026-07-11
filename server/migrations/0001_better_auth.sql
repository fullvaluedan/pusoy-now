-- better-auth core schema for D1 (SQLite dialect).
--
-- This mirrors what `better-auth generate` emits for a config with
-- emailAndPassword + database-backed rate limiting. It is hand-authored because
-- the D1 remote database is migrated through wrangler, not the better-auth CLI
-- (which drives a live DB connection the Worker's env binding can't provide at
-- CLI time). Column names and types match better-auth's expectations exactly;
-- changing them will break the adapter's queries.
--
-- Dates are declared `date` (NUMERIC affinity) but better-auth stores ISO
-- strings; booleans are `integer` (0/1). Do not "fix" these to match intuition.

CREATE TABLE IF NOT EXISTS "user" (
  "id" text NOT NULL PRIMARY KEY,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "emailVerified" integer NOT NULL,
  "image" text,
  "createdAt" date NOT NULL,
  "updatedAt" date NOT NULL
);

CREATE TABLE IF NOT EXISTS "session" (
  "id" text NOT NULL PRIMARY KEY,
  "expiresAt" date NOT NULL,
  "token" text NOT NULL UNIQUE,
  "createdAt" date NOT NULL,
  "updatedAt" date NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  "id" text NOT NULL PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" date,
  "refreshTokenExpiresAt" date,
  "scope" text,
  "password" text,
  "createdAt" date NOT NULL,
  "updatedAt" date NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id" text NOT NULL PRIMARY KEY,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expiresAt" date NOT NULL,
  "createdAt" date,
  "updatedAt" date
);

-- Database-backed rate limiting (rateLimit.storage = "database"). Shared across
-- Worker isolates so a burst can't slip past an in-memory per-isolate counter.
CREATE TABLE IF NOT EXISTS "rateLimit" (
  "id" text NOT NULL PRIMARY KEY,
  "key" text,
  "count" integer,
  "lastRequest" bigint
);
