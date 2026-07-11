// Persistent bot-game scoreboard: how many games the player finished at each
// difficulty, and how often they placed 1st / 2nd / 3rd / 4th.
//
// Storage is cross-platform: localStorage on web (where the player is likely
// testing), expo-secure-store on native. The payload is tiny (well under the
// SecureStore item limit). Games ended with the manual "Skip to end" bail-out
// are never recorded (see game-local's finish effect).

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { BotLevel } from './pusoy/types';
import { authClient } from './authClient';
import { aggregateTotals } from './statsAgg';

const KEY = 'pusoy_bot_stats_v1';

export interface LevelStats {
  games: number;
  // ranks[0] = times finished 1st, ranks[3] = times finished 4th (last).
  ranks: [number, number, number, number];
}
export type BotStats = Record<BotLevel, LevelStats>;

// Display order + labels for the scoreboard. The engine's levels map to the
// player-facing names the user asked for.
export const LEVEL_ORDER: BotLevel[] = ['expert', 'normal', 'easy'];
export const LEVEL_TITLE: Record<BotLevel, string> = {
  expert: 'Expert',
  normal: 'Medium',
  easy: 'Beginner',
};

function emptyLevel(): LevelStats {
  return { games: 0, ranks: [0, 0, 0, 0] };
}

export function emptyStats(): BotStats {
  return { easy: emptyLevel(), normal: emptyLevel(), expert: emptyLevel() };
}

async function readRaw(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    } catch {
      return null;
    }
  }
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

async function writeRaw(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, value);
    } catch {
      // storage full or unavailable; stats are best-effort
    }
    return;
  }
  try {
    await SecureStore.setItemAsync(KEY, value);
  } catch {
    // best-effort
  }
}

export async function loadStats(): Promise<BotStats> {
  const raw = await readRaw();
  if (!raw) return emptyStats();
  try {
    const parsed = JSON.parse(raw) as Partial<Record<BotLevel, Partial<LevelStats>>>;
    const s = emptyStats();
    for (const lvl of ['easy', 'normal', 'expert'] as BotLevel[]) {
      const p = parsed[lvl];
      if (!p) continue;
      s[lvl].games = Number(p.games) || 0;
      const r = p.ranks;
      if (Array.isArray(r) && r.length === 4) {
        s[lvl].ranks = [Number(r[0]) || 0, Number(r[1]) || 0, Number(r[2]) || 0, Number(r[3]) || 0];
      }
    }
    return s;
  } catch {
    return emptyStats();
  }
}

// Record one finished game: increment the level's game count and the tally for
// the place the player finished (1..4). No-op for an out-of-range rank.
export async function recordGame(level: BotLevel, rank: number): Promise<void> {
  if (rank < 1 || rank > 4) return;
  const s = await loadStats();
  s[level].games += 1;
  s[level].ranks[rank - 1] += 1;
  await writeRaw(JSON.stringify(s));
}

export async function clearStats(): Promise<void> {
  await writeRaw(JSON.stringify(emptyStats()));
}

// Push the player's cumulative totals to the Worker so they count toward the
// friends ranking (R6). Fire-and-forget: for a signed-in user the cookie rides
// along and the monotonic upsert applies; a guest gets a 401 and this is a
// no-op, so guest stats stay local-only. Any failure is swallowed - the next
// counted game retries with the (higher) latest total. Call after recordGame.
export async function pushStatsSync(): Promise<{ applied: boolean } | null> {
  try {
    const totals = aggregateTotals(await loadStats());
    const { data, error } = await authClient.$fetch<{ applied: boolean }>('/api/stats/sync', {
      method: 'POST',
      body: totals,
    });
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}
