// Parse and validate difficulty level from user input (typically route params).
// expo-router params can be string | string[] | undefined, so this is defensive.

import type { BotLevel } from './types';

export function parseLevel(v: unknown): BotLevel {
  if (typeof v === 'string') {
    if (v === 'easy' || v === 'normal' || v === 'expert') {
      return v;
    }
  }
  // Fallback for null, undefined, empty string, wrong string, array, etc.
  return 'normal';
}
