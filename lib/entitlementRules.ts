// Pure monetization rules: the free-game gate and the ad-visibility rule.
//
// Nothing here imports react-native, expo-secure-store, or the auth client, so
// lib/entitlementsTest.ts can exercise it in plain node (same split as
// lib/profile.ts vs lib/auth.tsx, or lib/authForms.ts vs lib/auth.tsx). The
// React layer in lib/entitlements.tsx and the local counter in
// lib/gameCounter.ts both build on this.
//
// R6-R9 monetization plumbing ships DARK-LAUNCHED: `enforced` stays false
// until a later milestone flips it on, so canStartGame always returns true
// today no matter how many games have been completed.

export interface EntitlementConfig {
  freeGameLimit: number;
  enforced: boolean;
}

export const DEFAULT_ENTITLEMENT_CONFIG: EntitlementConfig = {
  freeGameLimit: 20,
  enforced: false,
};

// The free-game gate. Premium players and non-enforced config always pass;
// otherwise the player needs fewer completed games than the free limit.
export function canStartGame(
  completedCount: number,
  config: EntitlementConfig,
  premium: boolean,
): boolean {
  return premium || !config.enforced || completedCount < config.freeGameLimit;
}

// Ads show to everyone except premium players.
export function shouldShowAds(premium: boolean): boolean {
  return !premium;
}

// Pure increment for the local per-mode game counter (lib/gameCounter.ts).
export function nextGameCount(count: number): number {
  return count + 1;
}

// Total completed games across every mode -- the figure canStartGame gates on.
export function sumGameCounts(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}
