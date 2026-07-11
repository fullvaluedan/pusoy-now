// Players Online (Round 7 U5): a per-install random device id, persisted
// once, plus a hook that beats the presence endpoint while the app is
// foregrounded and exposes the live count.
//
// Storage pattern copied exactly from lib/stats.ts: localStorage on web,
// expo-secure-store on native, best-effort try/catch. The device id is not a
// login credential -- it only distinguishes concurrent installs for the
// counter, so a lost/regenerated id is harmless.
//
// Pure logic (id generation, get-or-create, the foreground predicate) lives
// in lib/presencePure.ts, which has no react-native import and is what
// lib/presenceTest.ts exercises. This file wires that pure logic to real
// storage, the network, and React.

import { useEffect, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { authClient } from './authClient';
import { generateDeviceId, isForegroundState, resolveDeviceId, type DeviceIdStorage } from './presencePure';

export { generateDeviceId, isForegroundState, resolveDeviceId, type DeviceIdStorage };

const KEY = 'pusoy_device_id_v1';

const realStorage: DeviceIdStorage = {
  async read() {
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
  },
  async write(value) {
    if (Platform.OS === 'web') {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, value);
      } catch {
        // storage full or unavailable; a fresh id is generated next launch
      }
      return;
    }
    try {
      await SecureStore.setItemAsync(KEY, value);
    } catch {
      // best-effort
    }
  },
};

// The persisted device id, generating and storing one on first read.
export async function getDeviceId(): Promise<string> {
  return resolveDeviceId(realStorage);
}

const BEAT_INTERVAL_MS = 45_000;

// Sends a beat immediately when mounted (and whenever the app returns to the
// foreground), then every 45s while active. The interval is cleared on
// background/unmount so a backgrounded app stops pinging. Exposes the live
// count, null until the first successful beat.
export function usePresence(): { count: number | null } {
  const [count, setCount] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function sendBeat() {
      try {
        const deviceId = await getDeviceId();
        const { data } = await authClient.$fetch<{ count: number }>('/api/presence/beat', {
          method: 'POST',
          body: { deviceId },
        });
        if (!cancelled && data && typeof data.count === 'number') setCount(data.count);
      } catch {
        // best-effort; the chip just stays at its last known count
      }
    }

    function startInterval() {
      stopInterval();
      intervalRef.current = setInterval(() => void sendBeat(), BEAT_INTERVAL_MS);
    }

    function stopInterval() {
      if (intervalRef.current != null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    void sendBeat();
    startInterval();

    function onAppStateChange(next: AppStateStatus) {
      if (isForegroundState(next)) {
        void sendBeat();
        startInterval();
      } else {
        stopInterval();
      }
    }

    const sub = AppState.addEventListener('change', onAppStateChange);

    return () => {
      cancelled = true;
      stopInterval();
      sub.remove();
    };
  }, []);

  return { count };
}
