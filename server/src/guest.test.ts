// Tests for the guest username generator.
//
// The shape ("AdjectiveNoun-NNNN"), determinism under an injected rng, the
// number range, and variety across seeds are all provable without touching
// global Math.random.
//
// Run: tsx src/guest.test.ts (or via npm test)

import { ADJECTIVES, NOUNS, generateGuestName } from './guest';

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

// A tiny deterministic PRNG (mulberry32) so a seed yields a fixed rng stream.
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Adjective + Noun (both Capitalized, letters only), then "-" and a 4-digit
// number whose first digit is 1-9 (i.e. 1000-9999).
const SHAPE = /^[A-Z][a-z]+[A-Z][a-z]+-[1-9]\d{3}$/;

async function main() {
  // --- wordlists are the promised size and free of empties -------------------
  ok('about 40 adjectives', ADJECTIVES.length >= 38 && ADJECTIVES.length <= 45, ADJECTIVES.length);
  ok('about 40 nouns', NOUNS.length >= 38 && NOUNS.length <= 45, NOUNS.length);
  ok('every adjective is Capitalized letters only', ADJECTIVES.every((w) => /^[A-Z][a-z]+$/.test(w)));
  ok('every noun is Capitalized letters only', NOUNS.every((w) => /^[A-Z][a-z]+$/.test(w)));

  // --- shape: matches AdjectiveNoun-NNNN across many random draws ------------
  {
    let allMatch = true;
    let bad = '';
    for (let s = 0; s < 500; s++) {
      const name = generateGuestName(seeded(s));
      if (!SHAPE.test(name)) {
        allMatch = false;
        bad = name;
        break;
      }
    }
    ok('every generated name matches the AdjectiveNoun-NNNN shape', allMatch, bad);
  }

  // --- example from the plan is representable --------------------------------
  ok('the plan example "SwiftNarwhal-4821" fits the shape', SHAPE.test('SwiftNarwhal-4821'));

  // --- number is always in 1000-9999 ----------------------------------------
  {
    let inRange = true;
    for (let s = 0; s < 500; s++) {
      const n = Number(generateGuestName(seeded(s)).split('-')[1]);
      if (n < 1000 || n > 9999) {
        inRange = false;
        break;
      }
    }
    ok('the numeric suffix is always 1000-9999', inRange);
  }

  // --- determinism: same seed -> same name ----------------------------------
  {
    const a = generateGuestName(seeded(12345));
    const b = generateGuestName(seeded(12345));
    ok('the same seed produces the same name', a === b, [a, b]);
  }

  // --- determinism boundary: rng of ~0 -> first word + 1000 -----------------
  {
    const near0 = generateGuestName(() => 0);
    ok(
      'an rng that returns 0 yields the first adjective/noun and 1000',
      near0 === `${ADJECTIVES[0]}${NOUNS[0]}-1000`,
      near0,
    );
  }

  // --- variety: many seeds produce many distinct names ----------------------
  {
    const names = new Set<string>();
    for (let s = 0; s < 300; s++) names.add(generateGuestName(seeded(s)));
    ok('300 seeds produce a wide variety of names', names.size > 250, names.size);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

void main();
