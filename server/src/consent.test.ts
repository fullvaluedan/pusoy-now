// Tests for marketing consent record/read logic.
//
// The pure record/read logic runs against an in-memory store, so the plan's
// scenarios - opt-in recorded with timestamp+source, re-submit updates not
// duplicates, opt-out recorded, missing row returns null - are proven with no
// D1. The route's session gate (unauthenticated request rejected) is the same
// requireUserId mechanism proven for entitlements/profile and is verified
// live by the orchestrator.
//
// Run: tsx src/consent.test.ts (or via npm test)

import { getConsent, recordConsent, type ConsentRow, type ConsentStore } from './consent';

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

// In-memory store: one row per user, the same "no history, just the current
// choice" shape the D1 primary-key upsert gives.
function memStore() {
  const byUser = new Map<string, ConsentRow>();
  const store: ConsentStore = {
    async get(userId) {
      return byUser.get(userId) ?? null;
    },
    async upsert(userId, optIn, source, now) {
      byUser.set(userId, { userId, optIn, source, updatedAt: now });
    },
  };
  return { store, byUser };
}

async function main() {
  const now = 1_700_000_000_000;

  // --- upsert: opt-in recorded with timestamp + source -----------------------
  {
    const { store } = memStore();
    const row = await recordConsent(store, 'user-1', true, 'signup', now);
    ok('opt-in is recorded true', row.optIn === true);
    ok('the source is recorded', row.source === 'signup');
    ok('the timestamp is recorded', row.updatedAt === now);
    ok('getConsent reads the same row back', (await getConsent(store, 'user-1'))?.optIn === true);
  }

  // --- upsert: opt-out recorded ----------------------------------------------
  {
    const { store } = memStore();
    const row = await recordConsent(store, 'user-1', false, 'prompt', now);
    ok('opt-out is recorded false', row.optIn === false);
    ok('a declined prompt still leaves a row (so the prompt never repeats)', (await getConsent(store, 'user-1')) !== null);
  }

  // --- re-submit updates the same row, not a duplicate -----------------------
  {
    const { store, byUser } = memStore();
    await recordConsent(store, 'user-1', false, 'prompt', now);
    await recordConsent(store, 'user-1', true, 'settings', now + 1000);
    ok('only one row exists per user after re-submitting', byUser.size === 1);
    const row = await getConsent(store, 'user-1');
    ok(
      'the row reflects the latest choice',
      row?.optIn === true && row?.source === 'settings' && row?.updatedAt === now + 1000,
    );
  }

  // --- missing row returns null -----------------------------------------------
  {
    const { store } = memStore();
    ok('a user with no consent row reads null', (await getConsent(store, 'nobody')) === null);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

void main();
