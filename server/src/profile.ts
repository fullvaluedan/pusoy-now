// Usernames: the stable social handle players add each other by and rank on.
//
// A username is separate from the better-auth display name (user.name): display
// names come from social providers and collide, usernames are unique and
// claimed once (rename is deferred to a follow-up). Rules: lowercase letters,
// digits, underscore; 3-20 chars; a small reserved list is off-limits.
//
// The pure validation and the claim/check flow are split from the D1 SQL behind
// a ProfileStore interface, so every scenario - "duplicate rejected
// case-insensitively", "second claim rejected", "invalid charset/length
// rejected" - is unit-testable against an in-memory store with no D1. The route
// (session gating, live D1) is wired in index.ts.

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

// Handles we never hand out: impersonation risks and route-ish words. Compared
// against the already-lowercased username.
export const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'root', 'system', 'support', 'help', 'api',
  'moderator', 'mod', 'staff', 'official', 'pusoy', 'pusoynow', 'owner',
  'me', 'you', 'null', 'undefined',
]);

export type UsernameError = 'length' | 'charset' | 'reserved';

export type UsernameCheck =
  | { ok: true; username: string }
  | { ok: false; reason: UsernameError };

// Normalize (trim + lowercase, since usernames are case-insensitive) then
// validate. Returns the canonical stored form on success.
export function validateUsername(raw: string): UsernameCheck {
  const username = raw.trim().toLowerCase();
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
    return { ok: false, reason: 'length' };
  }
  if (!/^[a-z0-9_]+$/.test(username)) {
    return { ok: false, reason: 'charset' };
  }
  if (RESERVED_USERNAMES.has(username)) {
    return { ok: false, reason: 'reserved' };
  }
  return { ok: true, username };
}

// Human-readable message for each validation failure, shared by the check and
// claim routes so the client can show the same inline copy.
export function usernameErrorMessage(reason: UsernameError): string {
  switch (reason) {
    case 'length':
      return `Username must be ${USERNAME_MIN} to ${USERNAME_MAX} characters.`;
    case 'charset':
      return 'Use only lowercase letters, numbers, and underscores.';
    case 'reserved':
      return 'That username is not available.';
  }
}

// Storage seam. Tests pass an in-memory fake; the route wires d1ProfileStore.
export interface ProfileRow {
  userId: string;
  username: string;
}

export interface ProfileStore {
  getByUserId(userId: string): Promise<ProfileRow | null>;
  getByUsername(username: string): Promise<ProfileRow | null>;
  // Insert a new profile row. Returns false if the username was already taken
  // (lost the race on the unique index), true on success.
  insert(userId: string, username: string, now: number): Promise<boolean>;
}

export type ClaimResult =
  | { status: 'claimed'; username: string }
  | { status: 'invalid'; reason: UsernameError }
  | { status: 'taken' }
  | { status: 'already-claimed'; username: string };

// Claim a username for a user. A user with a username already cannot rename
// (deferred), so a second claim is rejected with their current handle. A handle
// held by someone else is 'taken'. Validation runs first.
export async function claimUsername(
  store: ProfileStore,
  userId: string,
  raw: string,
  now: number,
): Promise<ClaimResult> {
  const existing = await store.getByUserId(userId);
  if (existing) return { status: 'already-claimed', username: existing.username };

  const valid = validateUsername(raw);
  if (!valid.ok) return { status: 'invalid', reason: valid.reason };

  const taken = await store.getByUsername(valid.username);
  if (taken) return { status: 'taken' };

  const inserted = await store.insert(userId, valid.username, now);
  if (!inserted) return { status: 'taken' }; // lost the unique-index race
  return { status: 'claimed', username: valid.username };
}

export type AvailabilityResult =
  | { status: 'available' }
  | { status: 'invalid'; reason: UsernameError }
  | { status: 'taken' };

// Inline availability check for the claim field: validity first, then whether
// the (normalized) handle is already held.
export async function checkUsername(store: ProfileStore, raw: string): Promise<AvailabilityResult> {
  const valid = validateUsername(raw);
  if (!valid.ok) return { status: 'invalid', reason: valid.reason };
  const taken = await store.getByUsername(valid.username);
  return taken ? { status: 'taken' } : { status: 'available' };
}

// --- D1-backed store -------------------------------------------------------

export function d1ProfileStore(db: D1Database): ProfileStore {
  return {
    async getByUserId(userId) {
      const row = await db
        .prepare('SELECT user_id as userId, username FROM player_profile WHERE user_id = ?')
        .bind(userId)
        .first<ProfileRow>();
      return row ?? null;
    },
    async getByUsername(username) {
      const row = await db
        .prepare('SELECT user_id as userId, username FROM player_profile WHERE username = ? COLLATE NOCASE')
        .bind(username)
        .first<ProfileRow>();
      return row ?? null;
    },
    async insert(userId, username, now) {
      // INSERT OR IGNORE + the changes count is an atomic "did this win the
      // unique index?" check, so two concurrent claims of the same handle
      // cannot both succeed.
      const res = await db
        .prepare(
          'INSERT OR IGNORE INTO player_profile (user_id, username, created_at, updated_at) VALUES (?, ?, ?, ?)',
        )
        .bind(userId, username, now, now)
        .run();
      return (res.meta?.changes ?? 0) > 0;
    },
  };
}
