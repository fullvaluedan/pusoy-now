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

import { containsBlockedWord } from './usernameBlocklist';

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

// Handles we never hand out: impersonation risks and route-ish words. Compared
// against the already-lowercased username.
export const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'root', 'system', 'support', 'help', 'api',
  'moderator', 'mod', 'staff', 'official', 'pusoy', 'pusoynow', 'prends', 'owner',
  'me', 'you', 'null', 'undefined',
]);

export type UsernameError = 'length' | 'charset' | 'reserved' | 'inappropriate';

export type UsernameCheck =
  | { ok: true; username: string }
  | { ok: false; reason: UsernameError };

// Normalize (trim + lowercase, since usernames are case-insensitive) then
// validate. Returns the canonical stored form on success. The moderation check
// (a local leetspeak-aware blocklist, see usernameBlocklist.ts) runs last, so a
// handle that is otherwise well-formed but offensive is rejected as
// 'inappropriate' rather than passing.
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
  if (containsBlockedWord(username)) {
    return { ok: false, reason: 'inappropriate' };
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
    case 'inappropriate':
      return 'That username is not allowed.';
  }
}

// The avatar source a user prefers. Stored on the profile row as avatar_pref.
// 'social' uses the linked account photo, 'letter' forces the initial disc, and
// 'preset:<id>' names a chosen preset (art deferred). null means "no explicit
// choice": the client falls through to the default precedence (social, letter).
export type AvatarPref = 'social' | 'letter' | (string & {}) | null;

// Storage seam. Tests pass an in-memory fake; the route wires d1ProfileStore.
export interface ProfileRow {
  userId: string;
  username: string;
  // How many renames the user has spent. First claim inserts at 0; the one free
  // rename bumps it to 1, after which renames are refused. Older rows created
  // before migration 0009 read back as 0 (the column default).
  usernameChanges: number;
  avatarPref: AvatarPref;
}

// Outcome of the atomic rename UPDATE. 'rename-limit' means the row exists but
// the single free change was already spent; 'taken' means the new handle
// collided on the unique index; 'not-found' means there was no row to rename.
export type RenameStatus = 'ok' | 'rename-limit' | 'taken' | 'not-found';

export interface ProfileStore {
  getByUserId(userId: string): Promise<ProfileRow | null>;
  getByUsername(username: string): Promise<ProfileRow | null>;
  // Insert a new profile row. Returns false if the username was already taken
  // (lost the race on the unique index), true on success.
  insert(userId: string, username: string, now: number): Promise<boolean>;
  // Rename in place, enforcing the one-free-change limit atomically (the UPDATE
  // is guarded by username_changes < 1 and increments it), and mapping a unique
  // collision to 'taken'.
  renameUsername(userId: string, newUsername: string, now: number): Promise<RenameStatus>;
  // Set (or clear, with null) the avatar-source preference. Returns false when
  // there is no profile row yet (the user has not claimed a username).
  setAvatarPref(userId: string, pref: AvatarPref, now: number): Promise<boolean>;
}

// Whether a loaded profile row is still allowed its one free rename.
export function canRename(row: ProfileRow | null): boolean {
  return Boolean(row) && (row!.usernameChanges ?? 0) < 1;
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

export type RenameResult =
  | { status: 'renamed'; username: string }
  | { status: 'invalid'; reason: UsernameError }
  | { status: 'taken' }
  | { status: 'rename-limit' }
  | { status: 'no-username' }
  | { status: 'unchanged'; username: string };

// Rename a signed-in user's handle. Signed-in users get exactly ONE free change
// (the first claim is separate and already spent to create the row): validation
// and moderation run first, then a taken-by-someone-else check, then the atomic
// store rename which is the true limit-enforcement point. A user with no row yet
// must claim, not rename ('no-username'); re-submitting their current handle is a
// no-op that does not burn the change ('unchanged').
export async function renameUsername(
  store: ProfileStore,
  userId: string,
  raw: string,
  now: number,
): Promise<RenameResult> {
  const existing = await store.getByUserId(userId);
  if (!existing) return { status: 'no-username' };

  const valid = validateUsername(raw);
  if (!valid.ok) return { status: 'invalid', reason: valid.reason };

  if (valid.username === existing.username.toLowerCase()) {
    return { status: 'unchanged', username: existing.username };
  }
  if (!canRename(existing)) return { status: 'rename-limit' };

  const taken = await store.getByUsername(valid.username);
  if (taken) return { status: 'taken' };

  const res = await store.renameUsername(userId, valid.username, now);
  if (res === 'ok') return { status: 'renamed', username: valid.username };
  if (res === 'rename-limit') return { status: 'rename-limit' };
  return { status: 'taken' }; // lost the unique-index race, or vanished row
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
  const SELECT_COLS =
    'user_id as userId, username, username_changes as usernameChanges, avatar_pref as avatarPref';
  return {
    async getByUserId(userId) {
      const row = await db
        .prepare(`SELECT ${SELECT_COLS} FROM player_profile WHERE user_id = ?`)
        .bind(userId)
        .first<ProfileRow>();
      return row ?? null;
    },
    async getByUsername(username) {
      const row = await db
        .prepare(`SELECT ${SELECT_COLS} FROM player_profile WHERE username = ? COLLATE NOCASE`)
        .bind(username)
        .first<ProfileRow>();
      return row ?? null;
    },
    async insert(userId, username, now) {
      // INSERT OR IGNORE + the changes count is an atomic "did this win the
      // unique index?" check, so two concurrent claims of the same handle
      // cannot both succeed. username_changes defaults to 0 (the first claim
      // is not a rename).
      const res = await db
        .prepare(
          'INSERT OR IGNORE INTO player_profile (user_id, username, created_at, updated_at) VALUES (?, ?, ?, ?)',
        )
        .bind(userId, username, now, now)
        .run();
      return (res.meta?.changes ?? 0) > 0;
    },
    async renameUsername(userId, newUsername, now) {
      // The WHERE username_changes < 1 guard makes the one-free-change limit
      // atomic: a second rename matches no row and reports 0 changes. A unique
      // collision on the new handle throws, which we map to 'taken'.
      try {
        const res = await db
          .prepare(
            'UPDATE player_profile SET username = ?, username_changes = username_changes + 1, updated_at = ? WHERE user_id = ? AND username_changes < 1',
          )
          .bind(newUsername, now, userId)
          .run();
        if ((res.meta?.changes ?? 0) > 0) return 'ok';
        // No row updated: either the user has no profile, or the limit is spent.
        const still = await this.getByUserId(userId);
        if (!still) return 'not-found';
        return 'rename-limit';
      } catch (e) {
        // Only a UNIQUE-constraint collision means the handle is taken. Any other
        // D1 error (transient failure, timeout) must surface as a 500, not be
        // mislabeled "that name is taken", so rethrow it.
        const msg = String((e as Error)?.message ?? e).toLowerCase();
        if (msg.includes('unique') || msg.includes('constraint')) return 'taken';
        throw e;
      }
    },
    async setAvatarPref(userId, pref, now) {
      const res = await db
        .prepare('UPDATE player_profile SET avatar_pref = ?, updated_at = ? WHERE user_id = ?')
        .bind(pref ?? null, now, userId)
        .run();
      return (res.meta?.changes ?? 0) > 0;
    },
  };
}
