// Tests for the pure client-side friends + stats-sync helpers.
//
// These import only the node-safe modules (statsAgg, friendsMap) - never
// lib/friends.ts or lib/stats.ts, which pull in authClient / react-native. The
// network wrappers and hook wiring are exercised live by the orchestrator (two
// real accounts). Same minimal ok() harness as the other lib tests.
//
// Run: tsx lib/friends.test.ts (or via npm test)

import { aggregateTotals } from './statsAgg';
import { addOutcomeMessage, formatH2h, mapAddStatus } from './friendsMap';
import type { BotStats } from './stats';

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

const stats = (
  easy: [number, number, number, number, number],
  normal: [number, number, number, number, number],
  expert: [number, number, number, number, number],
): BotStats => ({
  easy: { games: easy[0], ranks: [easy[1], easy[2], easy[3], easy[4]], bestWinMs: null },
  normal: { games: normal[0], ranks: [normal[1], normal[2], normal[3], normal[4]], bestWinMs: null },
  expert: { games: expert[0], ranks: [expert[1], expert[2], expert[3], expert[4]], bestWinMs: null },
});

function main() {
  // --- aggregateTotals ------------------------------------------------------
  {
    const t = aggregateTotals(stats([2, 1, 0, 1, 0], [3, 1, 1, 0, 1], [5, 2, 1, 1, 1]));
    ok('games sum across all levels', t.games === 10);
    ok('firsts sum across all levels', t.firsts === 4);
    ok('seconds sum across all levels', t.seconds === 2);
    ok('thirds sum across all levels', t.thirds === 2);
    ok('fourths sum across all levels', t.fourths === 2);
  }
  {
    const t = aggregateTotals(stats([0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]));
    ok('empty stats aggregate to all zeros', t.games === 0 && t.firsts === 0 && t.fourths === 0);
  }

  // --- mapAddStatus ---------------------------------------------------------
  ok('no error means the request was sent', mapAddStatus(undefined) === 'sent');
  ok('404 maps to not-found', mapAddStatus(404) === 'not-found');
  ok('400 maps to self', mapAddStatus(400) === 'self');
  ok('401 maps to unauthorized', mapAddStatus(401) === 'unauthorized');
  ok('500 maps to a generic error', mapAddStatus(500) === 'error');

  // --- addOutcomeMessage ----------------------------------------------------
  ok('a sent outcome has no error banner', addOutcomeMessage('sent') === null);
  ok('not-found names the missing username', addOutcomeMessage('not-found') === 'No player with that username.');
  ok('self is called out', addOutcomeMessage('self') === 'You cannot add yourself.');

  // --- formatH2h --------------------------------------------------------
  ok('renders a W-L string', formatH2h({ wins: 3, losses: 1 }) === 'You 3 - 1');
  ok('a shared-nothing record renders 0 - 0', formatH2h({ wins: 0, losses: 0 }) === 'You 0 - 0');
  ok('missing h2h defaults to 0 - 0', formatH2h(undefined) === 'You 0 - 0');
  ok('null h2h defaults to 0 - 0', formatH2h(null) === 'You 0 - 0');

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
