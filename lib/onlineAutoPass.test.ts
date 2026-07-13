// Tests for the pure online auto-pass decision + turn-key helpers.
// Same minimal ok() harness as the other lib tests.
//
// Run: tsx lib/onlineAutoPass.test.ts (or via npm test)

import { shouldAutoPass, autoPassTurnKey } from './onlineAutoPass';

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

// A stand-in lead combo; shouldAutoPass only checks it for null-ness.
const LEAD = { type: 'single' } as unknown;

function main() {
  // --- the headline case: your turn, a lead, no legal play -> auto-pass -------
  ok(
    'your turn + lead + zero legal plays -> true',
    shouldAutoPass({ isMyTurn: true, lead: LEAD, legalPlayCount: 0, connected: true }) === true,
  );

  // --- leading (lead null) -> never auto-pass, even with zero count ----------
  ok(
    'leading (lead null) -> false',
    shouldAutoPass({ isMyTurn: true, lead: null, legalPlayCount: 0, connected: true }) === false,
  );

  // --- have a legal play -> false -------------------------------------------
  ok(
    'has a legal play -> false',
    shouldAutoPass({ isMyTurn: true, lead: LEAD, legalPlayCount: 2, connected: true }) === false,
  );

  // --- not your turn -> false (count null in practice) ----------------------
  ok(
    'not your turn -> false',
    shouldAutoPass({ isMyTurn: false, lead: LEAD, legalPlayCount: null, connected: true }) === false,
  );

  // --- count unknown (null) while it IS your turn -> false (no decision) -----
  ok(
    'legalPlayCount null -> false',
    shouldAutoPass({ isMyTurn: true, lead: LEAD, legalPlayCount: null, connected: true }) === false,
  );

  // --- disconnected -> never auto-pass (the send would be dropped) -----------
  ok(
    'disconnected -> false even when otherwise eligible',
    shouldAutoPass({ isMyTurn: true, lead: LEAD, legalPlayCount: 0, connected: false }) === false,
  );

  // --- turn key: stable within a turn, changes across turns -----------------
  // Keyed on seat + turnDeadline (server-set fresh every turn), never on
  // trickHistory length (server caps it at 8, so it degenerates late in a hand).
  ok('turn key is stable for the same turn', autoPassTurnKey(2, 1000) === autoPassTurnKey(2, 1000));
  ok('turn key changes when the acting seat changes', autoPassTurnKey(2, 1000) !== autoPassTurnKey(3, 1000));
  // The headline fix: two DIFFERENT turns for the same seat with the SAME trick
  // length (trickHistory capped at 8) still produce different keys, because the
  // server issues a fresh deadline for each turn instance.
  ok(
    'turn key differs for two turns with same seat + same trick length but different deadlines',
    autoPassTurnKey(2, 1000) !== autoPassTurnKey(2, 2000),
  );
  ok('turn key tolerates a null seat', autoPassTurnKey(null, 1000) === 'none:1000');
  ok('turn key tolerates a null deadline', autoPassTurnKey(2, null) === '2:none');

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
