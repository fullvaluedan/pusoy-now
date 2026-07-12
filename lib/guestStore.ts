// Pure persistence core for the local guest name (lib/guest.ts is the
// react-native-touching wrapper around this). Kept dependency-free of
// react-native / expo-secure-store so lib/guestTest.ts can exercise it in
// plain node with an in-memory fake storage -- same split as
// lib/settingsRules.ts vs lib/settings.ts and lib/entitlementRules.ts vs
// lib/entitlements.tsx elsewhere in this codebase.

import { generateGuestName } from './guestNames';

// Storage seam: read/write a single persisted string.
export interface GuestNameStorage {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}

// Return the persisted name, or generate + persist one if none exists yet.
export async function getOrCreateGuestName(
  storage: GuestNameStorage,
  rng: () => number = Math.random,
): Promise<string> {
  const existing = await storage.read();
  if (existing) return existing;
  const name = generateGuestName(rng);
  await storage.write(name);
  return name;
}
