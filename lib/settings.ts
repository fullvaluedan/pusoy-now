// Persistent app settings: sound and haptics toggles.
//
// Storage is cross-platform: localStorage on web, expo-secure-store on native.
// Uses the same best-effort pattern as lib/stats.ts.

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { AppSettings, DEFAULT_SETTINGS, mergeSettings } from './settingsRules';

export type { AppSettings };
export { DEFAULT_SETTINGS, mergeSettings };

const KEY = 'pusoy_settings_v1';

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
      // storage full or unavailable; settings are best-effort
    }
    return;
  }
  try {
    await SecureStore.setItemAsync(KEY, value);
  } catch {
    // best-effort
  }
}

export async function loadSettings(): Promise<AppSettings> {
  const raw = await readRaw();
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(raw) as unknown;
    return mergeSettings(parsed);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await writeRaw(JSON.stringify(settings));
}
