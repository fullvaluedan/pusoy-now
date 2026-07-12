// Cumulative player stats: one growing row per user, synced from the client
// after each counted game and written server-side by the room DO after online
// games (U7). Ranking reads firsts (1st-place finishes) with win-rate as the
// tiebreak.
//
// The upsert is MONOTONIC: a push whose game count does not advance, or whose
// any bucket went backwards, is ignored. That is what makes the sync safe to
// retry and hard to forge downward. The pure decision (shouldApplyStats) and
// the flow (syncStats) are unit-tested against an in-memory store; the D1 store
// and the many-read for ranking are thin and verified live.

import type { StatTotals } from './friends';

// Coerce an untrusted body into non-negative integer totals. Missing or bad
// fields become 0, so a malformed push can never write NaN or a negative.
export function sanitizeTotals(input: unknown): StatTotals {
  const o = (input ?? {}) as Record<string, unknown>;
  const n = (v: unknown): number => {
    const x = Math.floor(Number(v));
    return Number.isFinite(x) && x >= 0 ? x : 0;
  };
  return {
    games: n(o.games),
    firsts: n(o.firsts),
    seconds: n(o.seconds),
    thirds: n(o.thirds),
    fourths: n(o.fourths),
  };
}

// Whether a push should be applied over the current row. First write always
// applies. Otherwise the game count must strictly advance (a stale or forged
// equal/lower total is ignored) and no bucket may go backwards, since
// cumulative totals only ever grow.
export function shouldApplyStats(prev: StatTotals | null, next: StatTotals): boolean {
  if (!prev) return true;
  if (next.games <= prev.games) return false;
  return (
    next.firsts >= prev.firsts &&
    next.seconds >= prev.seconds &&
    next.thirds >= prev.thirds &&
    next.fourths >= prev.fourths
  );
}

export interface StatsStore {
  get(userId: string): Promise<StatTotals | null>;
  set(userId: string, totals: StatTotals, now: number): Promise<void>;
}

// Apply a monotonic sync. Returns whether it was applied and the totals that
// now stand (the pushed ones if applied, else the retained current ones).
export async function syncStats(
  store: StatsStore,
  userId: string,
  next: StatTotals,
  now: number,
): Promise<{ applied: boolean; totals: StatTotals }> {
  const prev = await store.get(userId);
  if (!shouldApplyStats(prev, next)) {
    return { applied: false, totals: prev ?? next };
  }
  await store.set(userId, next, now);
  return { applied: true, totals: next };
}

export function d1StatsStore(db: D1Database): StatsStore {
  return {
    async get(userId) {
      const row = await db
        .prepare('SELECT games, firsts, seconds, thirds, fourths FROM player_stats WHERE user_id = ?')
        .bind(userId)
        .first<StatTotals>();
      return row ?? null;
    },
    async set(userId, t, now) {
      await db
        .prepare(
          `INSERT INTO player_stats (user_id, games, firsts, seconds, thirds, fourths, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             games = excluded.games, firsts = excluded.firsts, seconds = excluded.seconds,
             thirds = excluded.thirds, fourths = excluded.fourths, updated_at = excluded.updated_at`,
        )
        .bind(userId, t.games, t.firsts, t.seconds, t.thirds, t.fourths, now)
        .run();
    },
  };
}

// Fetch stat totals for a set of user ids (self + friends) in one query, for
// the ranking route.
export async function fetchStatsMany(db: D1Database, ids: string[]): Promise<Map<string, StatTotals>> {
  const map = new Map<string, StatTotals>();
  if (ids.length === 0) return map;
  const placeholders = ids.map(() => '?').join(',');
  const { results } = await db
    .prepare(
      `SELECT user_id AS userId, games, firsts, seconds, thirds, fourths
       FROM player_stats WHERE user_id IN (${placeholders})`,
    )
    .bind(...ids)
    .all<StatTotals & { userId: string }>();
  for (const r of results ?? []) {
    map.set(r.userId, { games: r.games, firsts: r.firsts, seconds: r.seconds, thirds: r.thirds, fourths: r.fourths });
  }
  return map;
}
