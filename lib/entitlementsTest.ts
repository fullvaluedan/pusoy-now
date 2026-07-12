// Tests for the pure monetization helpers in lib/entitlementRules.ts: the
// (currently dark) free-game gate, the ad-visibility rule, and the game
// counter's pure increment/sum helpers. These live outside lib/entitlements.tsx
// and lib/gameCounter.ts so the node harness never imports react-native or
// expo-secure-store. Same minimal ok() harness as the engine/auth/profile
// tests. Run: tsx lib/entitlementsTest.ts (or via npm test)

import {
  canStartGame,
  shouldShowAds,
  nextGameCount,
  sumGameCounts,
  DEFAULT_ENTITLEMENT_CONFIG,
  type EntitlementConfig,
} from './entitlementRules';

let pass = 0;
let fail = 0;

function ok(name: string, cond: boolean, info?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}`, info ?? '');
  }
}

function main() {
  // --- ad visibility ---------------------------------------------------------
  ok('premium hides ads', shouldShowAds(true) === false);
  ok('free shows ads', shouldShowAds(false) === true);

  // --- the free-game gate, dark-launched (enforced: false) -------------------
  ok(
    'default config is the dark-launch config',
    DEFAULT_ENTITLEMENT_CONFIG.freeGameLimit === 20 && DEFAULT_ENTITLEMENT_CONFIG.enforced === false,
  );
  ok(
    'dark-launch: game 21 is allowed at the free limit',
    canStartGame(20, DEFAULT_ENTITLEMENT_CONFIG, false) === true,
  );
  ok(
    'dark-launch: well past the free limit is still allowed',
    canStartGame(1000, DEFAULT_ENTITLEMENT_CONFIG, false) === true,
  );

  // --- the free-game gate, enforced ------------------------------------------
  const enforced: EntitlementConfig = { freeGameLimit: 20, enforced: true };
  ok('enforced: at the limit, game 21 is blocked for a free player', canStartGame(20, enforced, false) === false);
  ok('enforced: under the limit is allowed for a free player', canStartGame(19, enforced, false) === true);
  ok('enforced: premium bypasses the limit', canStartGame(20, enforced, true) === true);

  // --- game counter pure helpers ----------------------------------------------
  ok('increment from zero', nextGameCount(0) === 1);
  ok('increment at the free limit', nextGameCount(20) === 21);
  ok('sum across modes', sumGameCounts({ easy: 1, normal: 2, expert: 3 }) === 6);
  ok('sum of an empty counter is zero', sumGameCounts({}) === 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
