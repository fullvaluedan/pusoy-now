// Tests for the anonymous -> real account merge logic.
//
// The three copy rules run against an in-memory fake store, so the plan's
// scenarios - stats per-bucket max, no-op with no anon stats, friendship
// dedupe + no self-friendship, consent-only-if-none, and error containment in
// the hook wrapper - are proven with no D1. The D1 store is thin (mirrors
// stats.ts / consent.ts upserts) and verified live by the orchestrator.
//
// Run: tsx src/linkMerge.test.ts (or via npm test)

import {
  mergeOnLink,
  mergeOnLinkSafe,
  type ConsentData,
  type FriendshipRow,
  type LinkMergeStore,
  type StatBuckets,
} from './linkMerge';

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

// In-memory fake store over plain Maps/arrays, matching the D1 tables:
// player_stats (one row per user), friendship (canonical a<b pairs), and
// marketing_consent (one row per user).
function memStore() {
  const stats = new Map<string, StatBuckets>();
  const friendships: FriendshipRow[] = [];
  const consent = new Map<string, ConsentData>();

  const store: LinkMergeStore = {
    async getStats(userId) {
      const b = stats.get(userId);
      return b ? { ...b } : null;
    },
    async setStats(userId, b) {
      stats.set(userId, { ...b });
    },
    async getFriendships(userId) {
      return friendships
        .filter((f) => f.aUserId === userId || f.bUserId === userId)
        .map((f) => ({ ...f }));
    },
    async hasFriendship(aUserId, bUserId) {
      return friendships.some((f) => f.aUserId === aUserId && f.bUserId === bUserId);
    },
    async insertFriendship(row) {
      if (friendships.some((f) => f.aUserId === row.aUserId && f.bUserId === row.bUserId)) return;
      friendships.push({ ...row });
    },
    async getConsent(userId) {
      const c = consent.get(userId);
      return c ? { ...c } : null;
    },
    async setConsent(userId, optIn, source, now) {
      consent.set(userId, { optIn, source, updatedAt: now });
    },
  };
  return { store, stats, friendships, consent };
}

// Insert a friendship in canonical (a < b) order directly into the fake.
function seedFriendship(
  friendships: FriendshipRow[],
  u1: string,
  u2: string,
  requestedBy: string,
) {
  const aUserId = u1 < u2 ? u1 : u2;
  const bUserId = u1 < u2 ? u2 : u1;
  friendships.push({ aUserId, bUserId, status: 'accepted', requestedBy, createdAt: 1, updatedAt: 1 });
}

