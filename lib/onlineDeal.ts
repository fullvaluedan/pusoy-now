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
