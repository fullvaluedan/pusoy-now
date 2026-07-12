-- Presence heartbeat (Round 7 U5): one row per device, the time it last
-- pinged. Home reads a rolling window over this table as an honest "Players
-- Online" count. No FK to `user` -- guests count too, and this table has
-- nothing to do with signed-in identity.
CREATE TABLE IF NOT EXISTS presence (
  deviceId TEXT PRIMARY KEY,
  lastSeen INTEGER NOT NULL
);