async function main() {
  const now = 1_700_000_000_000;

  // --- stats: per-bucket max when both sides have rows ----------------------
  {
    const { store, stats } = memStore();
    stats.set('anon', { games: 10, firsts: 5, seconds: 2, thirds: 1, fourths: 0 });
    stats.set('new', { games: 8, firsts: 1, seconds: 3, thirds: 0, fourths: 4 });
    await mergeOnLink(store, 'anon', 'new', now);
    const merged = stats.get('new');
    ok(
      'stats merge takes the max of each bucket',
      merged?.games === 10 &&
        merged?.firsts === 5 &&
        merged?.seconds === 3 &&
        merged?.thirds === 1 &&
        merged?.fourths === 4,
      merged,
    );
  }

  // --- stats: anon has a row, new has none -> straight copy -----------------
  {
    const { store, stats } = memStore();
    stats.set('anon', { games: 7, firsts: 3, seconds: 1, thirds: 2, fourths: 1 });
    await mergeOnLink(store, 'anon', 'new', now);
    const copied = stats.get('new');
    ok('stats copy over when the new user has none', copied?.games === 7 && copied?.firsts === 3, copied);
  }

  // --- stats: no anon stats is a no-op --------------------------------------
  {
    const { store, stats } = memStore();
    stats.set('new', { games: 4, firsts: 2, seconds: 0, thirds: 1, fourths: 1 });
    await mergeOnLink(store, 'anon', 'new', now);
    const after = stats.get('new');
    ok(
      'merge with no anon stats leaves the new user untouched',
      after?.games === 4 && after?.firsts === 2 && !stats.has('anon'),
      after,
    );
  }

  // --- friendship: copy, dedupe, and no self-friendship ---------------------
  {
    const { store, friendships } = memStore();
    seedFriendship(friendships, 'anon', 'x', 'anon'); // guest befriended x
    seedFriendship(friendships, 'anon', 'y', 'anon'); // guest befriended y (initiator)
    seedFriendship(friendships, 'new', 'x', 'new'); // new already friends with x (dup)
    seedFriendship(friendships, 'anon', 'new', 'anon'); // guest "friends" its own future acct
    const before = friendships.length;

    await mergeOnLink(store, 'anon', 'new', now);

    const newY = friendships.filter(
      (f) => (f.aUserId === 'new' && f.bUserId === 'y') || (f.aUserId === 'y' && f.bUserId === 'new'),
    );
    const newX = friendships.filter(
      (f) => (f.aUserId === 'new' && f.bUserId === 'x') || (f.aUserId === 'x' && f.bUserId === 'new'),
    );
    const selfRows = friendships.filter((f) => f.aUserId === 'new' && f.bUserId === 'new');

    ok('a guest friendship is copied onto the new user (new<->y)', newY.length === 1, newY);
    ok('the copied requester is remapped from anon to new', newY[0]?.requestedBy === 'new', newY[0]);
    ok('the copied row uses the merge timestamp', newY[0]?.updatedAt === now, newY[0]);
    ok('an existing friendship (new<->x) is not duplicated', newX.length === 1, newX);
    ok('no self-friendship (new<->new) is ever created', selfRows.length === 0, selfRows);
    ok('exactly one new friendship row was added', friendships.length === before + 1, {
      before,
      after: friendships.length,
    });
  }

  // --- consent: moves only when the target has none -------------------------
  {
    const { store, consent } = memStore();
    consent.set('anon', { optIn: true, source: 'signup', updatedAt: 111 });
    await mergeOnLink(store, 'anon', 'new', now);
    const moved = consent.get('new');
    ok(
      'consent is copied when the new user has none (preserving optIn/source)',
      moved?.optIn === true && moved?.source === 'signup',
      moved,
    );
  }
  {
    const { store, consent } = memStore();
    consent.set('anon', { optIn: true, source: 'signup', updatedAt: 111 });
    consent.set('new', { optIn: false, source: 'prompt', updatedAt: 222 });
    await mergeOnLink(store, 'anon', 'new', now);
    const kept = consent.get('new');
    ok(
      'an existing consent choice on the new user is never overwritten',
      kept?.optIn === false && kept?.source === 'prompt',
      kept,
    );
  }

  // --- error containment: mergeOnLink may throw; the hook wrapper catches ----
  {
    const throwingStore: LinkMergeStore = {
      async getStats() {
        throw new Error('boom');
      },
      async setStats() {},
      async getFriendships() {
        return [];
      },
      async hasFriendship() {
        return false;
      },
      async insertFriendship() {},
      async getConsent() {
        return null;
      },
      async setConsent() {},
    };

    let bareThrew = false;
    try {
      await mergeOnLink(throwingStore, 'anon', 'new', now);
    } catch {
      bareThrew = true;
    }
    ok('mergeOnLink itself propagates a store error', bareThrew);

    let safeThrew = false;
    // Silence the expected error log for a clean test run.
    const originalError = console.error;
    console.error = () => {};
    try {
      await mergeOnLinkSafe(throwingStore, 'anon', 'new', now);
    } catch {
      safeThrew = true;
    } finally {
      console.error = originalError;
    }
    ok('mergeOnLinkSafe contains a store error (never throws)', !safeThrew);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

void main();
