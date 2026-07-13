// Pure helpers for turning a better-auth user into the display fields the app
// shows at a seat: a name and an avatar URL (or null, when initials stand in).
//
// Nothing here imports react-native or the auth client, so it stays unit-
// testable in plain node (see lib/profileTest.ts). lib/auth.tsx is the React
// layer on top.
//
// Under better-auth the user row already carries the resolved name and image:
// the Worker maps each social provider's profile (including Google/Facebook
// avatar sizing) into `image` on first sign-in (see server/src/social.ts), so
// the client no longer re-fetches or re-sizes anything. It just reads the row.

// Structural subset of the better-auth user, so this module needs no runtime
// dependency on the auth packages.
export interface AuthUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

// The name shown at the seat: the account name, else the email local-part, else
// a neutral fallback so a seat is never blank.
export function pickDisplayName(user: AuthUser): string {
  const named = str(user.name);
  if (named) return named;
  const email = str(user.email);
  if (email) return email.split('@')[0];
  return 'Player';
}

// The avatar to show, or null when the user has no picture (the UI then falls
// back to an initial-letter disc via lib/initials.ts).
export function pickAvatarUrl(user: AuthUser): string | null {
  return str(user.image);
}

// --- Username (client mirror of the Worker's rules) ------------------------
//
// The Worker (server/src/profile.ts) is the authority, but the claim field
// mirrors its rules so a bad handle is rejected inline before any network call.
// Keep these two in sync.

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

// 'inappropriate' is server-authoritative (the Worker runs a local moderation
// blocklist that the client does not mirror), but it is a valid reason the check
// and rename endpoints can return, so the type and its message live here too.
export type UsernameError = 'length' | 'charset' | 'reserved' | 'inappropriate';

const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'root', 'system', 'support', 'help', 'api',
  'moderator', 'mod', 'staff', 'official', 'pusoy', 'pusoynow', 'prends', 'owner',
  'me', 'you', 'null', 'undefined',
]);

export type UsernameValidation =
  | { ok: true; username: string }
  | { ok: false; reason: UsernameError };

// Normalize (trim + lowercase) then validate. Returns the canonical form.
export function validateUsernameClient(raw: string): UsernameValidation {
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
