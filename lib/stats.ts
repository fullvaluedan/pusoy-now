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
import { apiUrl, authClient } from './authClient';
import { aggregateTotals } from './statsAgg';

const KEY = 'pusoy_bot_stats_v1';

export interface LevelStats {
  games: number;
  // ranks[0] = times finished 1st, ranks[3] = times finished 4th (last).
  ranks: [number, number, number, number];
  // Fastest winning game at this level, in milliseconds. null until the player
  // wins one. Only wins (1st place) count -- a "fastest time" for a loss is
  // meaningless.
  bestWinMs: number | null;
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
  return { games: 0, ranks: [0, 0, 0, 0], bestWinMs: null };
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
      // Back-compat: older payloads have no bestWinMs. A positive finite number
      // is a real best time; anything else stays null.
      const b = Number(p.bestWinMs);
      s[lvl].bestWinMs = Number.isFinite(b) && b > 0 ? b : null;
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

// Record the time of a winning game (1st place). Keeps only the fastest, so a
// call with a slower time is a no-op. Ignores non-positive durations.
export async function recordWinTime(level: BotLevel, ms: number): Promise<void> {
  if (!Number.isFinite(ms) || ms <= 0) return;
  const s = await loadStats();
  const prev = s[level].bestWinMs;
  if (prev == null || ms < prev) {
    s[level].bestWinMs = ms;
    await writeRaw(JSON.stringify(s));
  }
}

// "M:SS" for a duration in milliseconds (e.g. 74000 -> "1:14"). Used on the
// finish screen and the scoreboard.
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
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
    const { data, error } = await authClient.$fetch<{ applied: boolean }>(apiUrl('/api/stats/sync'), {
      method: 'POST',
      body: totals,
    });
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}
