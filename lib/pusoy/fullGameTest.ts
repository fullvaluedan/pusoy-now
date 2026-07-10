// End-to-end game test: deal a real deck, then have 4 bot players play
// against each other using the same engine the UI uses. Verify the hand
// completes with a sensible finish order and the API surface (applyAction,
// handFinishOrder) is consistent.
//
// Then the difficulty harness: 200 seeded games of expert vs easy. This is the
// evidence for R13 ("expert is measurably stronger"). Every deal and every bot
// decision runs off a seeded rng, so the win rate below is reproducible, not a
// sample that drifts run to run.

import { buildDeck, dealFour, shuffle } from './deck';
import { applyAction, isHandOver, newHand, handFinishOrder } from './engine';
import { botChoose } from './bot';
import { makeRng } from './rng';
import type { BotLevel, Card, Rng } from './types';

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, info?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}`, info ?? '');
  }
}

const MAX_ITER = 400;

// Play one hand to completion with a bot in every seat. Returns the finish
// order (seat indexes, first to empty first), or null if the hand deadlocked.
function simulateHand(levels: BotLevel[], rng: Rng): number[] | null {
  const hands = dealFour(shuffle(buildDeck(), rng));
  let hs = newHand('sim', ['p0', 'p1', 'p2', 'p3'], hands, 1, 'h1', { turnMs: null });

  // Public information the expert bot is allowed to count.
  const playedCards: Card[] = [];

  let iter = 0;
  while (!isHandOver(hs) && iter < MAX_ITER) {
    iter++;
    const seat = hs.currentPlayerIndex;
    if (hs.finishedOrder.includes(seat)) break;
    const hand = hands[seat];
    const choice = botChoose(hand, hs.leadCombo, {
      level: levels[seat],
      rng,
      context: { seat, playedCards, handSizes: hands.map((h) => h.length) },
    });
    if (choice) {
      hs = applyAction(hs, seat, hand, { kind: 'play', combo: choice });
      hands[seat] = hand.filter((c) => !choice.cards.find((pc) => pc.id === c.id));
      playedCards.push(...choice.cards);
    } else {
      hs = applyAction(hs, seat, hand, { kind: 'pass' });
    }
  }
  if (!isHandOver(hs)) return null;
  return handFinishOrder(hs);
}

// --- 1) single full game, all normal bots --------------------------------

console.log('full game simulation');
const deck = buildDeck();
const hands = dealFour(deck);

let hs = newHand('test-game', ['p0', 'p1', 'p2', 'p3'], hands, 1, 'h1');
ok('deal: 13 cards each', hands.every((h) => h.length === 13));

const gameRng = makeRng(1);
let iter = 0;
const maxIter = 200;
while (!isHandOver(hs) && iter < maxIter) {
  iter++;
  const seat = hs.currentPlayerIndex;
  if (hs.finishedOrder.includes(seat)) break;
  const hand = hands[seat];
  const choice = botChoose(hand, hs.leadCombo, { level: 'normal', rng: gameRng });
  try {
    if (choice) {
      hs = applyAction(hs, seat, hand, { kind: 'play', combo: choice });
      // remove played cards from local hand copy
      hands[seat] = hand.filter(
        (c) => !choice.cards.find((pc) => pc.id === c.id),
      );
    } else {
      hs = applyAction(hs, seat, hand, { kind: 'pass' });
    }
  } catch (e) {
    fail++;
    console.log(`  FAIL iter ${iter} seat ${seat}:`, (e as Error).message);
    break;
  }
}

ok('simulation terminated', iter < maxIter);
ok('hand is over', isHandOver(hs));
const order = handFinishOrder(hs);
ok('finish order has 4 entries', order.length === 4);
ok(
  'finish order is a permutation of [0,1,2,3]',
  order.slice().sort().join(',') === '0,1,2,3',
);
ok('hands are empty for finishers', order.slice(0, order.length - 1).every((s) => hands[s].length === 0));
ok('loser still has cards', hands[order[order.length - 1]].length > 0);

// Stats sanity: a full 52 cards were played
const totalCardsLeft = hands.reduce((a, h) => a + h.length, 0);
ok('loser has between 1 and 13 cards', totalCardsLeft >= 1 && totalCardsLeft <= 13, { totalCardsLeft });

console.log(`finish order: ${order.join(', ')}`);

// --- 2) every level completes a hand -------------------------------------

console.log('\nall levels finish a hand');
for (const level of ['easy', 'normal', 'expert'] as BotLevel[]) {
  const result = simulateHand([level, level, level, level], makeRng(5));
  ok(`${level} table completes the hand`, result !== null && result.length === 4);
}

// --- 3) difficulty harness: expert vs easy (R13) -------------------------

const GAMES = 200;
const THRESHOLD = 0.7;

console.log(`\ndifficulty harness: ${GAMES} seeded games, expert vs easy`);

let expertWins = 0;
let easyWins = 0;
let deadlocked = 0;

for (let g = 0; g < GAMES; g++) {
  // Alternate which seats hold the experts so the 3-of-clubs opener advantage
  // and the seat rotation cannot favor one level over the other.
  const expertSeats = g % 2 === 0 ? [0, 2] : [1, 3];
  const levels: BotLevel[] = [0, 1, 2, 3].map((s) =>
    expertSeats.includes(s) ? 'expert' : 'easy',
  );
  const finish = simulateHand(levels, makeRng(1000 + g));
  if (finish === null) {
    deadlocked++;
    continue;
  }
  // "Finishes ahead" = the seat that emptied first.
  if (expertSeats.includes(finish[0])) expertWins++;
  else easyWins++;
}

const decided = expertWins + easyWins;
const rate = decided === 0 ? 0 : expertWins / decided;
console.log(
  `  expert first-out in ${expertWins}/${decided} games (${(rate * 100).toFixed(1)}%), ` +
    `easy ${easyWins}, deadlocked ${deadlocked}`,
);

ok('no games deadlocked', deadlocked === 0, { deadlocked });
ok(
  `expert finishes ahead of easy in at least ${THRESHOLD * 100}% of games`,
  rate >= THRESHOLD,
  { rate },
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
