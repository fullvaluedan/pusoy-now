// Tests for username validation and the claim/check flow.
//
// The pure validator and the claim/check logic run against an in-memory store,
// so the plan's scenarios - claim happy path, duplicate rejected
// case-insensitively, invalid charset/length rejected, second claim rejected -
// are proven with no D1. The route's session gate (unauthenticated claim
// rejected) is the same requireUserId mechanism proven for entitlements and is
// verified live by the orchestrator.
//
// Run: tsx src/profile.test.ts (or via npm test)

import {
  checkUsername,
  claimUsername,
  validateUsername,
  type ProfileRow,
  type ProfileStore,
} from './profile';

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

// In-memory store: usernames are keyed case-insensitively (lowercased), the
// same guarantee the D1 unique index gives.
function memStore() {
  const byUser = new Map<string, ProfileRow>();
  const byName = new Map<string, ProfileRow>();
  const store: ProfileStore = {
    async getByUserId(userId) {
      return byUser.get(userId) ?? null;
    },
    async getByUsername(username) {
      return byName.get(username.toLowerCase()) ?? null;
    },
    async insert(userId, username, _now) {
      if (byName.has(username.toLowerCase())) return false;
      const row: ProfileRow = { userId, username };
      byUser.set(userId, row);
      byName.set(username.toLowerCase(), row);
      return true;
    },
  };
  return { store, byUser, byName };
}

async function main() {
  const now = 1_700_000_000_000;

  // --- validateUsername -----------------------------------------------------
  ok('a clean handle is valid', validateUsername('ada_42').ok === true);
  ok('mixed case is lowercased', (() => {
    const r = validateUsername('AdaLovelace');
    return r.ok && r.username === 'adalovelace';
  })());
  ok('surrounding whitespace is trimmed', (() => {
    const r = validateUsername('  neo  ');
    return r.ok && r.username === 'neo';
  })());
  ok('too short is rejected', validateUsername('ab').ok === false);
  ok('too long is rejected', validateUsername('a'.repeat(21)).ok === false);
  ok('a too-short handle reports length', (() => {
    const r = validateUsername('ab');
    return !r.ok && r.reason === 'length';
  })());
  ok('spaces are rejected as charset', (() => {
    const r = validateUsername('ada lovelace');
    return !r.ok && r.reason === 'charset';
  })());
  ok('punctuation is rejected as charset', (() => {
    const r = validateUsername('ada!');
    return !r.ok && r.reason === 'charset';
  })());
  ok('a reserved word is rejected', (() => {
    const r = validateUsername('admin');
    return !r.ok && r.reason === 'reserved';
  })());
  ok('a reserved word is caught after lowercasing', (() => {
    const r = validateUsername('ADMIN');
    return !r.ok && r.reason === 'reserved';
  })());

  // --- claim: happy path ----------------------------------------------------
  {
    const { store } = memStore();
    const res = await claimUsername(store, 'user-1', 'Ada_42', now);
    ok('a claim succeeds and returns the normalized handle', res.status === 'claimed' && res.username === 'ada_42');
  }

  // --- claim: duplicate rejected case-insensitively -------------------------
  {
    const { store } = memStore();
    await claimUsername(store, 'user-1', 'ada', now);
    const dup = await claimUsername(store, 'user-2', 'ADA', now);
    ok('a duplicate handle is taken, case-insensitively', dup.status === 'taken');
  }

  // --- claim: invalid rejected ----------------------------------------------
  {
    const { store } = memStore();
    const bad = await claimUsername(store, 'user-1', 'no spaces', now);
    ok('an invalid handle is rejected before touching storage', bad.status === 'invalid');
    ok('nothing was stored for an invalid claim', (await store.getByUserId('user-1')) === null);
  }

  // --- claim: second claim rejected (rename deferred) -----------------------
  {
    const { store } = memStore();
    await claimUsername(store, 'user-1', 'first', now);
    const second = await claimUsername(store, 'user-1', 'second', now);
    ok('a second claim is rejected as already-claimed', second.status === 'already-claimed');
    ok('the original handle is unchanged', second.status === 'already-claimed' && second.username === 'first');
    ok('the second handle never got stored', (await store.getByUsername('second')) === null);
  }

  // --- check: availability --------------------------------------------------
  {
    const { store } = memStore();
    await claimUsername(store, 'user-1', 'taken_one', now);
    ok('a free handle is available', (await checkUsername(store, 'free_one')).status === 'available');
    ok('a held handle is taken', (await checkUsername(store, 'taken_one')).status === 'taken');
    ok('a held handle is taken case-insensitively', (await checkUsername(store, 'TAKEN_ONE')).status === 'taken');
    ok('an invalid handle is flagged invalid on check', (await checkUsername(store, 'x')).status === 'invalid');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

void main();
