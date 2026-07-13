// Friends: request / accept / decline / remove, the incoming-outgoing-accepted
// lists, and the friends ranking.
//
// A friendship is one row keyed on the ordered pair (a < b), with a status and
// the initiator (requested_by). The whole lifecycle - including the security
// scenarios the plan calls out (self-friend rejected, IDOR: accepting a request
// not addressed to you) - is pure logic over a FriendStore, so it is unit-
// testable against an in-memory store with no D1. The route wires session
// gating and the D1 store; username resolution and display joins live here as
// thin D1 helpers verified live.

export type FriendStatus = 'pending' | 'accepted';

export interface FriendshipRow {
  aUserId: string; // a < b
  bUserId: string;
  status: FriendStatus;
  requestedBy: string;
}

// Canonical ordering: the pair (a, b) always has a < b, so a friendship has one
// row no matter who initiated.
export function orderPair(u1: string, u2: string): { a: string; b: string } {
  return u1 < u2 ? { a: u1, b: u2 } : { a: u2, b: u1 };
}

export interface FriendStore {
  get(a: string, b: string): Promise<FriendshipRow | null>; // expects a < b
  insertPending(a: string, b: string, requestedBy: string, now: number): Promise<boolean>; // false if a row already exists
  setAccepted(a: string, b: string, now: number): Promise<void>;
  ensureAccepted(a: string, b: string, requestedBy: string, now: number): Promise<void>; // idempotent, for auto-friend
  remove(a: string, b: string): Promise<boolean>; // false if nothing was removed
  listForUser(userId: string): Promise<FriendshipRow[]>; // rows where the user is a or b
}

export type RequestOutcome = 'sent' | 'self' | 'already-pending' | 'already-friends';

// Send a friend request. Self-requests are rejected; a duplicate (a request
// already pending or an existing friendship) is idempotent, not an error.
export async function sendRequest(
  store: FriendStore,
  me: string,
  target: string,
  now: number,
): Promise<RequestOutcome> {
  if (me === target) return 'self';
  const { a, b } = orderPair(me, target);
  const existing = await store.get(a, b);
  if (existing) {
    return existing.status === 'accepted' ? 'already-friends' : 'already-pending';
  }
  await store.insertPending(a, b, me, now);
  return 'sent';
}

export type AcceptOutcome = 'accepted' | 'not-found' | 'forbidden' | 'already-friends';

// Accept a pending request. Only the addressee (the party who did NOT send it)
// may accept - accepting your own outgoing request, or any pair you are not the
// recipient of, is 'forbidden' (the IDOR guard).
export async function acceptRequest(
  store: FriendStore,
  me: string,
  other: string,
  now: number,
): Promise<AcceptOutcome> {
  const { a, b } = orderPair(me, other);
  const existing = await store.get(a, b);
  if (!existing) return 'not-found';
  if (existing.status === 'accepted') return 'already-friends';
  if (existing.requestedBy === me) return 'forbidden';
  await store.setAccepted(a, b, now);
  return 'accepted';
}

export type DeclineOutcome = 'declined' | 'not-found' | 'forbidden';

// Decline a pending request. Only the addressee may decline (the initiator
// would use remove to cancel their own outgoing request).
export async function declineRequest(
  store: FriendStore,
  me: string,
  other: string,
): Promise<DeclineOutcome> {
  const { a, b } = orderPair(me, other);
  const existing = await store.get(a, b);
  if (!existing || existing.status !== 'pending') return 'not-found';
  if (existing.requestedBy === me) return 'forbidden';
  await store.remove(a, b);
  return 'declined';
}

export type RemoveOutcome = 'removed' | 'not-found';

// Remove a friendship (unfriend) or cancel an outgoing request. Either party in
// the pair may remove. A third party cannot: orderPair(me, other) only ever
// names a row that contains `me`.
export async function removeFriend(
  store: FriendStore,
  me: string,
  other: string,
): Promise<RemoveOutcome> {
  const { a, b } = orderPair(me, other);
  return (await store.remove(a, b)) ? 'removed' : 'not-found';
}

// Idempotent pairwise accepted-friendship, used by the room DO's auto-friend on
// join (U7): joining a room friends every seated pair with no request ceremony.
export async function ensureFriendship(
  store: FriendStore,
  u1: string,
  u2: string,
  now: number,
): Promise<void> {
  if (u1 === u2) return;
  const { a, b } = orderPair(u1, u2);
  await store.ensureAccepted(a, b, u1, now);
}

export interface FriendLists {
  accepted: string[]; // other user ids
  incoming: string[]; // requests addressed to me
  outgoing: string[]; // requests I sent
}

// Split every friendship touching `me` into accepted / incoming / outgoing,
// each as the OTHER user's id.
export async function listFriends(store: FriendStore, me: string): Promise<FriendLists> {
  const rows = await store.listForUser(me);
  const accepted: string[] = [];
  const incoming: string[] = [];
  const outgoing: string[] = [];
  for (const r of rows) {
    const other = r.aUserId === me ? r.bUserId : r.aUserId;
    if (r.status === 'accepted') accepted.push(other);
    else if (r.requestedBy === me) outgoing.push(other);
    else incoming.push(other);
  }
  return { accepted, incoming, outgoing };
}

