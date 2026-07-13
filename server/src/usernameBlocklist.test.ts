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

  // --- doubled-letter evasions (the bypass both reviewers found) -------------
  // A run of exactly 2 identical letters used to slip past the 3+-only collapse.
  ok('fuuck is blocked (double-letter evasion)', containsBlockedWord('fuuck') === true);
  ok('fuuuck is blocked', containsBlockedWord('fuuuck') === true);
  ok('shiit is blocked', containsBlockedWord('shiit') === true);
  ok('biitch is blocked', containsBlockedWord('biitch') === true);
  ok('cuunt is blocked (whole handle dedupes to the word)', containsBlockedWord('cuunt') === true);
  ok('niigga is blocked', containsBlockedWord('niigga') === true);
  ok('niigger is blocked', containsBlockedWord('niigger') === true);

  // --- short ambiguous roots: block when standalone or delimited -------------
  ok('a bare short root is blocked', containsBlockedWord('paki') === true);
  ok('a short root delimited by a digit is blocked (paki123)', containsBlockedWord('paki123') === true);
  ok('a short root delimited by an underscore is blocked (xX_paki)', containsBlockedWord('xX_paki') === true);
  ok('a bare ass is blocked', containsBlockedWord('ass') === true);
  ok('a delimited ass is blocked (big_ass_69)', containsBlockedWord('big_ass_69') === true);
  ok('a bare anal is blocked', containsBlockedWord('anal') === true);
  ok('a bare cunt is blocked', containsBlockedWord('cunt') === true);

  // --- Scunthorpe: clean words that merely contain a short root pass ---------
  ok('suspicious passes (contains spic)', containsBlockedWord('suspicious') === false);
  ok('auspicious passes (contains spic)', containsBlockedWord('auspicious') === false);
  ok('conspicuous passes (contains spic)', containsBlockedWord('conspicuous') === false);
  ok('scunthorpe passes (contains cunt)', containsBlockedWord('scunthorpe') === false);
  ok('pakistani passes (contains paki)', containsBlockedWord('pakistani') === false);
  ok('assassin passes (contains ass)', containsBlockedWord('assassin') === false);
  ok('grass passes (contains ass)', containsBlockedWord('grass') === false);
  ok('class passes (contains ass)', containsBlockedWord('class') === false);
  ok('analysis passes (contains anal)', containsBlockedWord('analysis') === false);
  // The country class: dedupe-substring matching used to shrink "nigger" to
  // "niger" and wrongly flag these; the padded-repeat matcher must let them pass
  // while still blocking the doubled-letter evasion.
  ok('nigeria passes (nigger must not shrink to niger)', containsBlockedWord('nigeria') === false);
  ok('niger passes', containsBlockedWord('niger') === false);
  ok('nigerian passes', containsBlockedWord('nigerian') === false);
  ok('doubled-letter evasion niigger still blocks', containsBlockedWord('niigger') === true);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
