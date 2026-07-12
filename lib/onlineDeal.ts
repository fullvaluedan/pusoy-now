// Pure builder for the online table's synthesized deal sequence, extracted so it
// can be unit-tested in node without react-native.
//
// The online client never receives the full 52-card deck -- the server redacts
// it, sending only the viewer's own 13 cards plus opponent hand counts. To still
// show the same dealing animation the bot table shows, the client synthesizes a
// plausible round-robin deal: the viewer's real cards arrive face-up in order,
// every opponent card is an unknown face-down placeholder. This module builds
// that ordered sequence; DealingAnimation consumes it.

import type { Card } from './pusoy/types';

// Should this client run the deal animation for the game it just observed?
// "Fresh" means the game just started FOR THIS VIEWER: their hand is a full
// untouched 13 while at most the opening play has landed. The <= 1 tolerance
// matters on real networks: the server paces the opening bot ~1-2s after
// auto-start, and a slow join can deliver a first snapshot where that bot has
// already led - still a brand new game, still deal. A true mid-game reconnect
// has a shorter hand or a deeper trick history and never deals. (Edge case: a
// reconnect within the very first trick while still holding 13 cards re-runs
// the deal; harmless, and strictly better than fresh games skipping it.)
export function isFreshStart(view: {
  playing: boolean;
  yourHandLength: number | null;
  trickHistoryLength: number;
}): boolean {
  return view.playing && view.yourHandLength === 13 && view.trickHistoryLength <= 1;
}

export interface OnlineDealStep {
  // The seat this card is dealt to.
  seat: number;
  // Face-up only for the viewer's own cards; opponents deal face-down.
  faceUp: boolean;
  // The real card for a face-up (viewer) step; null for a face-down opponent
  // step, whose value the client does not (and must not) know.
  card: Card | null;
}

// Build the round-robin deal order. Cards are dealt one at a time going seat
// 0, 1, 2, ... and wrapping, round by round, until every seat has received its
// count. The viewer's steps pull from `yourCards` in order (so the animation's
// accumulating face-up hand ends in the same order the server sent); opponent
// steps carry no card.
//
//   yourSeat    -- the viewer's seat index
//   yourCards   -- the viewer's real hand, in server order
//   seatCounts  -- cards to deal per seat, indexed by seat (viewer included)
export function buildOnlineDealOrder(
  yourSeat: number,
  yourCards: Card[],
  seatCounts: number[],
): OnlineDealStep[] {
  const steps: OnlineDealStep[] = [];
  const maxCount = seatCounts.length ? Math.max(...seatCounts) : 0;
  const yourQueue = yourCards.slice();
  for (let round = 0; round < maxCount; round++) {
    for (let seat = 0; seat < seatCounts.length; seat++) {
      if (round >= seatCounts[seat]) continue;
      const faceUp = seat === yourSeat;
      steps.push({ seat, faceUp, card: faceUp ? yourQueue.shift() ?? null : null });
    }
  }
  return steps;
}