// --- Ranking ---------------------------------------------------------------

export interface StatTotals {
  games: number;
  firsts: number;
  seconds: number;
  thirds: number;
  fourths: number;
}

export interface RankEntry {
  userId: string;
  firsts: number;
  games: number;
  winRate: number;
}

// Rank a set of users by total 1st-place finishes, win-rate as the tiebreak
// (user-confirmed). A final userId tiebreak keeps the order deterministic. A
// user with no stats row ranks with zeros rather than being dropped.
export function rankUsers(ids: string[], statsByUser: Map<string, StatTotals>): RankEntry[] {
  const entries: RankEntry[] = ids.map((userId) => {
    const s = statsByUser.get(userId);
    const games = s?.games ?? 0;
    const firsts = s?.firsts ?? 0;
    return { userId, firsts, games, winRate: games > 0 ? firsts / games : 0 };
  });
  entries.sort(
    (x, y) => y.firsts - x.firsts || y.winRate - x.winRate || x.userId.localeCompare(y.userId),
  );
  return entries;
}

// --- D1 store + display helpers --------------------------------------------

interface FriendshipD1 {
  a_user_id: string;
  b_user_id: string;
  status: FriendStatus;
  requested_by: string;
}

function fromD1(row: FriendshipD1): FriendshipRow {
  return {
    aUserId: row.a_user_id,
    bUserId: row.b_user_id,
    status: row.status,
    requestedBy: row.requested_by,
  };
}

export function d1FriendStore(db: D1Database): FriendStore {
  return {
    async get(a, b) {
      const row = await db
        .prepare('SELECT a_user_id, b_user_id, status, requested_by FROM friendship WHERE a_user_id = ? AND b_user_id = ?')
        .bind(a, b)
        .first<FriendshipD1>();
      return row ? fromD1(row) : null;
    },
    async insertPending(a, b, requestedBy, now) {
      const res = await db
        .prepare(
          `INSERT OR IGNORE INTO friendship (a_user_id, b_user_id, status, requested_by, created_at, updated_at)
           VALUES (?, ?, 'pending', ?, ?, ?)`,
        )
        .bind(a, b, requestedBy, now, now)
        .run();
      return (res.meta?.changes ?? 0) > 0;
    },
    async setAccepted(a, b, now) {
      await db
        .prepare("UPDATE friendship SET status = 'accepted', updated_at = ? WHERE a_user_id = ? AND b_user_id = ?")
        .bind(now, a, b)
        .run();
    },
    async ensureAccepted(a, b, requestedBy, now) {
      await db
        .prepare(
          `INSERT INTO friendship (a_user_id, b_user_id, status, requested_by, created_at, updated_at)
           VALUES (?, ?, 'accepted', ?, ?, ?)
           ON CONFLICT(a_user_id, b_user_id) DO UPDATE SET status = 'accepted', updated_at = excluded.updated_at`,
        )
        .bind(a, b, requestedBy, now, now)
        .run();
    },
    async remove(a, b) {
      const res = await db
        .prepare('DELETE FROM friendship WHERE a_user_id = ? AND b_user_id = ?')
        .bind(a, b)
        .run();
      return (res.meta?.changes ?? 0) > 0;
    },
    async listForUser(userId) {
      const { results } = await db
        .prepare('SELECT a_user_id, b_user_id, status, requested_by FROM friendship WHERE a_user_id = ? OR b_user_id = ?')
        .bind(userId, userId)
        .all<FriendshipD1>();
      return (results ?? []).map(fromD1);
    },
  };
}

export interface DisplayInfo {
  userId: string;
  username: string | null;
  name: string | null;
  image: string | null;
  // The user's avatar-source preference (player_profile.avatar_pref), so lists
  // that render other players' avatars honor a 'letter' choice instead of
  // always showing the social photo. null for users with no explicit choice.
  avatarPref: string | null;
}

// Resolve display fields (username from player_profile, name/avatar from the
// better-auth user row) for a set of user ids, in one query.
export async function fetchDisplayInfo(db: D1Database, ids: string[]): Promise<Map<string, DisplayInfo>> {
  const map = new Map<string, DisplayInfo>();
  if (ids.length === 0) return map;
  const placeholders = ids.map(() => '?').join(',');
  const { results } = await db
    .prepare(
      `SELECT u.id AS userId, pp.username AS username, u.name AS name, u.image AS image,
              pp.avatar_pref AS avatarPref
       FROM user u LEFT JOIN player_profile pp ON pp.user_id = u.id
       WHERE u.id IN (${placeholders})`,
    )
    .bind(...ids)
    .all<DisplayInfo>();
  for (const r of results ?? []) map.set(r.userId, r);
  return map;
}
