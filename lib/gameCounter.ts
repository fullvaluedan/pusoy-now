// Local per-mode counter of COMPLETED bot games, for the (currently dark)
// free-game gate in lib/entitlements.tsx. Storage pattern copied exactly from
// lib/stats.ts: localStorage on web, expo-secure-store on native, best-effort
// try/catch. Games ended with the manual "Skip to end" bail-out are never
// counted (see game-local's finish effect, same condition as recordGame).

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { nextGameCount, sumGameCounts } from './entitlementRules';
import type { BotLevel } from './pusoy/types';

const KEY = 'pusoy_game_counter_v1';

export type GameCounter = Record<BotLevel, number>;

function emptyCounter(): GameCounter {
  return { easy: 0, normal: 0, expert: 0 };
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
      // storage full or unavailable; the counter is best-effort
    }
    return;
  }
  try {
    await SecureStore.setItemAsync(KEY, value);
  } catch {
    // best-effort
  }
}

export async function loadGameCounter(): Promise<GameCounter> {
  const raw = await readRaw();
  if (!raw) return emptyCounter();
  try {
    const parsed = JSON.parse(raw) as Partial<Record<BotLevel, number>>;
    const c = emptyCounter();
    for (const lvl of ['easy', 'normal', 'expert'] as BotLevel[]) {
      c[lvl] = Number(parsed[lvl]) || 0;
    }
    return c;
  } catch {
    return emptyCounter();
  }
}

// Record one legitimately finished game (same "no count on manual Skip-to-end
// bailout" rule as lib/stats.ts's recordGame).
export async function incrementGameCounter(level: BotLevel): Promise<void> {
  const c = await loadGameCounter();
  c[level] = nextGameCount(c[level]);
  await writeRaw(JSON.stringify(c));
}

// Total completed games across every mode -- what the free-game gate compares
// against freeGameLimit.
export async function totalCompletedGames(): Promise<number> {
  return sumGameCounts(await loadGameCounter());
}

export async function clearGameCounter(): Promise<void> {
  await writeRaw(JSON.stringify(emptyCounter()));
}
