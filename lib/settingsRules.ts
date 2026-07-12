// Pure settings helpers (no react-native or async logic).
// Used by lib/settings.ts for the full persistence layer,
// and by lib/settingsTest.ts for testing without requiring react-native.

import type { BotLevel } from './pusoy/types';

export interface AppSettings {
  sound: boolean;
  haptics: boolean;
  // Saved bot difficulty for the Home PLAY button (Round 9 U2). null means
  // "never chosen" -- Home shows the inline EASY/NORMAL/EXPERT picker once,
  // then this is set and every later PLAY starts instantly.
  botLevel: BotLevel | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  sound: true,
  haptics: true,
  botLevel: null,
};

const VALID_BOT_LEVELS: BotLevel[] = ['easy', 'normal', 'expert'];

function isBotLevel(value: unknown): value is BotLevel {
  return typeof value === 'string' && (VALID_BOT_LEVELS as string[]).includes(value);
}

// Coerce an unknown parsed blob into valid AppSettings. Used by loadSettings
// and tests to handle partial/corrupted/garbage data gracefully. Stored
// payloads saved before botLevel existed (or holding an invalid value) load
// as null rather than failing -- back-compat load.
export function mergeSettings(raw: unknown): AppSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  const obj = raw as Record<string, unknown>;
  return {
    sound: typeof obj.sound === 'boolean' ? obj.sound : DEFAULT_SETTINGS.sound,
    haptics: typeof obj.haptics === 'boolean' ? obj.haptics : DEFAULT_SETTINGS.haptics,
    botLevel: isBotLevel(obj.botLevel) ? obj.botLevel : DEFAULT_SETTINGS.botLevel,
  };
}

// Home's PLAY button decision (Round 9 U2): no saved difficulty yet -> show
// the inline picker; a saved difficulty -> start instantly.
export function decideOnPlay(botLevel: BotLevel | null): 'start' | 'pick' {
  return botLevel === null ? 'pick' : 'start';
}
