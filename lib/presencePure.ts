// Pure, framework-free parts of the players-online device id + hook, split
// out from lib/presence.ts so they are unit-testable with plain `tsx` (no
// react-native/expo-secure-store in the import graph -- react-native's own
// entrypoint uses Flow syntax esbuild/tsx can't transform standalone, the
// same reason lib/authForms.ts is split from lib/auth.tsx).

// Same shape the server's presence.ts validates (36 chars, 8-4-4-4-12 hex
// groups). Math.random-based -- this id is not security sensitive.
export function generateDeviceId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// The read/write seam, split out so the get-or-create logic below is
// unit-testable against an in-memory fake with no SecureStore/localStorage.
export interface DeviceIdStorage {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}

// Pure get-or-create: read the persisted id, or generate + persist a new one.
// Storage and the generator are both injected so this is testable without
// SecureStore/localStorage or real randomness.
export async function resolveDeviceId(
  storage: DeviceIdStorage,
  generate: () => string = generateDeviceId,
): Promise<string> {
  const existing = await storage.read();
  if (existing) return existing;
  const id = generate();
  await storage.write(id);
  return id;
}

// react-native's AppStateStatus, restated locally (a plain string union) so
// this file has zero react-native import. Kept in sync by hand; there are
// only these four values.
export type AppStateStatusLike = 'active' | 'background' | 'inactive' | 'extension' | 'unknown';

// Whether an AppState transition means "the app just became visible again",
// i.e. should trigger an immediate beat + restart the interval. Pulled out of
// the effect so it is testable without React or a real AppState subscription.
export function isForegroundState(status: AppStateStatusLike): boolean {
  return status === 'active';
}
