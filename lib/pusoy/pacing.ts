// Shared bot-turn pacing. Both the local bot table (lib/pusoy/localGame.ts) and
// the online table (the GameRoom Durable Object, via server/src/roomLogic.ts +
// room.ts) import these so a paced bot turn feels identical in both modes: the
// bot's icon highlights, it takes a human-like moment, then its play lands as
// its own frame.

export const BOT_MIN_DELAY_MS = 900;
export const BOT_MAX_DELAY_MS = 2_400;
// A forced pass (nothing in hand can beat the lead - e.g. the 2 of diamonds
// bomb, or a 5-card lead against a hand of fewer than 5 cards) needs no
// thinking, so it resolves almost instantly instead of faking deliberation.
// Online, a disconnected human's auto-pass uses this same short delay.
export const BOT_FORCED_PASS_MS = 250;
