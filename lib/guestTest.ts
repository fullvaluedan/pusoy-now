// Tests for the local guest identity (lib/guestNames.ts, lib/guestStore.ts --
// the pure core behind lib/guest.ts) and the single-flight guard
// lib/auth.tsx's ensureSession() relies on. These are pure enough to run in
// plain node: an in-memory fake stands in for the real localStorage/SecureStore
// storage lib/guest.ts uses (which cannot be tested against directly here --
// importing 'react-native' fails under the tsx/node harness, same reason the
// other lib/*Test.ts files test a pure core rather than the react-native-
// touching module itself). Run: tsx lib/guestTest.ts (or via npm test)

import { generateGuestName as generateGuestNameClient, ADJECTIVES, NOUNS } from './guestNames';
import { getOrCreateGuestName, type GuestNameStorage } from './guestStore';
import { singleFlight } from './singleFlight';

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

// Deterministic rng from a fixed sequence of draws in [0, 1).
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

// In-memory fake for GuestNameStorage. A fresh instance simulates a blank
// device; reusing the same instance across two getOrCreateGuestName calls
// simulates "the app restarted but the persisted storage did not clear".
function fakeStorage(): GuestNameStorage {
  let value: string | null = null;
  return {
    read: async () => value,
    write: async (v: string) => {
      value = v;
    },
  };
}

async function main() {
  // --- name shape --------------------------------------------------------
  const nameShapeRe = /^[A-Za-z]+-\d{4}$/;
  const sample = generateGuestNameClient(seqRng([0, 0, 0]));
  ok('a generated name matches AdjectiveNoun-NNNN', nameShapeRe.test(sample), sample);
  ok('the number segment is 4 digits, 1000-9999', /-(\d{4})$/.exec(sample) !== null, sample);
  const num = Number(sample.split('-')[1]);
  ok('the number is in range [1000, 9999]', num >= 1000 && num <= 9999, num);

  // --- determinism ----------------------------------------------------------
  ok(
    'the same rng sequence produces the same name (mirrors server/src/guest.ts)',
    generateGuestNameClient(seqRng([0, 0, 0])) === generateGuestNameClient(seqRng([0, 0, 0])),
  );
  ok(
    'a different rng sequence can produce a different name',
    generateGuestNameClient(seqRng([0, 0, 0])) !== generateGuestNameClient(seqRng([0.99, 0.99, 0.99])),
  );
  ok(
    'the first adjective (rng=0) is the first entry in ADJECTIVES',
    generateGuestNameClient(seqRng([0, 0, 0])).startsWith(ADJECTIVES[0]),
  );
  ok(
    'the noun draw (rng=0) is the first entry in NOUNS',
    generateGuestNameClient(seqRng([0, 0, 0])) === `${ADJECTIVES[0]}${NOUNS[0]}-1000`,
  );

  // --- length cap: adjective + noun must be <= 14 chars (full name <= 19 with suffix) ---
  {
    let allCapped = true;
    let longestPair = '';
    for (let s = 0; s < 500; s++) {
      const name = generateGuestNameClient(seqRng([Math.random(), Math.random(), Math.random()]));
      const adjNoun = name.split('-')[0]; // e.g. "SwiftNarwhal"
      if (adjNoun.length > 14) {
        allCapped = false;
        longestPair = adjNoun;
        break;
      }
    }
    ok('500 random draws all have adjective+noun <= 14 chars', allCapped, longestPair);
  }

  {
    const a = generateGuestNameClient(seqRng([0.2, 0.3, 0.5]));
    const b = generateGuestNameClient(seqRng([0.2, 0.3, 0.5]));
    const aPair = a.split('-')[0];
    ok(
      'determinism preserved with length cap: same rng -> same name and valid length',
      a === b && aPair.length <= 14,
      [a, aPair.length],
    );
  }

  // --- persistence across "restarts" (storage fake) --------------------------
  const storage = fakeStorage();
  const first = await getOrCreateGuestName(storage, seqRng([0.1, 0.2, 0.3]));
  const second = await getOrCreateGuestName(storage, seqRng([0.9, 0.9, 0.9])); // different rng -- should be ignored
  ok('the second call returns the persisted name, not a freshly generated one', second === first, {
    first,
    second,
  });

  const freshDevice = fakeStorage();
  const generated = await getOrCreateGuestName(freshDevice, seqRng([0.1, 0.2, 0.3]));
  ok('a blank device generates a name matching the shape', nameShapeRe.test(generated), generated);
  ok(
    'two independent blank devices are not forced to collide',
    generated !== (await getOrCreateGuestName(fakeStorage(), seqRng([0.99, 0.99, 0.99]))),
  );

  // --- single-flight guard (extracted pure helper backing ensureSession) -----
  {
    let calls = 0;
    const guarded = singleFlight(async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return calls;
    });
    const [a, b, c] = await Promise.all([guarded(), guarded(), guarded()]);
    ok('concurrent callers share one in-flight call', calls === 1, calls);
    ok('concurrent callers all resolve to the same result', a === b && b === c, { a, b, c });

    const after = await guarded();
    ok('a call after the previous one settles starts a fresh call', after === 2, after);
  }

  {
    // A rejecting factory must not wedge the guard: after it settles (even by
    // throwing) the next call tries again rather than replaying the rejection.
    let attempt = 0;
    const guarded = singleFlight(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('first attempt fails');
      return 'ok';
    });
    let firstFailed = false;
    try {
      await guarded();
    } catch {
      firstFailed = true;
    }
    ok('a rejected in-flight call surfaces the rejection', firstFailed);
    const retried = await guarded();
    ok('the guard is clear after a rejection, so the next call retries', retried === 'ok' && attempt === 2, attempt);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

void main();
