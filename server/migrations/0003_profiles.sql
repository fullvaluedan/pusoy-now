-- Usernames (U3): the stable, unique social handle used to add friends and to
-- rank. Separate from the better-auth display name (user.name) and avatar
-- (user.image) - those come from the social providers and collide, so they are
-- not the social handle. Usernames are lowercase [a-z0-9_], 3-20 chars,
-- validated in the Worker; the DB guarantees uniqueness. Names/avatars for
-- friend and ranking lists are read by JOINing the better-auth "user" row.

CREATE TABLE IF NOT EXISTS "player_profile" (
  "user_id" text NOT NULL PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  "username" text NOT NULL,
  "created_at" integer NOT NULL,
  "updated_at" integer NOT NULL
);

-- Case-insensitive uniqueness. Usernames are lowercased before storage, so a
-- plain unique index is enough; NOCASE is belt-and-suspenders against any
-- future writer that forgets to normalize.
CREATE UNIQUE INDEX IF NOT EXISTS "player_profile_username_unique"
  ON "player_profile" ("username" COLLATE NOCASE);
