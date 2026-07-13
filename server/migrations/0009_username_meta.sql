-- Username meta (rename allowance + avatar preference). Both columns hang off
-- the existing player_profile row (the table that holds the username), so a
-- user gets them the moment they claim a handle.
--
-- username_changes: how many RENAMES a user has spent. First claim does not
-- count (it inserts the row at 0); the one free rename bumps it to 1, after
-- which renameUsername refuses. Signed-in users only ever reach here (guests
-- cannot claim), so this cleanly caps the single allowed change.
--
-- avatar_pref: which avatar source the user prefers, or null to fall through to
-- the default precedence (social photo, then letter). Values:
--   'social'      use the linked account photo (user.image)
--   'letter'      always show the initial disc, even when a photo exists
--   'preset:<id>' a chosen preset avatar (art deferred; the id is stored now so
--                 the selection seam exists before the images land)

ALTER TABLE "player_profile" ADD COLUMN "username_changes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "player_profile" ADD COLUMN "avatar_pref" TEXT;
