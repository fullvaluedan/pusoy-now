// Bot player logic. Given a hand and the current lead combo (or null if
// opening), pick a legal play (or pass if not allowed).
//
// There is one entry point, `botChoose`, and three difficulty policies behind
// it. Legality is decided once, by `findLegalPlays`, for every level. The
// levels differ only in how they *choose* among the legal plays, so difficulty
// is a scoring policy, not a separate engine.
//
//   easy    Uniform-random legal play, mildly biased toward shedding low
//           singles. Loses to anyone paying attention.
//   normal  The original heuristic: dump big combos on the opening, answer a
//           lead with the smallest combo that beats it. Wobbles onto the
//           2nd/3rd best play ~20% of the time so it doesn't feel robotic.
//   expert  Scores every legal play by combo preservation, card counting, and
//           endgame urgency. Wobbles only among near-tied scores.
//
// All randomness flows through the injected `rng`, so a decision is fully
// reproducible from a seed. That is what makes the bot tests deterministic.

import { detectCombo, canPlay } from './combo';
import type { Card, PlayedCombo, BotContext, BotOptions, Rank, Rng } from './types';
import { RANK_VALUE, SUIT_VALUE, buildDeck } from './deck';

// Chance that `normal` takes the 2nd or 3rd best play instead of the best.
const NORMAL_WOBBLE = 0.2;
// Chance that `expert` picks among plays whose scores are effectively tied.
const EXPERT_WOBBLE = 0.05;
// Scores within this distance of the best are treated as tied.
const NEAR_TIE = 1.5;
// How strongly `easy` leans toward shedding its low singles.
const EASY_LOW_BIAS = 1.5;

// --- expert scoring weights ---
//
// These were tuned against the seeded win-rate harness in `fullGameTest.ts`,
// not guessed. Two of them are counter-intuitive enough to be worth spelling
// out, because the obvious values make expert *weaker* than normal:
//
//  * EXPERT_LENGTH dominates every other term. Emptying the hand is the win
//    condition, so the combo class of a play matters more than which combo of
//    that class you pick. Everything below it is a tiebreak within a class.
//  * EXPERT_URGENT_CARDS is 1, not 2. Spending high cards to block only pays
//    when an opponent goes out on the very next trick they win. Firing the rule
//    at 2 cards costs roughly six points of win rate.
const EXPERT_LENGTH = 60;
// Cards stranded in a broken pair or trip, per card.
const EXPERT_BREAKAGE = 12;
// Holding a high card back, per rank step.
const EXPERT_RANK = 1;
// Extra cost of spending a 2 while the hand is still long. Without this the bot
// leads its 2 of diamonds, which `isUnbeatable` always reports as a free trick.
const EXPERT_RESERVE_TWO = 18;
const EXPERT_RESERVE_MIN_HAND = 4;
// Tempo gained by leading a card nothing can beat. Sized to beat the rank
// preference (so an unbeatable ace gets led) but not the reserve penalty (so
// the 2 of diamonds does not).
const EXPERT_LEAD_CONTROL = 20;
// An opponent holding this many cards or fewer goes out on their next trick.
const EXPERT_URGENT_CARDS = 1;
// While blocking, each rank step is worth this much instead of costing it.
const EXPERT_URGENT_RANK = 3;

function comboKey(c: PlayedCombo, lead: PlayedCombo | null): number {
  // We use a single numeric key to sort legal plays. The bot picks the play
  // with the LOWEST key (best play per the rules below).
  //
  // Opening play (lead is null): the bot wants to dump the strongest combos
  // first to free up the hand. So prefer 5-card hands, then trips, then
  // pairs, then singles. Within a length class, prefer the LOWEST rank so
  // the bot sheds bad cards.
  //
  // Responding to a lead: the bot has to match the lead's length, so
  // `findLegalPlays` already filters to legal combos. Among those, prefer
  // the LOWEST rank (smallest card that still beats the lead).
  if (lead === null) {
    // Higher combo class => lower key (sorts first). Within a class, lower
    // rank => lower key (sorts first).
    return -c.length * 100 + c.rankValue;
  }
  // Responding: same length is guaranteed by findLegalPlays. Lower rank =>
  // lower key (sorts first).
  return c.rankValue;
}

// The 2 of diamonds is the "bomb": as a lead single, only a 5-card combo can
// answer it. Every other single lead can only be answered by a single.
function isBombLead(lead: PlayedCombo | null): boolean {
  return (
    lead !== null &&
    lead.length === 1 &&
    lead.cards[0].rank === '2' &&
    lead.cards[0].suit === 'D'
  );
}

