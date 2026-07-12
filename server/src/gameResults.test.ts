// Tests for per-game result recording + head-to-head.
//
// Everything runs against an in-memory GameResultStore that mirrors the D1
// primary keys (INSERT OR IGNORE = "first write wins" on the game id / the
// (gameId, userId) pair), so the plan's scenarios - 2+ humans record once,
// idempotent double-record, solo game records nothing, pairwise W/L across two
// shared games, no shared games -> {0,0}, a friend who only played others ->
// {0,0}, batched multi-friend - are proven with no D1. The route's session
// gate is the same requireUserId mechanism proven elsewhere.
//
// Run: tsx src/gameResults.test.ts (or via npm test)

import {
  headToHead,
  recordGameResult,
  type GameResultStore,
  type HeadToHeadRow,
} from './gameResults';

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

// In-memory store: games keyed by gameId, players keyed by (gameId, userId),
// each write "OR IGNORE" (first write wins) exactly like the D1 primary keys.
function memStore() {
  const games = new Map<string, { code: string; finishedAt: number }>();
  const players = new Map<string, { gameId: string; userId: string; place: number }>();
  const pkey = (gameId: string, userId: string) => `${gameId}|${userId}`;
  const store: GameResultStore = {
    async insertGame(gameId, code, finishedAt) {
      if (!games.has(gameId)) games.set(gameId, { code, finishedAt });
    },
    async insertPlayer(gameId, userId, place) {
      const k = pkey(gameId, userId);
      if (!players.has(k)) players.set(k, { gameId, userId, place });
    },
    async headToHeadRows(callerId, friendIds) {
      const friendSet = new Set(friendIds);
      // Group the caller's placings by gameId, then compare against each friend
      // who shared that game - the self-join the D1 query does, in memory.
      const byGame = new Map<string, { userId: string; place: number }[]>();
      for (const p of players.values()) {
        const arr = byGame.get(p.gameId) ?? [];
        arr.push({ userId: p.userId, place: p.place });
        byGame.set(p.gameId, arr);
      }
      const agg = new Map<string, { wins: number; losses: number }>();
      for (const seats of byGame.values()) {
        const mine = seats.find((s) => s.userId === callerId);
        if (!mine) continue;
        for (const s of seats) {
          if (!friendSet.has(s.userId)) continue;
          const cur = agg.get(s.userId) ?? { wins: 0, losses: 0 };
          if (mine.place < s.place) cur.wins++;
          else if (mine.place > s.place) cur.losses++;
          agg.set(s.userId, cur);
        }
      }
      const rows: HeadToHeadRow[] = [];
      for (const [friendId, wl] of agg) rows.push({ friendId, wins: wl.wins, losses: wl.losses });
      return rows;
    },
  };
  return { store, games, players };
}

async function main() {
  const now = 1_700_000_000_000;

  // --- a 3-human game records one game + three player rows, once -------------
  {
    const { store, games, players } = memStore();
    const placings = [
      { userId: 'ada', place: 1 },
      { userId: 'bo', place: 2 },
      { userId: 'cy', place: 3 },
    ];
    await recordGameResult(store, 'ROOM-h1', 'ROOM', now, placings);
    ok('a 3-human game records one game_result row', games.size === 1);
    ok('a 3-human game records three player rows', players.size === 3);

    // Idempotent: recording the same game again (an alarm retry) changes nothing.
    await recordGameResult(store, 'ROOM-h1', 'ROOM', now + 5000, placings);
    ok('re-recording the same game keeps one game row', games.size === 1);
    ok('re-recording the same game keeps three player rows', players.size === 3);
    ok('the original finishedAt is preserved (OR IGNORE, not overwrite)', games.get('ROOM-h1')?.finishedAt === now);
  }

  // --- a solo (1-human) game records nothing --------------------------------
  {
    const { store, games, players } = memStore();
    await recordGameResult(store, 'SOLO-h1', 'SOLO', now, [{ userId: 'ada', place: 1 }]);
    ok('a 1-human game records no game row', games.size === 0);
    ok('a 1-human game records no player rows', players.size === 0);
    // And an empty placings list is also a no-op.
    await recordGameResult(store, 'EMPTY-h1', 'EMPTY', now, []);
    ok('an empty placings list records nothing', games.size === 0 && players.size === 0);
  }

  // --- head-to-head across two shared games: 1 win + 1 loss -----------------
  {
    const { store } = memStore();
    // Game A: caller 1st, friend 2nd -> caller win.
    await recordGameResult(store, 'A-h1', 'A', now, [
      { userId: 'me', place: 1 },
      { userId: 'friend', place: 2 },
    ]);
    // Game B: caller 3rd, friend 1st -> caller loss.
    await recordGameResult(store, 'B-h1', 'B', now, [
      { userId: 'friend', place: 1 },
      { userId: 'other', place: 2 },
      { userId: 'me', place: 3 },
    ]);
    const h2h = await headToHead(store, 'me', ['friend']);
    ok('caller ahead in one game, behind in another -> {wins:1, losses:1}',
      h2h['friend'].wins === 1 && h2h['friend'].losses === 1, h2h['friend']);
  }

  // --- no shared games -> {0,0} ---------------------------------------------
  {
    const { store } = memStore();
    await recordGameResult(store, 'A-h1', 'A', now, [
      { userId: 'me', place: 1 },
      { userId: 'x', place: 2 },
    ]);
    const h2h = await headToHead(store, 'me', ['stranger']);
    ok('a friend the caller never shared a game with -> {0,0}',
      h2h['stranger'].wins === 0 && h2h['stranger'].losses === 0, h2h['stranger']);
  }

  // --- a friend who only played OTHER people -> {0,0} -----------------------
  {
    const { store } = memStore();
    // A game between the friend and a third party, the caller not in it.
    await recordGameResult(store, 'A-h1', 'A', now, [
      { userId: 'friend', place: 1 },
      { userId: 'other', place: 2 },
    ]);
    const h2h = await headToHead(store, 'me', ['friend']);
    ok('a friend with games only vs others -> {0,0}',
      h2h['friend'].wins === 0 && h2h['friend'].losses === 0, h2h['friend']);
  }

  // --- multiple friends batched in one call ---------------------------------
  {
    const { store } = memStore();
    // One game: me 1st, f1 2nd (I beat f1), f2 3rd (I beat f2).
    await recordGameResult(store, 'A-h1', 'A', now, [
      { userId: 'me', place: 1 },
      { userId: 'f1', place: 2 },
      { userId: 'f2', place: 3 },
    ]);
    // Another game: f2 1st, me 2nd (f2 beat me), f3 not present here.
    await recordGameResult(store, 'B-h1', 'B', now, [
      { userId: 'f2', place: 1 },
      { userId: 'me', place: 2 },
    ]);
    const h2h = await headToHead(store, 'me', ['f1', 'f2', 'f3']);
    ok('batched: f1 -> {1,0}', h2h['f1'].wins === 1 && h2h['f1'].losses === 0, h2h['f1']);
    ok('batched: f2 -> {1,1} (beat once, lost once)', h2h['f2'].wins === 1 && h2h['f2'].losses === 1, h2h['f2']);
    ok('batched: f3 (never shared a game) -> {0,0}', h2h['f3'].wins === 0 && h2h['f3'].losses === 0, h2h['f3']);
    ok('every requested friend has an entry', Object.keys(h2h).length === 3);
  }

  // --- an empty friend list short-circuits to {} ----------------------------
  {
    const { store } = memStore();
    const h2h = await headToHead(store, 'me', []);
    ok('no friends -> empty record', Object.keys(h2h).length === 0);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

void main();
