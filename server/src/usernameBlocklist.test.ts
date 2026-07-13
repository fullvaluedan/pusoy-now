// Tests for the local username moderation: the leetspeak/padding normalizer and
// the blocklist substring check. Pure functions, so they run with no D1 and no
// network. Run: tsx src/usernameBlocklist.test.ts (or via npm test)

import { containsBlockedWord, normalizeForModeration } from './usernameBlocklist';

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
  // --- normalizeForModeration ------------------------------------------------
  ok('lowercases', normalizeForModeration('ABC') === 'abc');
  ok('maps leetspeak digits (0134578 @ $)', normalizeForModeration('0134578@$') === 'oieastbas');
  ok('strips non-alpha (spaces, underscores, punctuation, leftover digits)',
    normalizeForModeration('a_b.c 2') === 'abc');
  ok('collapses runs of 3+ identical letters', normalizeForModeration('fuuuuck') === 'fuck');
  ok('preserves legitimate double letters', normalizeForModeration('asshole') === 'asshole');
  ok('an empty / symbol-only handle normalizes to empty', normalizeForModeration('___') === '');

  // --- containsBlockedWord: catches ------------------------------------------
  ok('a plain slur is caught', containsBlockedWord('faggot') === true);
  ok('a slur embedded between other chars is caught', containsBlockedWord('xxfuckxx') === true);
  ok('a leetspeak-spelled slur is caught (f4gg0t)', containsBlockedWord('f4gg0t') === true);
  ok('a symbol-substituted profanity is caught ($h1t)', containsBlockedWord('$h1t') === true);
  ok('padding-evaded profanity is caught (shiiiit)', containsBlockedWord('shiiiit') === true);
  ok('separator-evaded profanity is caught (s.h.i.t)', containsBlockedWord('s.h.i.t') === true);

  // --- containsBlockedWord: clean names pass ---------------------------------
  ok('a clean handle passes', containsBlockedWord('ada_lovelace') === false);
  ok('another clean handle passes', containsBlockedWord('card_shark_88') === false);
  ok('a handle that only shares letters passes', containsBlockedWord('assistant') === false);
  ok('the word class is not shredded into a slur', containsBlockedWord('classic_player') === false);
  ok('an empty handle is not blocked', containsBlockedWord('') === false);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