// Exported: the UI uses this to auto-pass and to highlight playable cards.
export function findLegalPlays(hand: Card[], lead: PlayedCombo | null): PlayedCombo[] {
  const out: PlayedCombo[] = [];
  // A play can only ever answer a lead of the same length (the bomb is the one
  // exception, where a 5-card combo answers a single). Skipping the subset
  // enumeration for lengths that cannot possibly be legal is a pure
  // optimization: `canPlay` would have rejected every one of them anyway. It
  // matters because the 5-card loop is C(13,5) = 1287 combos.
  const opening = lead === null;
  const bomb = isBombLead(lead);
  const wantSingles = opening || (!bomb && lead!.length === 1);
  const wantPairs = opening || (!bomb && lead!.length === 2);
  const wantTrips = opening || (!bomb && lead!.length === 3);
  const wantFives = opening || bomb || lead!.length === 5;

  if (wantSingles) {
    for (const c of hand) {
      const combo = detectCombo([c])!;
      if (canPlay(combo, lead)) out.push(combo);
    }
  }
  if (wantPairs) {
    for (let i = 0; i < hand.length; i++) {
      for (let j = i + 1; j < hand.length; j++) {
        if (hand[i].rank === hand[j].rank) {
          const combo = detectCombo([hand[i], hand[j]]);
          if (combo && canPlay(combo, lead)) out.push(combo);
        }
      }
    }
  }
  if (wantTrips) {
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
  }
  // 5-card combos: enumerate every 5-subset of hand, check if it forms a legal
  // playable. For a 13-card hand that's C(13,5) = 1287 — fine.
  if (wantFives && hand.length >= 5) {
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

export function botChoose(
  hand: Card[],
  lead: PlayedCombo | null,
  opts: BotOptions = {},
): PlayedCombo | null {
  const level = opts.level ?? 'normal';
  const rng = opts.rng ?? Math.random;
  const context = opts.context ?? {};

  const legal = findLegalPlays(hand, lead);
  if (legal.length === 0) return null; // must pass
  if (legal.length === 1) return legal[0];

  if (level === 'easy') return chooseEasy(legal, rng);
  if (level === 'expert') return chooseExpert(hand, lead, legal, rng, context);
  return chooseNormal(legal, lead, rng);
}

// --- easy ----------------------------------------------------------------

// Pick uniformly at random, except low singles get extra weight so the easy bot
// tends to dump its junk early and strand its high cards. That is roughly how a
// beginner plays, and it is what makes easy beatable.
function chooseEasy(legal: PlayedCombo[], rng: Rng): PlayedCombo {
  const maxRank = RANK_VALUE['2'];
  const weights = legal.map((c) =>
    c.length === 1 ? 1 + ((maxRank - c.rankValue) / maxRank) * EASY_LOW_BIAS : 1,
  );
  return weightedPick(legal, weights, rng);
}

function weightedPick<T>(items: T[], weights: number[], rng: Rng): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// --- normal --------------------------------------------------------------

function chooseNormal(legal: PlayedCombo[], lead: PlayedCombo | null, rng: Rng): PlayedCombo {
  const sorted = legal.slice().sort((a, b) => comboKey(a, lead) - comboKey(b, lead));
  if (rng() < NORMAL_WOBBLE) {
    // Take the 2nd or 3rd best play instead of the best.
    const span = Math.min(2, sorted.length - 1);
    return sorted[1 + Math.floor(rng() * span)];
  }
  return sorted[0];
}

// --- expert --------------------------------------------------------------

function rankCounts(cards: Card[]): Map<Rank, number> {
  const m = new Map<Rank, number>();
  for (const c of cards) m.set(c.rank, (m.get(c.rank) ?? 0) + 1);
  return m;
}

// How many cards this play strands. Peeling one card off a pair leaves a lone
// card that can no longer answer a pair lead; peeling one off a trip leaves
// two. Returns the number of cards left behind in a broken group.
//
// `have` is the rank census of the whole hand, passed in because it is the same
// for every candidate play of a decision.
function breakagePenalty(have: Map<Rank, number>, play: PlayedCombo): number {
  const taken = rankCounts(play.cards);
  let penalty = 0;
  for (const [rank, n] of taken) {
    const total = have.get(rank) ?? 0;
    if (total >= 2 && n < total) penalty += total - n;
  }
  return penalty;
}

// Every card that is neither in our hand nor already face-up on the table. This
// is exactly what a human counting cards would be able to infer.
function unseenCards(hand: Card[], played: Card[]): Card[] {
  const seen = new Set<string>();
  for (const c of hand) seen.add(c.id);
  for (const c of played) seen.add(c.id);
  return buildDeck().filter((c) => !seen.has(c.id));
}

// True when nothing an opponent could still be holding beats this play, so
// playing it wins the trick outright and hands us the next lead.
//
// Only checked for singles, pairs, and trips: the opposing 5-card combos number
// in the hundreds of thousands, and a 5-card hand is rarely unbeatable anyway.
// `canPlay` carries the 2-of-diamonds bomb rule, so we defer to it.
function isUnbeatable(play: PlayedCombo, unseen: Card[]): boolean {
  if (play.length === 1) {
    return !unseen.some((c) => canPlay(detectCombo([c])!, play));
  }
  if (play.length === 2 || play.length === 3) {
    const byRank = new Map<Rank, Card[]>();
    for (const c of unseen) {
      const list = byRank.get(c.rank) ?? [];
      list.push(c);
      byRank.set(c.rank, list);
    }
    for (const cards of byRank.values()) {
      if (cards.length < play.length) continue;
      // The strongest combo of a rank uses its highest suits, so check that one.
      const strongest = cards
        .slice()
        .sort((a, b) => SUIT_VALUE[b.suit] - SUIT_VALUE[a.suit])
        .slice(0, play.length);
      const combo = detectCombo(strongest);
      if (combo && canPlay(combo, play)) return false;
    }
    return true;
  }
  return false;
}

function chooseExpert(
  hand: Card[],
  lead: PlayedCombo | null,
  legal: PlayedCombo[],
  rng: Rng,
  ctx: BotContext,
): PlayedCombo {
  const played = ctx.playedCards ?? [];
  const sizes = ctx.handSizes ?? [];
  // Is an opponent about to go out on the next trick they win?
  const shortOpponent = sizes.some(
    (n, seat) => seat !== ctx.seat && n > 0 && n <= EXPERT_URGENT_CARDS,
  );
  // (c) Endgame urgency only applies when we are answering a lead: the point is
  // to deny the short opponent this trick. When *leading*, dumping high cards
  // just burns them, so the ordinary "hold them back" preference still rules.
  const blocking = shortOpponent && lead !== null;
  // Computed once per decision, not once per candidate play.
  const unseen = lead === null ? unseenCards(hand, played) : [];
  const handCounts = rankCounts(hand);

  const scored = legal.map((play) => {
    // Emptying the hand is the win condition, so the combo class of the play
    // outweighs everything else. The terms below only break ties within a class.
    let score = play.length * EXPERT_LENGTH;

    // (a) Combo preservation: prefer the play that strands the fewest cards in
    // a half-broken pair or trip. Notably this stops the bot shattering a pair
    // to answer a single when a lone single would have done.
    score -= breakagePenalty(handCounts, play) * EXPERT_BREAKAGE;

    if (blocking) {
      // Spend the big cards now: they are worthless the moment someone goes out.
      score += play.rankValue * EXPERT_URGENT_RANK;
    } else {
      // Otherwise hold the high cards back for later tricks, and treat the 2s
      // as the trick-winners of last resort while the hand is still long.
      score -= play.rankValue * EXPERT_RANK;
      if (play.rankValue === RANK_VALUE['2'] && hand.length > EXPERT_RESERVE_MIN_HAND) {
        score -= EXPERT_RESERVE_TWO;
      }
      // (b) Card counting: once every card that could beat this one is face-up,
      // leading it wins the trick and hands us the next lead for free.
      if (lead === null && isUnbeatable(play, unseen)) score += EXPERT_LEAD_CONTROL;
    }

    return { play, score };
  });

  let best = -Infinity;
  for (const s of scored) if (s.score > best) best = s.score;

  const nearTies = scored.filter((s) => best - s.score <= NEAR_TIE);
  if (nearTies.length > 1 && rng() < EXPERT_WOBBLE) {
    return nearTies[Math.floor(rng() * nearTies.length)].play;
  }
  // Deterministic otherwise: top score, breaking exact ties the way `normal`
  // would so the choice never depends on enumeration order.
  const top = scored.filter((s) => s.score === best);
  top.sort((a, b) => comboKey(a.play, lead) - comboKey(b.play, lead));
  return top[0].play;
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
