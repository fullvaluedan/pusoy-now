// Network wrappers for the username endpoints on the auth Worker. Split from
// the pure lib/profile.ts (which stays node-testable) because this imports
// authClient / react-native. The session rides along via authClient.$fetch.

import { authClient } from './authClient';

// The caller's claimed username, or null if they have not claimed one yet.
export async function fetchMyUsername(): Promise<string | null> {
  const { data, error } = await authClient.$fetch<{ username: string | null }>('/api/profile');
  if (error || !data) return null;
  return data.username;
}

export type Availability = 'available' | 'taken' | 'invalid' | 'error';

// Inline availability check for the claim field.
export async function checkUsernameAvailable(username: string): Promise<Availability> {
  const { data, error } = await authClient.$fetch<{ available: boolean; reason?: string }>(
    `/api/username/check?u=${encodeURIComponent(username)}`,
  );
  if (error || !data) return 'error';
  if (data.available) return 'available';
  return data.reason ? 'invalid' : 'taken';
}

export type ClaimResult =
  | { ok: true; username: string }
  | { ok: false; error: 'taken' | 'invalid' | 'already-claimed' | 'unauthorized' | 'error'; message?: string };

// Claim a username. Maps the Worker's status codes to a stable result the claim
// UI renders as inline feedback.
export async function claimUsername(username: string): Promise<ClaimResult> {
  const { data, error } = await authClient.$fetch<{ username?: string; error?: string; message?: string }>(
    '/api/username/claim',
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
