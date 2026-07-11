-- Anonymous guest sessions (Round 7, U1). better-auth's `anonymous` plugin
-- stores an `isAnonymous` flag on the user row so guest sessions can be told
-- apart from real accounts (the marketing-consent prompt is skipped for them,
-- and the row is deleted once a guest links a real account). This repo never
-- runs better-auth's own migrator, so the column is added by hand here, matching
-- the plugin's schema (type boolean -> INTEGER, default false -> 0).
ALTER TABLE user ADD COLUMN isAnonymous INTEGER NOT NULL DEFAULT 0;
