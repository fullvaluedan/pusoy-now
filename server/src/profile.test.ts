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
  canRename,
  checkUsername,
  claimUsername,
  renameUsername,
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
      const row: ProfileRow = { userId, username, usernameChanges: 0, avatarPref: null };
      byUser.set(userId, row);
      byName.set(username.toLowerCase(), row);
      return true;
    },
    async renameUsername(userId, newUsername, _now) {
      const row = byUser.get(userId);
      if (!row) return 'not-found';
      if (row.usernameChanges >= 1) return 'rename-limit';
      if (byName.has(newUsername.toLowerCase())) return 'taken';
      byName.delete(row.username.toLowerCase());
      row.username = newUsername;
      row.usernameChanges += 1;
      byName.set(newUsername.toLowerCase(), row);
      return 'ok';
    },
    async setAvatarPref(userId, pref, _now) {
      const row = byUser.get(userId);
      if (!row) return false;
      row.avatarPref = pref;
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
  ok('an offensive handle is rejected as inappropriate', (() => {
    const r = validateUsername('shithead');
    return !r.ok && r.reason === 'inappropriate';
  })());
  ok('a leetspeak-evaded slur is caught', (() => {
    const r = validateUsername('f4gg0t');
    return !r.ok && r.reason === 'inappropriate';
  })());
  ok('a clean handle that merely contains letters passes moderation', validateUsername('assistant_ada').ok === true);

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

  // --- rename: one free change ----------------------------------------------
  {
    const { store } = memStore();
    await claimUsername(store, 'user-1', 'first', now);
    ok('a fresh profile can rename', canRename(await store.getByUserId('user-1')) === true);
    const r1 = await renameUsername(store, 'user-1', 'second', now);
    ok('the first rename succeeds', r1.status === 'renamed' && r1.username === 'second');
    ok('the handle is now the new one', (await store.getByUserId('user-1'))?.username === 'second');
    ok('the spent profile can no longer rename', canRename(await store.getByUserId('user-1')) === false);
    const r2 = await renameUsername(store, 'user-1', 'third', now);
    ok('a second rename is refused at the limit', r2.status === 'rename-limit');
    ok('the handle is unchanged after a refused rename', (await store.getByUserId('user-1'))?.username === 'second');
    ok('the refused handle never got stored', (await store.getByUsername('third')) === null);
  }

  // --- rename: validation, moderation, collisions ---------------------------
  {
    const { store } = memStore();
    await claimUsername(store, 'user-1', 'alpha', now);
    await claimUsername(store, 'user-2', 'beta', now);
    ok('renaming to a taken handle is rejected', (await renameUsername(store, 'user-1', 'beta', now)).status === 'taken');
    ok('renaming to an invalid handle is rejected', (await renameUsername(store, 'user-1', 'no spaces', now)).status === 'invalid');
    const modr = await renameUsername(store, 'user-1', 'cuntface', now);
    ok('renaming to an offensive handle reports inappropriate', modr.status === 'invalid' && modr.reason === 'inappropriate');
    ok('a rejected rename did not spend the change', canRename(await store.getByUserId('user-1')) === true);
    const same = await renameUsername(store, 'user-1', 'alpha', now);
    ok('renaming to the current handle is a no-op that keeps the change', same.status === 'unchanged');
    ok('the no-op rename did not spend the change', canRename(await store.getByUserId('user-1')) === true);
  }

  // --- rename: needs an existing profile ------------------------------------
  {
    const { store } = memStore();
    ok('renaming with no profile yet says no-username', (await renameUsername(store, 'ghost', 'anything', now)).status === 'no-username');
  }

  // --- avatar preference -----------------------------------------------------
  {
    const { store } = memStore();
    await claimUsername(store, 'user-1', 'picky', now);
    ok('avatar pref starts null', (await store.getByUserId('user-1'))?.avatarPref === null);
    ok('setting a pref succeeds for a claimed user', (await store.setAvatarPref('user-1', 'letter', now)) === true);
    ok('the pref is persisted', (await store.getByUserId('user-1'))?.avatarPref === 'letter');
    ok('clearing the pref back to null works', (await store.setAvatarPref('user-1', null, now)) === true);
    ok('the pref is null again', (await store.getByUserId('user-1'))?.avatarPref === null);
    ok('setting a pref for a user with no profile fails', (await store.setAvatarPref('ghost', 'social', now)) === false);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

void main();
