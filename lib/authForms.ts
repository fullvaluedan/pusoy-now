// Pure auth helpers: form validation, phase derivation, and interpreting the
// better-auth client's { data, error } responses into a small result union.
//
// None of this imports react-native or the auth client, so lib/authTest.ts can
// exercise it in plain node (same split as lib/profile.ts vs lib/auth.tsx). The
// React layer in lib/auth.tsx calls these; the sign-in screen renders their
// results.

// Mirror of the Worker's emailAndPassword.minPasswordLength, so a too-short
// password is caught before any network call rather than bouncing off the API.
export const MIN_PASSWORD_LENGTH = 8;

// Deliberately loose: real deliverability is proven by the verification email,
// so all this needs to catch is obvious typos before a round trip.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

export interface SignUpForm {
  name: string;
  email: string;
  password: string;
  confirm: string;
}

// Returns a user-facing message for the first problem found, or null when the
// form is good to submit. No em dashes, no emojis (UI copy rules).
export function validateSignUp(f: SignUpForm): string | null {
  if (!f.name.trim()) return 'Enter a name.';
  if (!isValidEmail(f.email)) return 'Enter a valid email address.';
  if (f.password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (f.password !== f.confirm) return 'Passwords do not match.';
  return null;
}

export function validateSignIn(f: { email: string; password: string }): string | null {
  if (!isValidEmail(f.email)) return 'Enter a valid email address.';
  if (!f.password) return 'Enter your password.';
  return null;
}

export function validateResetEmail(email: string): string | null {
  if (!isValidEmail(email)) return 'Enter a valid email address.';
  return null;
}

// The app's four auth states. `pending-verification` is the gap the email flow
// introduces: the account exists but cannot sign in until the link is clicked.
export type AuthPhase = 'loading' | 'guest' | 'pending-verification' | 'signed-in';

export function deriveAuthPhase(s: {
  loading: boolean;
  hasSession: boolean;
  pendingEmail: string | null;
}): AuthPhase {
  if (s.loading) return 'loading';
  if (s.hasSession) return 'signed-in';
  if (s.pendingEmail) return 'pending-verification';
  return 'guest';
}

export type EmailAuthResult =
  | { status: 'signed-in' }
  | { status: 'verification-pending'; email: string }
  | { status: 'error'; message: string };

// The subset of the better-auth client response shape these interpreters read.
export interface ClientResponse {
  data?: { token?: string | null } | null;
  error?: { message?: string; code?: string } | null;
}

// Sign-up succeeds without a session when the Worker requires verification
// (token is null): that is the pending-verification state, not an error.
export function interpretSignUp(res: ClientResponse, email: string): EmailAuthResult {
  if (res.error) return { status: 'error', message: res.error.message ?? 'Could not create your account.' };
  if (res.data?.token) return { status: 'signed-in' };
  return { status: 'verification-pending', email };
}

// An unverified account signing in comes back as EMAIL_NOT_VERIFIED, which is a
// prompt to check the inbox, not a failure to surface as a red error.
export function interpretSignIn(res: ClientResponse, email: string): EmailAuthResult {
  if (res.error) {
    if (res.error.code === 'EMAIL_NOT_VERIFIED') return { status: 'verification-pending', email };
    return { status: 'error', message: res.error.message ?? 'Could not sign you in.' };
  }
  if (res.data?.token) return { status: 'signed-in' };
  return { status: 'verification-pending', email };
}
