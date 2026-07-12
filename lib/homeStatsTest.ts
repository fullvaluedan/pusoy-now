// Tests for the pure Home-hub stat-tile helpers (lib/homeStats.ts).
// Same minimal ok() harness as the rest of this repo's tsx test files.
// Run: tsx lib/homeStatsTest.ts (or via npm test)

import { formatTime, resolveHomeStatTiles } from './homeStats';
import type { BotStats } from './stats';

// A zero-games BotStats literal, matching lib/stats.ts's emptyStats() shape.
// Not imported from lib/stats.ts: that module pulls in expo-secure-store +
// react-native at module scope (storage functions), which this plain-node
// tsx test cannot load -- see the module comment in lib/homeStats.ts.
function emptyStats(): BotStats {
  const emptyLevel = () => ({ games: 0, ranks: [0, 0, 0, 0] as [number, number, number, number], bestWinMs: null });
  return { easy: emptyLevel(), normal: emptyLevel(), expert: emptyLevel() };
}

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
  // --- formatTime ------------------------------------------------------------
  ok('formatTime pads seconds under 10', formatTime(74000) === '1:14');
  ok('formatTime handles a sub-minute duration', formatTime(5000) === '0:05');
  ok('formatTime floors partial seconds down to whole seconds', formatTime(9999) === '0:10');

  // --- resolveHomeStatTiles ----------------------------------------------------
  // Zero games across every difficulty -> the whole tile row is hidden.
  const zero = resolveHomeStatTiles(emptyStats());
  ok('zero games hides the tile row', zero.visible === false);
  ok('zero games still reports "0" as the games label', zero.gamesLabel === '0');
  ok('zero games has no best time', zero.bestTimeLabel === '-');

  // Games played but no win yet at any difficulty -> row is visible (games
  // count > 0), but the best-time tile shows a dash, not a bogus 0:00.
  const gamesNoWins: BotStats = {
    easy: { games: 3, ranks: [0, 1, 1, 1], bestWinMs: null },
    normal: { games: 2, ranks: [0, 0, 1, 1], bestWinMs: null },
    expert: { games: 0, ranks: [0, 0, 0, 0], bestWinMs: null },
  };
  const noWins = resolveHomeStatTiles(gamesNoWins);
  ok('games without any win are visible', noWins.visible === true);
  ok('games without any win sum across levels', noWins.gamesLabel === '5');
  ok('games without any win show a dash for best time, not 0:00', noWins.bestTimeLabel === '-');

  // Mixed levels: games and wins spread across all three difficulties --
  // totals sum across levels, and the best time is the fastest win overall
  // (not the fastest per level, not the last level checked).
  const mixed: BotStats = {
    easy: { games: 4, ranks: [1, 1, 1, 1], bestWinMs: 90_000 },
    normal: { games: 6, ranks: [2, 2, 1, 1], bestWinMs: 61_000 },
    expert: { games: 1, ranks: [1, 0, 0, 0], bestWinMs: 45_000 },
  };
  const tiles = resolveHomeStatTiles(mixed);
  ok('mixed levels aggregate total games across all three', tiles.gamesLabel === '11');
  ok('mixed levels pick the single fastest win across all levels', tiles.bestTimeLabel === formatTime(45_000));
  ok('mixed levels tile row is visible', tiles.visible === true);

  // Order independence: the fastest win can live on any level and still wins.
  const fastestOnEasy: BotStats = {
    easy: { games: 1, ranks: [1, 0, 0, 0], bestWinMs: 20_000 },
    normal: { games: 1, ranks: [1, 0, 0, 0], bestWinMs: 80_000 },
    expert: { games: 1, ranks: [1, 0, 0, 0], bestWinMs: 80_000 },
  };
  ok(
    'the fastest win is picked regardless of which level it is on',
    resolveHomeStatTiles(fastestOnEasy).bestTimeLabel === formatTime(20_000),
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
