// Pure helpers behind the Home hub's stat tiles (U4): aggregate the local
// per-difficulty bot scoreboard (lib/stats.ts's BotStats) into the two
// numbers the hub shows -- total games played across every difficulty, and
// the single best (fastest) win time across every difficulty -- format them
// for display, and decide whether the whole tile row should render at all
// (hidden until the player has actually played a game).
//
// Kept dependency-free (a type-only import of BotStats/BotLevel, no
// react-native or expo-secure-store) so it stays unit-testable in plain node
// via tsx -- see lib/homeStatsTest.ts. lib/stats.ts itself cannot be
// imported here for its `formatTime` value: that module pulls in
// expo-secure-store + react-native at module scope for its storage
// functions, which fails to even parse under tsx's esbuild transform outside
// a real RN/Metro bundle (the same reason lib/presence.ts splits its pure
// logic into lib/presencePure.ts). `formatTime` below duplicates lib/stats.ts's
// "M:SS" formatter; both must stay in sync if the format ever changes.

import type { BotLevel } from './pusoy/types';
import type { BotStats } from './stats';

export interface HomeStatTiles {
  // Whether the stat-tile row should render at all: hidden while the player
  // has zero recorded games across every difficulty.
  visible: boolean;
  gamesLabel: string;
  // "M:SS" of the fastest win across every difficulty, or a dash when the
  // player has games but no win yet (e.g. only losses so far).
  bestTimeLabel: string;
}

const LEVELS: BotLevel[] = ['easy', 'normal', 'expert'];

// "M:SS" for a duration in milliseconds (e.g. 74000 -> "1:14"). Mirrors
// lib/stats.ts's formatTime -- see the module comment above for why this
// cannot be a shared import.
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function resolveHomeStatTiles(stats: BotStats): HomeStatTiles {
  let totalGames = 0;
  let bestWinMs: number | null = null;

  for (const lvl of LEVELS) {
    const s = stats[lvl];
    if (!s) continue;
    totalGames += s.games;
    if (s.bestWinMs != null && (bestWinMs == null || s.bestWinMs < bestWinMs)) {
      bestWinMs = s.bestWinMs;
    }
  }

  return {
    visible: totalGames > 0,
    gamesLabel: String(totalGames),
    bestTimeLabel: bestWinMs != null ? formatTime(bestWinMs) : '-',
  };
}
