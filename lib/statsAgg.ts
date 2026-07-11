// Pure aggregation of the local per-difficulty bot scoreboard into the single
// cumulative total the server ranks on. Kept dependency-free (type-only import
// of BotStats, no SecureStore/react-native) so it stays unit-testable in node.
//
// The server stores one growing row per user: games plus the four place
// buckets. The client's local BotStats splits those across difficulty levels,
// so the sync sums them into one total before pushing.

import type { BotLevel } from './pusoy/types';
import type { BotStats } from './stats';

export interface StatTotals {
  games: number;
  firsts: number;
  seconds: number;
  thirds: number;
  fourths: number;
}

const LEVELS: BotLevel[] = ['easy', 'normal', 'expert'];

// Sum every difficulty level's games and place tallies into one cumulative
// total. ranks[0..3] are 1st..4th place counts.
export function aggregateTotals(stats: BotStats): StatTotals {
  const t: StatTotals = { games: 0, firsts: 0, seconds: 0, thirds: 0, fourths: 0 };
  for (const lvl of LEVELS) {
    const s = stats[lvl];
    if (!s) continue;
    t.games += s.games;
    t.firsts += s.ranks[0];
    t.seconds += s.ranks[1];
    t.thirds += s.ranks[2];
    t.fourths += s.ranks[3];
  }
  return t;
}
