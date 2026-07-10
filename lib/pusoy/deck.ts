// Deck + dealing for Pusoy Dos. Standard 52-card deck, 13 cards to each of 4 players.

import type { Card, Rank, Rng, Suit } from './types';

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

// Suit strength for tiebreaks. In the standard variant, 2♦ is the highest
// single (the "bomb" — unbeatable as a lead). So diamonds outrank the
// other suits at the 2 rank; for all other ranks, spades > hearts > clubs
// is the conventional order. To keep comparison simple and match Pusoy
// Dos rules used in the wild, we order: D > S > H > C.
export const SUIT_VALUE: Record<Suit, number> = {
  C: 1,
  D: 4, // 2♦ is the bomb; diamonds rank above the others.
  H: 2,
  S: 3,
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

// Fisher-Yates. Returns a NEW shuffled deck. Pass a seeded `rng` to make the
// deal reproducible (the win-rate harness deals the same 200 games to every
// difficulty level so the comparison is fair).
export function shuffle<T>(arr: T[], rng: Rng = Math.random): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
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
  // Note: do NOT pre-sort hands. The dealing animation relies on hands being
  // in deal order so the user sees the cards arrive in the order they were
  // dealt. The user can hit "Organize" to sort if they want.
  return hands;
}
