// Anonymous -> real account merge (U1). When a guest signs up for a real
// account, better-auth fires `onLinkAccount` and then DELETES the anonymous
// user row (cascading its stats/friends/consent). So the copy MUST complete
// inside that hook, before the delete lands. This module is the pure copy/merge
// logic over a store seam (the same repo pattern as consent.ts / deletion.ts),
// so the three copy rules are unit-testable with no D1; the route wires it via
// d1LinkMergeStore in auth.ts.
//
// Three things move from the anonymous user to the new user:
//   (a) player_stats  - per-column MAX (matches the monotonic-only-grows
//                       philosophy in stats.ts; the guest's totals and any the
//                       new account already had are combined by taking the
//                       larger of each bucket).
//   (b) friendship    - every relationship the guest had, re-pointed at the new
//                       user, in both directions, skipping duplicates and never
//                       creating a self-friendship.
//   (c) marketing_consent - copied only if the new user has no consent row yet
//                       (an existing choice on the real account always wins).

export interface StatBuckets {
  games: number;
  firsts: number;
  seconds: number;
  thirds: number;
  fourths: number;
}

export interface FriendshipRow {
  aUserId: string;
  bUserId: string;
  status: string;
  requestedBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface ConsentData {
  optIn: boolean;
  source: string;
  updatedAt: number;
}

export interface LinkMergeStore {
  getStats(userId: string): Promise<StatBuckets | null>;
  setStats(userId: string, buckets: StatBuckets, now: number): Promise<void>;
  // All friendship rows touching this user (either side of the ordered pair).
  getFriendships(userId: string): Promise<FriendshipRow[]>;
  hasFriendship(aUserId: string, bUserId: string): Promise<boolean>;
  insertFriendship(row: FriendshipRow): Promise<void>;
  getConsent(userId: string): Promise<ConsentData | null>;
  setConsent(userId: string, optIn: boolean, source: string, now: number): Promise<void>;
}

// Combine each stat bucket by taking the larger value, matching the monotonic
// (cumulative, only-grows) contract of player_stats.
function maxBuckets(a: StatBuckets, b: StatBuckets): StatBuckets {
  return {
    games: Math.max(a.games, b.games),
    firsts: Math.max(a.firsts, b.firsts),
    seconds: Math.max(a.seconds, b.seconds),
    thirds: Math.max(a.thirds, b.thirds),
    fourths: Math.max(a.fourths, b.fourths),
  };
}

// Copy the guest's data onto the new account. MAY THROW - the auth.ts hook must
// call mergeOnLinkSafe (below) so a copy failure never breaks account creation.
export async function mergeOnLink(
  store: LinkMergeStore,
  anonymousUserId: string,
  newUserId: string,
  now: number = Date.now(),
): Promise<void> {
  // (a) Stats: no anon stats -> nothing to carry over (leaves the new user's
  // row, if any, untouched). Otherwise write the per-bucket max.
  const anonStats = await store.getStats(anonymousUserId);
  if (anonStats) {
    const current = await store.getStats(newUserId);
    const merged = current ? maxBuckets(current, anonStats) : anonStats;
    await store.setStats(newUserId, merged, now);
  }

  // (b) Friendships: re-point every relationship the guest had at the new user,
  // in canonical (a < b) order, skipping duplicates and self-friendships.
  const friendships = await store.getFriendships(anonymousUserId);
  for (const row of friendships) {
    const other = row.aUserId === anonymousUserId ? row.bUserId : row.aUserId;
    // The anon user befriending its own future account can't become a friend of
    // itself.
    if (other === newUserId) continue;
    const aUserId = newUserId < other ? newUserId : other;
    const bUserId = newUserId < other ? other : newUserId;
    if (await store.hasFriendship(aUserId, bUserId)) continue;
    await store.insertFriendship({
      aUserId,
      bUserId,
      status: row.status,
      // If the guest initiated the request, the initiator is now the new user.
      requestedBy: row.requestedBy === anonymousUserId ? newUserId : row.requestedBy,
      createdAt: row.createdAt,
      updatedAt: now,
    });
  }

  // (c) Consent: only carry the guest's choice over if the new account has not
  // recorded one of its own.
  const existingConsent = await store.getConsent(newUserId);
  if (!existingConsent) {
    const anonConsent = await store.getConsent(anonymousUserId);
    if (anonConsent) {
      await store.setConsent(newUserId, anonConsent.optIn, anonConsent.source, anonConsent.updatedAt);
    }
  }
}

// Hook-safe wrapper: NEVER throws. better-auth deletes the anonymous user row
// right after onLinkAccount returns, so a merge failure here would silently lose
// the guest's progress - but it must not trap the user in a broken sign-up.
// Log and continue (the client also re-pushes local stats after link as a
// safety net).
export async function mergeOnLinkSafe(
  store: LinkMergeStore,
  anonymousUserId: string,
  newUserId: string,
  now: number = Date.now(),
): Promise<void> {
  try {
    await mergeOnLink(store, anonymousUserId, newUserId, now);
  } catch (err) {
    console.error(
      `[linkMerge] failed to merge anonymous user ${anonymousUserId} into ${newUserId}`,
      err,
    );
  }
}

// --- D1-backed store ---------------------------------------------------------

export function d1LinkMergeStore(db: D1Database): LinkMergeStore {
  return {
    async getStats(userId) {
      const row = await db
        .prepare('SELECT games, firsts, seconds, thirds, fourths FROM player_stats WHERE user_id = ?')
        .bind(userId)
        .first<StatBuckets>();
      return row ?? null;
    },
    async setStats(userId, b, now) {
      await db
        .prepare(
          `INSERT INTO player_stats (user_id, games, firsts, seconds, thirds, fourths, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             games = excluded.games, firsts = excluded.firsts, seconds = excluded.seconds,
             thirds = excluded.thirds, fourths = excluded.fourths, updated_at = excluded.updated_at`,
        )
        .bind(userId, b.games, b.firsts, b.seconds, b.thirds, b.fourths, now)
        .run();
    },
    async getFriendships(userId) {
      const { results } = await db
        .prepare(
          `SELECT a_user_id AS aUserId, b_user_id AS bUserId, status,
                  requested_by AS requestedBy, created_at AS createdAt, updated_at AS updatedAt
           FROM friendship WHERE a_user_id = ? OR b_user_id = ?`,
        )
        .bind(userId, userId)
        .all<FriendshipRow>();
      return results ?? [];
    },
    async hasFriendship(aUserId, bUserId) {
      const row = await db
        .prepare('SELECT 1 AS one FROM friendship WHERE a_user_id = ? AND b_user_id = ? LIMIT 1')
        .bind(aUserId, bUserId)
        .first<{ one: number }>();
      return row != null;
    },
    async insertFriendship(r) {
      await db
        .prepare(
          `INSERT INTO friendship (a_user_id, b_user_id, status, requested_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(a_user_id, b_user_id) DO NOTHING`,
        )
        .bind(r.aUserId, r.bUserId, r.status, r.requestedBy, r.createdAt, r.updatedAt)
        .run();
    },
    async getConsent(userId) {
      const row = await db
        .prepare('SELECT optIn, source, updatedAt FROM marketing_consent WHERE userId = ?')
        .bind(userId)
        .first<{ optIn: number; source: string; updatedAt: number }>();
      if (!row) return null;
      return { optIn: row.optIn === 1, source: row.source, updatedAt: row.updatedAt };
    },
    async setConsent(userId, optIn, source, now) {
      await db
        .prepare(
          `INSERT INTO marketing_consent (userId, optIn, source, updatedAt) VALUES (?, ?, ?, ?)
           ON CONFLICT(userId) DO UPDATE SET optIn = excluded.optIn, source = excluded.source, updatedAt = excluded.updatedAt`,
        )
        .bind(userId, optIn ? 1 : 0, source, now)
        .run();
    },
  };
}
