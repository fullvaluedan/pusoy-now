// Pure settings helpers (no react-native or async logic).
// Used by lib/settings.ts for the full persistence layer,
// and by lib/settingsTest.ts for testing without requiring react-native.

export interface AppSettings {
  sound: boolean;
  haptics: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  sound: true,
  haptics: true,
};

// Coerce an unknown parsed blob into valid AppSettings. Used by loadSettings
// and tests to handle partial/corrupted/garbage data gracefully.
export function mergeSettings(raw: unknown): AppSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  const obj = raw as Record<string, unknown>;
  return {
    sound: typeof obj.sound === 'boolean' ? obj.sound : DEFAULT_SETTINGS.sound,
    haptics: typeof obj.haptics === 'boolean' ? obj.haptics : DEFAULT_SETTINGS.haptics,
  };
}
