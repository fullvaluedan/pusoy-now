// Tests for settings coercion and defaults. These live in lib/settingsRules.ts
// so the node harness never imports react-native or expo-secure-store. Same
// minimal ok() harness as the other tests. Run: tsx lib/settingsTest.ts (or via npm test)

import { mergeSettings, DEFAULT_SETTINGS } from './settingsRules';

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
  // --- mergeSettings: valid object round-trips -----
  const valid = { sound: true, haptics: false };
  const merged = mergeSettings(valid);
  ok('valid settings round-trip', merged.sound === true && merged.haptics === false);

  // --- mergeSettings: missing keys fall back to defaults -----
  const partial = { sound: true };
  const mergedPartial = mergeSettings(partial as unknown as object);
  ok('missing haptics falls back to default', mergedPartial.haptics === DEFAULT_SETTINGS.haptics);
  ok('present sound is preserved', mergedPartial.sound === true);

  const empty = {};
  const mergedEmpty = mergeSettings(empty);
  ok('empty object uses all defaults', mergedEmpty.sound === DEFAULT_SETTINGS.sound && mergedEmpty.haptics === DEFAULT_SETTINGS.haptics);

  // --- mergeSettings: wrong types fall back to defaults -----
  const wrongTypes = { sound: 'yes', haptics: 1 };
  const mergedWrong = mergeSettings(wrongTypes);
  ok('non-boolean sound falls back to default', mergedWrong.sound === DEFAULT_SETTINGS.sound);
  ok('non-boolean haptics falls back to default', mergedWrong.haptics === DEFAULT_SETTINGS.haptics);

  // --- mergeSettings: null/garbage returns defaults -----
  ok('null returns defaults', mergeSettings(null).sound === DEFAULT_SETTINGS.sound);
  ok('undefined returns defaults', mergeSettings(undefined).sound === DEFAULT_SETTINGS.sound);
  ok('string returns defaults', mergeSettings('garbage').sound === DEFAULT_SETTINGS.sound);
  ok('number returns defaults', mergeSettings(42).sound === DEFAULT_SETTINGS.sound);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
