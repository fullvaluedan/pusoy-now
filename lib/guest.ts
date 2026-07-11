// Local guest identity (U2): a Reddit-style username generated on-device at
// first launch and persisted thereafter, so a guest has a name to play bots
// under immediately -- zero server round trip, zero D1 rows, until an online
// action actually needs a session (lib/auth.tsx's ensureSession).
//
// Storage is cross-platform: localStorage on web, expo-secure-store on native,
// same dual pattern as lib/stats.ts. The persistence logic itself lives in
// lib/guestStore.ts (a storage interface + getOrCreateGuestName), which has no
// react-native / expo-secure-store dependency, so lib/guestTest.ts can test it
// in plain node with an in-memory fake -- importing this file directly would
// pull in react-native at module scope, which the tsx/node test harness cannot
// transform (see the other lib/*Test.ts files' store/pure split).

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { getOrCreateGuestName, type GuestNameStorage } from './guestStore';

const KEY = 'pusoy_guest_name_v1';

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
      // storage full or unavailable; the name still works for this session
    }
    return;
  }
  try {
    await SecureStore.setItemAsync(KEY, value);
  } catch {
    // best-effort
  }
}

const realStorage: GuestNameStorage = { read: readRaw, write: writeRaw };

// In-memory cache so repeated calls within one app session never re-read
// storage after the first resolution.
let cached: string | null = null;

// The guest's local display name: generated once per device, persisted, and
// returned unchanged thereafter (until storage is cleared).
export async function getLocalGuestName(): Promise<string> {
  if (cached) return cached;
  cached = await getOrCreateGuestName(realStorage);
  return cached;
}
