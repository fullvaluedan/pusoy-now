// Tests for the pure viewer-relative seat mapping used by the online table.
// Same minimal ok() harness as the other lib tests.
//
// Run: tsx lib/onlineSeats.test.ts (or via npm test)

import { opponentSeats } from './onlineSeats';

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

function seatsOf(slots: { seat: number; raised: boolean }[]): number[] {
  return slots.map((s) => s.seat);
}

function main() {
  // --- 4-player: three opponents, middle raised -----------------------------
  {
    const slots = opponentSeats(0, 4);
    ok('4p from seat 0 -> [1,2,3]', JSON.stringify(seatsOf(slots)) === '[1,2,3]', slots);
    ok('4p middle (index 1) is raised', slots[1].raised === true);
    ok('4p flanks are level', slots[0].raised === false && slots[2].raised === false);
  }
  {
    const slots = opponentSeats(2, 4);
    ok('4p from seat 2 wraps -> [3,0,1]', JSON.stringify(seatsOf(slots)) === '[3,0,1]', slots);
    ok('4p from seat 2 raises the wrapped middle (0)', slots[1].seat === 0 && slots[1].raised === true);
  }

  // --- 3-player: two opponents left/right, none raised ----------------------
  {
    const slots = opponentSeats(0, 3);
    ok('3p from seat 0 -> [1,2]', JSON.stringify(seatsOf(slots)) === '[1,2]', slots);
    ok('3p has no raised seat', slots.every((s) => !s.raised));
  }
  {
    const slots = opponentSeats(1, 3);
    ok('3p from seat 1 wraps -> [2,0]', JSON.stringify(seatsOf(slots)) === '[2,0]', slots);
  }

  // --- 2-player: single opponent opposite -----------------------------------
  {
    const slots = opponentSeats(0, 2);
    ok('2p from seat 0 -> [1]', JSON.stringify(seatsOf(slots)) === '[1]', slots);
    ok('2p single opponent is level', slots.length === 1 && slots[0].raised === false);
  }
  {
    const slots = opponentSeats(1, 2);
    ok('2p from seat 1 -> [0]', JSON.stringify(seatsOf(slots)) === '[0]', slots);
  }

  // --- invariants across every viewer/size ----------------------------------
  for (let n = 2; n <= 4; n++) {
    for (let seat = 0; seat < n; seat++) {
      const slots = opponentSeats(seat, n);
      ok(`n=${n} seat=${seat}: has n-1 opponents`, slots.length === n - 1, slots);
      ok(`n=${n} seat=${seat}: never seats the viewer`, slots.every((s) => s.seat !== seat), slots);
      ok(`n=${n} seat=${seat}: opponents are distinct in-range seats`,
        new Set(seatsOf(slots)).size === n - 1 && slots.every((s) => s.seat >= 0 && s.seat < n), slots);
    }
  }

  // --- clamping of out-of-range sizes ---------------------------------------
  ok('seatCount > 4 clamps to a 3-opponent row', opponentSeats(0, 6).length === 3);
  ok('seatCount < 2 clamps to a 1-opponent row', opponentSeats(0, 1).length === 1);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
