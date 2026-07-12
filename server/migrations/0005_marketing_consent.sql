-- Marketing email consent (U3): one row per user recording their current
-- opt-in choice for game-update/event emails. Captured at signup (unchecked
-- box - pre-ticked consent is not lawful in the EU/UK/Canada) or via a
-- one-time post-sign-in prompt for social-login users. Re-submitting a choice
-- overwrites this row rather than piling up history; the export query in
-- docs/DEPLOY.md reads it directly to build the mailing list.
CREATE TABLE IF NOT EXISTS marketing_consent (
  userId TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  optIn INTEGER NOT NULL,
  source TEXT NOT NULL,
  updatedAt INTEGER NOT NULL
);
