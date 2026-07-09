// Combo detection + comparison for Pusoy Dos.
//
// Rules (canonical Filipino variant, 4 players):
//   1) Singles, Pairs, Three-of-a-Kind — compare by rank, suit tiebreak.
//   2) 5-card hands:
//        straight      5 consecutive ranks
//        flush         5 same-suit (NOT straight)
//        full house    3 + 2
//        four of a kind 4 + 1 kicker (kicker only matters for tiebreak between 4-of-a-kinds)
//        straight flush 5 consecutive same suit
//   3) Higher combo class always beats lower (a flush > a full house, a straight > a three-of-a-kind).
//   4) Within the same combo class, compare by rank.
//   5) Wild cards are NOT used in the standard variant implemented here.

import type { Card, ComboType, FiveCardType, PlayedCombo, Rank, Suit } from './types';
import { RANK_VALUE, SUIT_VALUE } from './deck';

export const FIVE_TYPES: FiveCardType[] = [
  'straightFlush',
  'fourOfAKind',
  'fullHouse',
  'flush',
  'straight',
];

// Strength order: higher index = stronger combo class.
const TYPE_STRENGTH: Record<ComboType, number> = {
  single: 1,
  pair: 2,
  threeOfAKind: 3,
  fiveCard: 4,
};

const FIVE_TYPE_STRENGTH: Record<FiveCardType, number> = {
  straight: 1,
  flush: 2,
  fullHouse: 3,
  fourOfAKind: 4,
  straightFlush: 5,
};

function sortCards(cards: Card[]): Card[] {
  return cards.slice().sort((a, b) => {
    const r = RANK_VALUE[a.rank] - RANK_VALUE[b.rank];
    if (r !== 0) return r;
    return SUIT_VALUE[a.suit] - SUIT_VALUE[b.suit];
  });
}

function isFlush(cards: Card[]): boolean {
  const s = cards[0].suit;
  return cards.every((c) => c.suit === s);
}

function isStraight(cards: Card[]): boolean {
  const sorted = sortCards(cards);
  for (let i = 1; i < sorted.length; i++) {
    if (RANK_VALUE[sorted[i].rank] !== RANK_VALUE[sorted[i - 1].rank] + 1) {
      return false;
    }
  }
  return true;
}

function rankCounts(cards: Card[]): Map<Rank, number> {
  const m = new Map<Rank, number>();
  for (const c of cards) m.set(c.rank, (m.get(c.rank) ?? 0) + 1);
  return m;
}

// Detect a 5-card hand. Returns null if not a legal 5-card combo.
export function detectFiveCard(cards: Card[]): PlayedCombo | null {
  if (cards.length !== 5) return null;
  const counts = rankCounts(cards);
  const values = [...counts.values()].sort((a, b) => b - a);
  const flush = isFlush(cards);
  const straight = isStraight(cards);

  // straight flush beats everything
  if (flush && straight) {
    return {
      type: 'fiveCard',
      fiveType: 'straightFlush',
      cards: sortCards(cards),
      length: 5,
      rankValue: RANK_VALUE[sortCards(cards)[4].rank],
    };
  }
  // four of a kind (4+1)
  if (values[0] === 4) {
    const fourRank = [...counts.entries()].find(([, n]) => n === 4)![0];
    return {
      type: 'fiveCard',
      fiveType: 'fourOfAKind',
      cards: sortCards(cards),
      length: 5,
      rankValue: RANK_VALUE[fourRank],
    };
  }
  // full house (3+2)
  if (values[0] === 3 && values[1] === 2) {
    const tripRank = [...counts.entries()].find(([, n]) => n === 3)![0];
    return {
      type: 'fiveCard',
      fiveType: 'fullHouse',
      cards: sortCards(cards),
      length: 5,
      rankValue: RANK_VALUE[tripRank],
    };
  }
  // flush
  if (flush) {
    return {
      type: 'fiveCard',
      fiveType: 'flush',
      cards: sortCards(cards),
      length: 5,
      rankValue: RANK_VALUE[sortCards(cards)[4].rank],
      suitValue: SUIT_VALUE[cards[0].suit],
    };
  }
  // straight
  if (straight) {
    return {
      type: 'fiveCard',
      fiveType: 'straight',
      cards: sortCards(cards),
      length: 5,
      rankValue: RANK_VALUE[sortCards(cards)[4].rank],
    };
  }
  return null;
}

// Detect any combo from a hand. Returns null if cards don't form a legal combo.
export function detectCombo(cards: Card[]): PlayedCombo | null {
  if (cards.length === 0) return null;
  if (cards.length === 1) {
    const c = cards[0];
    return {
      type: 'single',
      cards: [c],
      length: 1,
      rankValue: RANK_VALUE[c.rank],
      suitValue: SUIT_VALUE[c.suit],
    };
  }
  if (cards.length === 2) {
    if (cards[0].rank !== cards[1].rank) return null;
    const sorted = sortCards(cards);
    return {
      type: 'pair',
      cards: sorted,
      length: 2,
      rankValue: RANK_VALUE[sorted[1].rank],
      suitValue: SUIT_VALUE[sorted[1].suit],
    };
  }
  if (cards.length === 3) {
    if (cards[0].rank !== cards[1].rank || cards[1].rank !== cards[2].rank) return null;
    const sorted = sortCards(cards);
    return {
      type: 'threeOfAKind',
      cards: sorted,
      length: 3,
      rankValue: RANK_VALUE[sorted[2].rank],
      suitValue: SUIT_VALUE[sorted[2].suit],
    };
  }
  if (cards.length === 4) {
    // 4-card hands are NOT legal in Pusoy Dos.
    return null;
  }
  return detectFiveCard(cards);
}

// Compare two combos. Returns positive if a beats b, negative if b beats a, 0 if equal.
//  - Combos of different lengths or incompatible classes cannot be compared as "beats".
//  - A 5-card combo (length 5) can only be beaten by another 5-card combo of the same class.
export function compareCombos(a: PlayedCombo, b: PlayedCombo): number {
  // singles/pairs/threes: same length class, compare rank then suit
  if (a.length !== 5 && b.length !== 5) {
    if (a.length !== b.length) {
      // different non-5 lengths are not legal matchups; higher length is not "stronger" in pusoy,
      // but to keep this pure: return length diff as a deterministic ordering.
      return a.length - b.length;
    }
    if (a.rankValue !== b.rankValue) return a.rankValue - b.rankValue;
    return (a.suitValue ?? 0) - (b.suitValue ?? 0);
  }
  // both 5-card hands
  if (a.fiveType !== b.fiveType) {
    return FIVE_TYPE_STRENGTH[a.fiveType!] - FIVE_TYPE_STRENGTH[b.fiveType!];
  }
  // same five-card class
  if (a.rankValue !== b.rankValue) return a.rankValue - b.rankValue;
  if (a.fiveType === 'flush' && a.suitValue !== undefined && b.suitValue !== undefined) {
    return a.suitValue - b.suitValue;
  }
  return 0;
}

// Can `play` legally follow `lead`?
//  - A 5-card combo can only be beaten by another 5-card combo.
//  - For singles/pairs/threes, the played combo must be the same length and higher rank.
//  - If `lead` is null, anything goes.
export function canPlay(play: PlayedCombo, lead: PlayedCombo | null): boolean {
  if (lead === null) return true;
  if (play.length === 5 && lead.length === 5) {
    return compareCombos(play, lead) > 0;
  }
  if (play.length === 5 || lead.length === 5) return false;
  if (play.length !== lead.length) return false;
  return compareCombos(play, lead) > 0;
}
