// End-to-end game test: deal a real deck, then have 4 bot players play
// against each other using the same engine the UI uses. Verify the hand
// completes with a sensible finish order and the API surface (applyAction,
// handFinishOrder) is consistent.

import { buildDeck, dealFour } from './deck';
import { detectCombo } from './combo';
import { applyAction, isHandOver, newHand, handFinishOrder } from './engine';
import { botChoose } from './bot';
import type { Card, PlayedCombo } from './types';

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

console.log('full game simulation');
const deck = buildDeck();
const hands = dealFour(deck);

let hs = newHand('test-game', ['p0', 'p1', 'p2', 'p3'], hands, 1, 0, 'h1');
ok('deal: 13 cards each', hands.every((h) => h.length === 13));

let iter = 0;
const maxIter = 200;
while (!isHandOver(hs) && iter < maxIter) {
  iter++;
  const seat = hs.currentPlayerIndex;
  if (hs.finishedOrder.includes(seat)) break;
  const hand = hands[seat];
  const choice = botChoose(hand, hs.leadCombo);
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
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
