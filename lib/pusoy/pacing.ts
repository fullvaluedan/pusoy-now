// Shared bot-turn pacing. Both the local bot table (lib/pusoy/localGame.ts) and
// the online table (the GameRoom Durable Object, via server/src/roomLogic.ts +
// room.ts) import these so a paced bot turn feels identical in both modes: the
// bot's icon highlights, it takes a human-like moment, then its play lands as
// its own frame.

export const BOT_MIN_DELAY_MS = 900;
// Capped at 2s: a bot turn must never feel like waiting.
export const BOT_MAX_DELAY_MS = 2_000;
// A forced pass (nothing in hand can beat the lead - e.g. the 2 of diamonds
// bomb, or a 5-card lead against a hand of fewer than 5 cards) needs no
// thinking, so it resolves almost instantly instead of faking deliberation.
// Online, a disconnected human's auto-pass uses this same short delay.
export const BOT_FORCED_PASS_MS = 250;
// Server backstop for a CONNECTED human with no legal play. The client
// auto-passes for them at 1400ms (with the "No playable hand" banner); this
// fires only if that client never acts (backgrounded tab, dead app), so the
// table keeps moving without waiting out the full 30s deadline.
export const HUMAN_FORCED_PASS_MS = 2_500;
// Extra delay added to the FIRST auto action of a fresh online hand, so every
// client can run its dealing animation before the opening bot leads. Without
// it the opener plays 0.9-2s after start, racing the deal overlay (and a slow
// join could even receive its first snapshot mid-trick).
export const ONLINE_DEAL_GRACE_MS = 4_500;
