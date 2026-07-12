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

// Suit strength for tiebreaks. Standard Pusoy Dos order, lowest to highest:
// clubs < spades < hearts < diamonds. That makes 2♦ the single highest card
// in the deck (the "bomb", unbeatable as a lead).
export const SUIT_VALUE: Record<Suit, number> = {
  C: 1,
  D: 4,
  H: 3,
  S: 2,
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

// Deal 13 cards to each of `n` players (2-4). Any leftover cards are dead
// (unused) — short-handed Pusoy Dos still deals full 13-card hands, so a 2p
// deal leaves 26 cards in the pile and a 3p deal leaves 13. Like dealFour,
// this deals round-robin and does NOT pre-sort (deal order is preserved).
export function dealN(deck: Card[], n: number): Card[][] {
  if (deck.length !== 52) {
    throw new Error(`dealN expected 52, got ${deck.length}`);
  }
  if (n < 2 || n > 4) {
    throw new Error(`dealN supports 2-4 players, got ${n}`);
  }
  const hands: Card[][] = Array.from({ length: n }, () => []);
  const total = 13 * n;
  for (let i = 0; i < total; i++) {
    hands[i % n].push(deck[i]);
  }
  return hands;
}

// Index of the hand holding the single lowest card (rank first, suit as
// tiebreak). Used to pick the opener when the 3 of clubs is not in play (it
// landed in the dead pile of a short-handed deal). The 3 of clubs is the
// globally lowest card, so when it is dealt this agrees with the 3-of-clubs
// opener rule.
export function lowestCardHolder(hands: Card[][]): number {
  let bestHand = 0;
  let bestRank = Infinity;
  let bestSuit = Infinity;
  for (let h = 0; h < hands.length; h++) {
    for (const card of hands[h]) {
      const r = RANK_VALUE[card.rank];
      const s = SUIT_VALUE[card.suit];
      if (r < bestRank || (r === bestRank && s < bestSuit)) {
        bestRank = r;
        bestSuit = s;
        bestHand = h;
      }
    }
  }
  return bestHand;
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
