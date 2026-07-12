-- Friends + rankable stats (U4).
--
-- Friendship is keyed on the ordered pair (a_user_id < b_user_id) so a
-- relationship has exactly one row regardless of who initiated it. status is
-- 'pending' until accepted; requested_by records the initiator, so the OTHER
-- party is the only one who may accept or decline (this is what makes the IDOR
-- guard enforceable: you cannot accept a request you sent).
CREATE TABLE IF NOT EXISTS "friendship" (
  "a_user_id" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "b_user_id" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "status" text NOT NULL,          -- 'pending' | 'accepted'
  "requested_by" text NOT NULL,    -- user id of the initiator
  "created_at" integer NOT NULL,
  "updated_at" integer NOT NULL,
  PRIMARY KEY ("a_user_id", "b_user_id")
);

-- Rows are queried "either side" (all friendships touching a user), so the a
-- side is the primary key prefix and the b side gets its own index.
CREATE INDEX IF NOT EXISTS "friendship_b_idx" ON "friendship" ("b_user_id");

-- Cumulative per-user stats (U4). One row per user; totals only ever grow
-- (monotonic upsert - a push with a lower game count is ignored). firsts =
-- total 1st-place finishes, the primary ranking key (win-rate breaks ties).
CREATE TABLE IF NOT EXISTS "player_stats" (
  "user_id" text NOT NULL PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  "games" integer NOT NULL DEFAULT 0,
  "firsts" integer NOT NULL DEFAULT 0,
  "seconds" integer NOT NULL DEFAULT 0,
  "thirds" integer NOT NULL DEFAULT 0,
  "fourths" integer NOT NULL DEFAULT 0,
  "updated_at" integer NOT NULL
);
