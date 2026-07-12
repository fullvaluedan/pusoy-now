// Tests for the friends lifecycle, ranking, and the monotonic stats upsert.
//
// Everything runs against in-memory stores, so the plan's scenarios - request
// to accept, decline, remove, duplicate idempotent, self-friend rejected, IDOR
// (accepting a request not addressed to you) rejected, stats monotonic, ranking
// order incl. tiebreak - are proven with no D1. The route's session gate (guest
// sync rejected) is the same requireUserId mechanism proven elsewhere and is
// verified live by the orchestrator.
//
// Run: tsx src/friends.test.ts (or via npm test)

import {
  acceptRequest,
  declineRequest,
  ensureFriendship,
  listFriends,
  orderPair,
  rankUsers,
  removeFriend,
  sendRequest,
  type FriendStore,
  type FriendshipRow,
  type StatTotals,
} from './friends';
import { sanitizeTotals, shouldApplyStats, syncStats, type StatsStore } from './stats';
import { headToHead, type GameResultStore } from './gameResults';

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

// In-memory FriendStore keyed on the ordered pair, mirroring the D1 primary key.
function memFriendStore() {
  const rows = new Map<string, FriendshipRow>();
  const key = (a: string, b: string) => `${a}|${b}`;
  const store: FriendStore = {
    async get(a, b) {
      return rows.get(key(a, b)) ?? null;
    },
    async insertPending(a, b, requestedBy) {
      if (rows.has(key(a, b))) return false;
      rows.set(key(a, b), { aUserId: a, bUserId: b, status: 'pending', requestedBy });
      return true;
    },
    async setAccepted(a, b) {
      const r = rows.get(key(a, b));
      if (r) r.status = 'accepted';
    },
    async ensureAccepted(a, b, requestedBy) {
      const r = rows.get(key(a, b));
      if (r) r.status = 'accepted';
      else rows.set(key(a, b), { aUserId: a, bUserId: b, status: 'accepted', requestedBy });
    },
    async remove(a, b) {
      return rows.delete(key(a, b));
    },
    async listForUser(userId) {
      return [...rows.values()].filter((r) => r.aUserId === userId || r.bUserId === userId);
    },
  };
  return { store, rows };
}

function memStatsStore() {
  const data = new Map<string, StatTotals>();
  const store: StatsStore = {
    async get(userId) {
      return data.get(userId) ?? null;
    },
    async set(userId, totals) {
      data.set(userId, { ...totals });
    },
  };
  return { store, data };
}

const totals = (games: number, firsts: number, seconds = 0, thirds = 0, fourths = 0): StatTotals => ({
  games, firsts, seconds, thirds, fourths,
});

