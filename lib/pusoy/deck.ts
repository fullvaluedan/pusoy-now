// Deck + dealing for Pusoy Dos. Standard 52-card deck, 13 cards to each of 4 players.

import type { Card, Rank, Suit } from './types';

const SUITS: Suit[] = ['C', 'D', 'H', 'S'];
const RANKS: Rank[] = [
  '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2',
];

// Rank strength for natural comparison. 2 is highest, 3 is lowest.
// Note: this is for the 3-of-a-kind / single / pair base rank. Straights and
// flushes are ranked by their highest card using the same scale.
export const RANK_VALUE: Record<Rank, number> = RANKS.reduce(
  (acc, r, i) => ({ ...acc, [r]: i + 1 }),
  {} as Record<Rank, number>,
);

// Suit strength for tiebreaks. Spades > Hearts > Diamonds > Clubs.
// Used only when same rank + same length.
export const SUIT_VALUE: Record<Suit, number> = {
  C: 1,
  D: 2,
  H: 3,
  S: 4,
};

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) {
    for (const r of RANKS) {
      deck.push({ id: `${s}-${r}`, suit: s, rank: r });
    }
  }
  return deck;
}

// Fisher-Yates. Returns a NEW shuffled deck.
export function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function dealFour(deck: Card[]): Card[][] {
  if (deck.length !== 52) {
    throw new Error(`dealFour expected 52, got ${deck.length}`);
  }
  const hands: Card[][] = [[], [], [], []];
  for (let i = 0; i < deck.length; i++) {
    hands[i % 4].push(deck[i]);
  }
  // sort each hand by rank ascending, then suit ascending
  for (const h of hands) {
    h.sort((a, b) => {
      const r = RANK_VALUE[a.rank] - RANK_VALUE[b.rank];
      if (r !== 0) return r;
      return SUIT_VALUE[a.suit] - SUIT_VALUE[b.suit];
    });
  }
  return hands;
}
