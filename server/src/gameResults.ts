// Per-game results + head-to-head (Round 9, U3).
//
// Every finished online game with 2+ humans writes one game_result row and one
// game_result_player row per human (their finishing place, 1 = best). From
// those rows, head-to-head is a pairwise comparison: for each game two players
// both played, the one with the lower place beat the other.
//
// The store seam and the pure record/read logic are split from D1 - the same
// shape as consent.ts / friends.ts - so idempotency and the pairwise W/L math
// are unit-testable against an in-memory store with no D1. The room DO wires
// the d1 store into recordStats(); the friends route wires headToHead() into
// its payload. Both writes are INSERT OR IGNORE, so an alarm retry that re-runs
// the finish path records each game exactly once.

export interface HeadToHeadRow {
  friendId: string;
  wins: number; // shared games where the caller placed ahead of this friend
  losses: number; // shared games where the caller placed behind this friend
}

export interface GameResultStore {
  insertGame(gameId: string, code: string, finishedAt: number): Promise<void>; // idempotent (OR IGNORE)
  insertPlayer(gameId: string, userId: string, place: number): Promise<void>; // idempotent (OR IGNORE)
  // Caller-vs-friends W/L in one query: join game_result_player to itself on
  // gameId (caller side a, friend side b), aggregate per friend. Friends with
  // no shared games are simply absent from the result.
  headToHeadRows(callerId: string, friendIds: string[]): Promise<HeadToHeadRow[]>;
}

// Record a finished game's per-player placings. A no-op below 2 players: solo
// vs bots stays aggregate-only (player_stats), never head-to-head. Idempotent
// via the store's OR IGNORE writes, so re-recording the same gameId is safe.
export async function recordGameResult(
  store: GameResultStore,
  gameId: string,
  code: string,
  finishedAt: number,
  placings: { userId: string; place: number }[],
): Promise<void> {
  if (placings.length < 2) return;
  await store.insertGame(gameId, code, finishedAt);
  for (const p of placings) {
    await store.insertPlayer(gameId, p.userId, p.place);
  }
}

// The caller's head-to-head vs each friend id, as a Record keyed by friend id.
// Every requested friend gets an entry: friends absent from the shared-game
// rows default to {wins: 0, losses: 0}.
export async function headToHead(
  store: GameResultStore,
  callerId: string,
  friendIds: string[],
): Promise<Record<string, { wins: number; losses: number }>> {
  const out: Record<string, { wins: number; losses: number }> = {};
  for (const id of friendIds) out[id] = { wins: 0, losses: 0 };
  if (friendIds.length === 0) return out;
  const rows = await store.headToHeadRows(callerId, friendIds);
  for (const r of rows) {
    if (out[r.friendId]) out[r.friendId] = { wins: r.wins, losses: r.losses };
  }
  return out;
}

// --- D1-backed store ---------------------------------------------------------

export function d1GameResultStore(db: D1Database): GameResultStore {
  return {
    async insertGame(gameId, code, finishedAt) {
      await db
        .prepare('INSERT OR IGNORE INTO game_result (gameId, code, finishedAt) VALUES (?, ?, ?)')
        .bind(gameId, code, finishedAt)
        .run();
    },
    async insertPlayer(gameId, userId, place) {
      await db
        .prepare('INSERT OR IGNORE INTO game_result_player (gameId, userId, place) VALUES (?, ?, ?)')
        .bind(gameId, userId, place)
        .run();
    },
    async headToHeadRows(callerId, friendIds) {
      if (friendIds.length === 0) return [];
      const placeholders = friendIds.map(() => '?').join(',');
      const { results } = await db
        .prepare(
          `SELECT b.userId AS friendId,
             SUM(CASE WHEN a.place < b.place THEN 1 ELSE 0 END) AS wins,
             SUM(CASE WHEN a.place > b.place THEN 1 ELSE 0 END) AS losses
           FROM game_result_player a
           JOIN game_result_player b ON a.gameId = b.gameId
           WHERE a.userId = ? AND b.userId IN (${placeholders})
           GROUP BY b.userId`,
        )
        .bind(callerId, ...friendIds)
        .all<{ friendId: string; wins: number; losses: number }>();
      return (results ?? []).map((r) => ({
        friendId: r.friendId,
        wins: Number(r.wins) || 0,
        losses: Number(r.losses) || 0,
      }));
    },
  };
}
