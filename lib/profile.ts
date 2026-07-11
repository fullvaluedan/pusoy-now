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
