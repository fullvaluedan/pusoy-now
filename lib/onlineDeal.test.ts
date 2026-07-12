// Tests for the pure online synthesized deal-order builder.
// Same minimal ok() harness as the other lib tests.
//
// Run: tsx lib/onlineDeal.test.ts (or via npm test)

import { buildOnlineDealOrder, isFreshStart } from './onlineDeal';
import { buildDeck } from './pusoy/deck';
import type { Card } from './pusoy/types';

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

function main() {
  const deck = buildDeck();
  const yourCards: Card[] = deck.slice(0, 13);

  // --- full 4-seat deal, viewer at seat 1 -----------------------------------
  {
    const seatCounts = [13, 13, 13, 13];
    const steps = buildOnlineDealOrder(1, yourCards, seatCounts);

    ok('total steps == sum of seat counts', steps.length === 52, steps.length);

    const yourSteps = steps.filter((s) => s.seat === 1);
    ok('viewer gets exactly their 13 cards', yourSteps.length === 13, yourSteps.length);
    ok('every viewer step is face-up with a card', yourSteps.every((s) => s.faceUp && s.card != null));
    ok(
      'viewer cards arrive in server order',
      JSON.stringify(yourSteps.map((s) => s.card!.id)) === JSON.stringify(yourCards.map((c) => c.id)),
      yourSteps.map((s) => s.card!.id),
    );

    const oppSteps = steps.filter((s) => s.seat !== 1);
    ok('every opponent step is face-down with no card', oppSteps.every((s) => !s.faceUp && s.card == null));

    // Round-robin: first four steps hit seats 0,1,2,3 in order.
    ok(
      'round-robin order (first round is 0,1,2,3)',
      steps[0].seat === 0 && steps[1].seat === 1 && steps[2].seat === 2 && steps[3].seat === 3,
      steps.slice(0, 4).map((s) => s.seat),
    );
  }

  // --- short-handed: a 2-seat room (1 opponent) -----------------------------
  {
    const seatCounts = [13, 13];
    const steps = buildOnlineDealOrder(0, yourCards, seatCounts);
    ok('2-seat: 26 total steps', steps.length === 26, steps.length);
    ok('2-seat: viewer face-up count == 13', steps.filter((s) => s.seat === 0 && s.faceUp).length === 13);
    ok('2-seat: opponent face-down count == 13', steps.filter((s) => s.seat === 1 && !s.faceUp).length === 13);
  }

  // --- uneven counts (mid-something) still deal round by round ---------------
  {
    const steps = buildOnlineDealOrder(0, yourCards.slice(0, 2), [2, 3, 1]);
    ok('uneven counts: total == 6', steps.length === 6, steps.length);
    ok('uneven counts: seat 1 gets 3', steps.filter((s) => s.seat === 1).length === 3);
    ok('uneven counts: seat 2 gets 1', steps.filter((s) => s.seat === 2).length === 1);
    ok('uneven counts: viewer face-up cards limited to what was supplied', steps.filter((s) => s.seat === 0).length === 2);
  }

  // --- degenerate inputs -----------------------------------------------------
  {
    ok('empty seat counts -> no steps', buildOnlineDealOrder(0, [], []).length === 0);
  }

  // --- isFreshStart: when the client should run the deal overlay -------------
  {
    const fresh = { playing: true, yourHandLength: 13, trickHistoryLength: 0 };
    ok('untouched hand, empty history -> deal', isFreshStart(fresh) === true);
    ok(
      'opener bot already led (slow join race) -> still deal',
      isFreshStart({ ...fresh, trickHistoryLength: 1 }) === true,
    );
    ok(
      'two plays deep is not fresh',
      isFreshStart({ ...fresh, trickHistoryLength: 2 }) === false,
    );
    ok(
      'mid-game reconnect (shorter hand) never deals',
      isFreshStart({ ...fresh, yourHandLength: 9, trickHistoryLength: 1 }) === false,
    );
    ok('no hand yet never deals', isFreshStart({ ...fresh, yourHandLength: null }) === false);
    ok('not playing never deals', isFreshStart({ ...fresh, playing: false }) === false);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
