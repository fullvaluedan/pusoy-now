-- Per-game results for head-to-head (Round 9, U3).
--
-- One game_result row per finished online game with 2+ humans, plus one
-- game_result_player row per seated human recording their finishing place.
-- Together these let head-to-head be computed pairwise: for each gameId two
-- players shared, whoever placed lower (place is 1 = best) beat the other.
--
-- Deliberately NO foreign key to user: results must survive account deletion
-- (an opponent deleting their account leaves the historical record intact as an
-- orphaned, anonymous userId). Both writes are INSERT OR IGNORE keyed on their
-- primary keys, so re-running the finish path (an alarm retry) records the game
-- exactly once.
CREATE TABLE IF NOT EXISTS "game_result" (
  "gameId" text NOT NULL PRIMARY KEY,
  "code" text NOT NULL,
  "finishedAt" integer NOT NULL
);

CREATE TABLE IF NOT EXISTS "game_result_player" (
  "gameId" text NOT NULL,
  "userId" text NOT NULL,
  "place" integer NOT NULL,
  PRIMARY KEY ("gameId", "userId")
);

-- Head-to-head joins this table to itself on gameId and filters the second side
-- by the caller's friend ids, so the friend side needs its own index.
CREATE INDEX IF NOT EXISTS "game_result_player_user_idx" ON "game_result_player" ("userId");
