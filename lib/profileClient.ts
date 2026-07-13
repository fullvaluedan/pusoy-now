// Network wrappers for the username endpoints on the auth Worker. Split from
// the pure lib/profile.ts (which stays node-testable) because this imports
// authClient / react-native. The session rides along via authClient.$fetch.

import { apiUrl, authClient } from './authClient';

// The caller's own profile meta: their claimed username (or null), whether they
// still have their one free rename, and their avatar-source preference.
export interface ProfileMeta {
  username: string | null;
  canRename: boolean;
  avatarPref: string | null;
}

export async function fetchProfileMeta(): Promise<ProfileMeta> {
  const { data, error } = await authClient.$fetch<Partial<ProfileMeta>>(apiUrl('/api/profile'));
  if (error || !data) return { username: null, canRename: false, avatarPref: null };
  return {
    username: data.username ?? null,
    canRename: data.canRename ?? false,
    avatarPref: data.avatarPref ?? null,
  };
}

// The caller's claimed username, or null if they have not claimed one yet.
// (Kept for callers that only need the handle, e.g. the friends screen.)
export async function fetchMyUsername(): Promise<string | null> {
  const { data, error } = await authClient.$fetch<{ username: string | null }>(apiUrl('/api/profile'));
  if (error || !data) return null;
  return data.username;
}

// Inline availability check for the claim field. Carries the server's reason and
// message when a handle is invalid (e.g. moderation-blocked), so the UI can show
// the specific inline copy rather than a generic "unavailable".
export type Availability =
  | { status: 'available' }
  | { status: 'taken' }
  | { status: 'invalid'; reason?: string; message?: string }
  | { status: 'error' };

export async function checkUsernameAvailable(username: string): Promise<Availability> {
  const { data, error } = await authClient.$fetch<{ available: boolean; reason?: string; message?: string }>(
    apiUrl(`/api/username/check?u=${encodeURIComponent(username)}`),
  );
  if (error || !data) return { status: 'error' };
  if (data.available) return { status: 'available' };
  return data.reason ? { status: 'invalid', reason: data.reason, message: data.message } : { status: 'taken' };
}

export type ClaimResult =
  | { ok: true; username: string }
  | { ok: false; error: 'taken' | 'invalid' | 'already-claimed' | 'unauthorized' | 'error'; message?: string };

// Claim a username. Maps the Worker's status codes to a stable result the claim
// UI renders as inline feedback.
export async function claimUsername(username: string): Promise<ClaimResult> {
  const { data, error } = await authClient.$fetch<{ username?: string; error?: string; message?: string }>(
    apiUrl('/api/username/claim'),
    { method: 'POST', body: { username } },
  );
  if (error) {
    const status = (error as { status?: number }).status;
    const message = (error as { message?: string }).message;
    if (status === 409) {
      // Either the handle is taken or the user already has one; the body says which.
      const kind = (error as { error?: string }).error;
      return { ok: false, error: kind === 'already-claimed' ? 'already-claimed' : 'taken', message };
    }
    if (status === 400) return { ok: false, error: 'invalid', message };
    if (status === 401) return { ok: false, error: 'unauthorized' };
    return { ok: false, error: 'error', message };
  }
  return { ok: true, username: data?.username ?? username };
}

export type RenameResult =
  | { ok: true; username: string }
  | { ok: false; error: 'taken' | 'invalid' | 'rename-limit' | 'no-username' | 'unauthorized' | 'error'; message?: string };

// Rename the caller's handle (their one free change). The Worker validates and
// moderates the same way claim does, then enforces the limit; the UI renders the
// mapped error inline.
export async function renameUsername(username: string): Promise<RenameResult> {
  const { data, error } = await authClient.$fetch<{ username?: string; error?: string; message?: string }>(
    apiUrl('/api/username/rename'),
    { method: 'POST', body: { username } },
  );
  if (error) {
    const status = (error as { status?: number }).status;
    const message = (error as { message?: string }).message;
    const kind = (error as { error?: string }).error;
    if (status === 409) {
      const err = kind === 'rename-limit' ? 'rename-limit' : kind === 'no-username' ? 'no-username' : 'taken';
      return { ok: false, error: err, message };
    }
    if (status === 400) return { ok: false, error: 'invalid', message };
    if (status === 401) return { ok: false, error: 'unauthorized' };
    return { ok: false, error: 'error', message };
  }
  return { ok: true, username: data?.username ?? username };
}

// The avatar-source preference the user can set. 'preset:<id>' is reserved for
// the deferred preset picker.
export type AvatarPref = 'social' | 'letter' | null;

// Persist the caller's avatar-source preference. Returns false when it could not
// be saved (e.g. the user has not claimed a username yet, so there is no row).
export async function setAvatarPref(pref: AvatarPref): Promise<boolean> {
  const { error } = await authClient.$fetch<{ avatarPref: string | null }>(apiUrl('/api/profile/avatar-pref'), {
    method: 'POST',
    body: { pref },
  });
  return !error;
}
