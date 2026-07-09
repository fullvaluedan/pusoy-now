// Bot player logic. Given a hand and the current lead combo (or null if
// opening), pick a legal play (or pass if not allowed).
//
// Strategy:
//   - On opening: play a low single to dump bad cards. Prefer a single of the
//     lowest rank in hand.
//   - If we can beat the lead with a SINGLE: do so with the smallest single
//     that beats it. Save higher cards for later.
//   - If we can beat the lead with a PAIR: do so with the smallest pair that
//     beats it.
//   - If we can beat the lead with a THREE-OF-A-KIND: do so with the smallest.
//   - If we can beat the lead with a 5-CARD combo: do so with the smallest
//     higher-ranked one.
//   - If we can't beat the lead: pass.
//
// The bot does NOT do multi-trick planning (e.g. "save this straight for the
// next hand"). That can be added later. The current behavior is good enough
// to feel like a competent casual player.

import { detectCombo, canPlay } from './combo';
import type { Card, PlayedCombo } from './types';
import { RANK_VALUE, SUIT_VALUE } from './deck';

function comboKey(c: PlayedCombo): number {
  // lower is better (we want to discard the weakest combo first)
  // primary: rankValue, secondary: length (shorter is "weaker" usually but for
  // 5-card hands longer is stronger). We collapse to a single sort key.
  if (c.length === 5) {
    // for 5-card hands, weight by fiveType strength then rank
    const fiveWeight =
      { straight: 1, flush: 2, fullHouse: 3, fourOfAKind: 4, straightFlush: 5 }[
        c.fiveType!
      ] * 100;
    return c.rankValue + fiveWeight;
  }
  return c.rankValue;
}

function findLegalPlays(hand: Card[], lead: PlayedCombo | null): PlayedCombo[] {
  const out: PlayedCombo[] = [];
  // Singles
  for (const c of hand) {
    const combo = detectCombo([c])!;
    if (canPlay(combo, lead)) out.push(combo);
  }
  // Pairs
  for (let i = 0; i < hand.length; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      if (hand[i].rank === hand[j].rank) {
        const combo = detectCombo([hand[i], hand[j]]);
        if (combo && canPlay(combo, lead)) out.push(combo);
      }
    }
  }
  // Three of a kind
  for (let i = 0; i < hand.length; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      for (let k = j + 1; k < hand.length; k++) {
        if (hand[i].rank === hand[j].rank && hand[j].rank === hand[k].rank) {
          const combo = detectCombo([hand[i], hand[j], hand[k]]);
          if (combo && canPlay(combo, lead)) out.push(combo);
        }
      }
    }
  }
  // 5-card combos: enumerate every 5-subset of hand, check if it forms a legal
  // playable. For a 13-card hand that's C(13,5) = 1287 — fine.
  if (hand.length >= 5) {
    for (let a = 0; a < hand.length; a++)
      for (let b = a + 1; b < hand.length; b++)
        for (let c = b + 1; c < hand.length; c++)
          for (let d = c + 1; d < hand.length; d++)
            for (let e = d + 1; e < hand.length; e++) {
              const combo = detectCombo([hand[a], hand[b], hand[c], hand[d], hand[e]]);
              if (combo && canPlay(combo, lead)) out.push(combo);
            }
  }
  return out;
}

export function botChoose(hand: Card[], lead: PlayedCombo | null): PlayedCombo | null {
  const legal = findLegalPlays(hand, lead);
  if (legal.length === 0) return null; // must pass

  // Sort by comboKey ascending: prefer the weakest legal play.
  legal.sort((a, b) => comboKey(a) - comboKey(b));

  // Small randomness: occasionally pick a non-optimal but legal play so the
  // bot doesn't feel robotic.
  const idx = Math.random() < 0.1 && legal.length > 1 ? 1 : 0;
  return legal[idx];
}

// Heuristic: how good is this hand? Used for the bot's "aggression" level
// in future. Higher = stronger. Currently unused.
export function handStrength(hand: Card[]): number {
  let s = 0;
  for (const card of hand) {
    s += RANK_VALUE[card.rank];
    s += SUIT_VALUE[card.suit] * 0.1;
  }
  return s;
}