async function main() {
  const now = 1_700_000_000_000;

  // --- orderPair ------------------------------------------------------------
  ok('orderPair sorts the pair', (() => {
    const p1 = orderPair('zed', 'ada');
    const p2 = orderPair('ada', 'zed');
    return p1.a === 'ada' && p1.b === 'zed' && p2.a === 'ada' && p2.b === 'zed';
  })());

  // --- request -> accept lifecycle -----------------------------------------
  {
    const { store } = memFriendStore();
    ok('a request is sent', (await sendRequest(store, 'ada', 'bo', now)) === 'sent');

    // Before acceptance: outgoing for ada, incoming for bo.
    const adaLists = await listFriends(store, 'ada');
    const boLists = await listFriends(store, 'bo');
    ok('the request is outgoing for the sender', adaLists.outgoing.includes('bo') && adaLists.incoming.length === 0);
    ok('the request is incoming for the recipient', boLists.incoming.includes('ada') && boLists.outgoing.length === 0);

    ok('the recipient accepts', (await acceptRequest(store, 'bo', 'ada', now)) === 'accepted');
    const afterAda = await listFriends(store, 'ada');
    const afterBo = await listFriends(store, 'bo');
    ok('both sides now list an accepted friend', afterAda.accepted.includes('bo') && afterBo.accepted.includes('ada'));
    ok('no pending remains after acceptance', afterAda.outgoing.length === 0 && afterBo.incoming.length === 0);
  }

  // --- self-friend rejected -------------------------------------------------
  {
    const { store, rows } = memFriendStore();
    ok('a self request is rejected', (await sendRequest(store, 'ada', 'ada', now)) === 'self');
    ok('no row was created for a self request', rows.size === 0);
  }

  // --- duplicate request idempotent ----------------------------------------
  {
    const { store, rows } = memFriendStore();
    await sendRequest(store, 'ada', 'bo', now);
    ok('a duplicate request is idempotent', (await sendRequest(store, 'ada', 'bo', now)) === 'already-pending');
    ok('a duplicate request does not add a row', rows.size === 1);
    await acceptRequest(store, 'bo', 'ada', now);
    ok('requesting an existing friend reports already-friends', (await sendRequest(store, 'ada', 'bo', now)) === 'already-friends');
  }

  // --- IDOR: accepting a request not addressed to you ----------------------
  {
    const { store } = memFriendStore();
    await sendRequest(store, 'ada', 'bo', now);
    // The sender cannot accept their own outgoing request.
    ok('the initiator cannot accept their own request (IDOR)', (await acceptRequest(store, 'ada', 'bo', now)) === 'forbidden');
    // A third party names a pair that does not exist, so there is nothing to act on.
    ok('a third party cannot accept a request between two others', (await acceptRequest(store, 'cy', 'bo', now)) === 'not-found');
    // The request is still pending and acceptable by its actual recipient.
    ok('the real recipient can still accept', (await acceptRequest(store, 'bo', 'ada', now)) === 'accepted');
  }

  // --- decline --------------------------------------------------------------
  {
    const { store, rows } = memFriendStore();
    await sendRequest(store, 'ada', 'bo', now);
    ok('the initiator cannot decline their own request', (await declineRequest(store, 'ada', 'bo')) === 'forbidden');
    ok('the recipient declines', (await declineRequest(store, 'bo', 'ada')) === 'declined');
    ok('a declined request is removed', rows.size === 0);
    ok('declining a nonexistent request is not-found', (await declineRequest(store, 'bo', 'ada')) === 'not-found');
  }

  // --- remove ---------------------------------------------------------------
  {
    const { store, rows } = memFriendStore();
    await sendRequest(store, 'ada', 'bo', now);
    await acceptRequest(store, 'bo', 'ada', now);
    ok('either party can remove the friendship', (await removeFriend(store, 'ada', 'bo')) === 'removed');
    ok('the friendship row is gone', rows.size === 0);
    ok('removing a nonexistent friendship is not-found', (await removeFriend(store, 'ada', 'bo')) === 'not-found');
  }

  // --- auto-friend (idempotent pairwise) -----------------------------------
  {
    const { store, rows } = memFriendStore();
    await ensureFriendship(store, 'ada', 'bo', now);
    await ensureFriendship(store, 'ada', 'bo', now); // idempotent
    ok('auto-friend creates exactly one accepted row', rows.size === 1);
    const lists = await listFriends(store, 'ada');
    ok('auto-friend is immediately accepted', lists.accepted.includes('bo'));
    // A prior pending request upgrades to accepted on auto-friend.
    const { store: s2 } = memFriendStore();
    await sendRequest(s2, 'ada', 'bo', now);
    await ensureFriendship(s2, 'bo', 'ada', now);
    ok('auto-friend upgrades a pending request to accepted', (await listFriends(s2, 'ada')).accepted.includes('bo'));
    const { store: s3, rows: r3 } = memFriendStore();
    await ensureFriendship(s3, 'ada', 'ada', now);
    ok('auto-friend on self is a no-op', r3.size === 0);
  }

  // --- ranking: firsts desc, win-rate tiebreak -----------------------------
  {
    const stats = new Map<string, StatTotals>([
      ['ada', totals(10, 5)], // 5 firsts, 50%
      ['bo', totals(4, 5)],   // 5 firsts, 125%? no - 5/4, higher win rate, wins the tie
      ['cy', totals(20, 8)],  // 8 firsts, ranks first outright
      ['di', totals(0, 0)],   // no games, ranks last
    ]);
    const ranked = rankUsers(['ada', 'bo', 'cy', 'di'], stats);
    ok('most firsts ranks first', ranked[0].userId === 'cy');
    ok('a win-rate tiebreak orders equal firsts', ranked[1].userId === 'bo' && ranked[2].userId === 'ada');
    ok('a user with no games still appears, ranked last', ranked[3].userId === 'di');
    ok('ranking includes everyone passed in', ranked.length === 4);
    ok('a missing stats row ranks as zeros', (() => {
      const r = rankUsers(['ghost'], new Map());
      return r[0].firsts === 0 && r[0].games === 0 && r[0].winRate === 0;
    })());
  }

  // --- stats: monotonic upsert ---------------------------------------------
  {
    ok('first write applies', shouldApplyStats(null, totals(1, 1)) === true);
    ok('a higher game count applies', shouldApplyStats(totals(5, 2), totals(6, 3)) === true);
    ok('an equal game count is ignored', shouldApplyStats(totals(5, 2), totals(5, 3)) === false);
    ok('a lower game count is ignored', shouldApplyStats(totals(5, 2), totals(4, 2)) === false);
    ok('a backwards bucket is ignored even if games advanced', shouldApplyStats(totals(5, 3), totals(6, 2)) === false);

    const { store, data } = memStatsStore();
    const first = await syncStats(store, 'ada', totals(3, 1, 1, 1), now);
    ok('a sync applies and stores the totals', first.applied && data.get('ada')?.games === 3);
    const stale = await syncStats(store, 'ada', totals(2, 1), now);
    ok('a stale (lower) sync is ignored', stale.applied === false);
    ok('the stored totals are unchanged after a stale sync', data.get('ada')?.games === 3);
    const advance = await syncStats(store, 'ada', totals(4, 2, 1, 1), now);
    ok('an advancing sync applies', advance.applied && data.get('ada')?.firsts === 2);
  }

  // --- friends payload: head-to-head field ----------------------------------
  // The GET /api/friends route decorates each accepted friend with
  // `h2h: {wins, losses}` from a batched headToHead call. A pair of accepted
  // friends the caller has never shared a finished game with resolves to {0,0}
  // (the additive field is always present, never null).
  {
    const { store: friendStore } = memFriendStore();
    await ensureFriendship(friendStore, 'me', 'bo', now);
    await ensureFriendship(friendStore, 'me', 'cy', now);
    const { accepted } = await listFriends(friendStore, 'me');
    // No game_result rows recorded, so every accepted friend maps to {0,0}.
    const emptyResults: GameResultStore = {
      async insertGame() {},
      async insertPlayer() {},
      async headToHeadRows() {
        return [];
      },
    };
    const h2h = await headToHead(emptyResults, 'me', accepted);
    ok('every accepted friend gets an h2h entry',
      accepted.every((id) => h2h[id] !== undefined) && Object.keys(h2h).length === accepted.length);
    ok('a friend with no shared games -> {0,0}',
      accepted.every((id) => h2h[id].wins === 0 && h2h[id].losses === 0), h2h);
  }

  // --- sanitizeTotals -------------------------------------------------------
  {
    const s = sanitizeTotals({ games: '7', firsts: 3, seconds: -2, thirds: 1.9, fourths: 'x' });
    ok('sanitize coerces strings, floors, and clamps to non-negative ints',
      s.games === 7 && s.firsts === 3 && s.seconds === 0 && s.thirds === 1 && s.fourths === 0);
    const empty = sanitizeTotals(undefined);
    ok('sanitize turns a missing body into zeros', empty.games === 0 && empty.firsts === 0);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

void main();
