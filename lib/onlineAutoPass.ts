// Pure decision logic for the online table's auto-pass, extracted so it can be
// unit-tested in node without react-native (matching the repo convention that
// test files never import a react-native module).
//
// The headline multiplayer behavior gap: when it is your turn, a lead is on the
// table, and nothing in your hand can legally beat it, the turn must pass
// automatically -- the same courtesy the bot table gives (app/game-local.tsx).
// The screen effect owns the 1400ms banner + send; this module owns the two
// pure pieces the effect needs: the decision and a stable turn identity.

// Whether the online table should begin an auto-pass right now.
//
//   isMyTurn       -- it is the viewer's turn to act
//   lead           -- the current lead combo, or null when the viewer is leading
//                     (leading means anything is playable, so never auto-pass)
//   legalPlayCount -- number of legal plays available, or null when it is not
//                     the viewer's turn / the hand is unknown
//   connected      -- the socket is live (never auto-pass while reconnecting or
//                     closed: the send would be dropped and the server clock,
//                     not the client, should drive a timeout in that state)
export function shouldAutoPass(params: {
  isMyTurn: boolean;
  lead: unknown | null;
  legalPlayCount: number | null;
  connected: boolean;
}): boolean {
  const { isMyTurn, lead, legalPlayCount, connected } = params;
  if (!connected) return false;
  if (!isMyTurn) return false;
  // Leading: no lead to beat, so there is always a legal play (any card).
  if (lead == null) return false;
  // Not our turn / hand unknown -> no decision.
  if (legalPlayCount == null) return false;
  return legalPlayCount === 0;
}

// A stable identity for the current turn instance. The auto-pass effect latches
// this so a single turn fires at most one pass, even across the re-renders a
// slow server ack causes: while the view is unchanged the key is unchanged, so
// the already-fired latch holds. It only changes when the turn genuinely moves
// on -- a different seat is to act, or a fresh turn instance began.
//
// Keyed on the server's `turnDeadline`, NOT on trickHistory length: the server
// caps trickHistory at 8 entries, so past 8 plays in a hand the length stops
// changing and a length-based key would collide across later turns, wedging the
// once-per-turn latch so no further forced pass ever fires. turnDeadline is set
// fresh by the server on every turn, so it is unique per turn instance and never
// degenerates.
export function autoPassTurnKey(
  seat: number | null,
  turnDeadline: number | null,
): string {
  return `${seat ?? 'none'}:${turnDeadline ?? 'none'}`;
}
