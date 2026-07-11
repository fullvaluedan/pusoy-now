// Auth surface for the whole app: <AuthProvider> plus useAuth().
//
// Sign-in exists to put a real name and picture on a seat and, now, to hold an
// account (email/password or social) on the Cloudflare auth Worker. Everything
// else (playing bots, stats-free local games) works signed out, so this
// provider degrades quietly: no session is a guest, never an error.
//
// The account surface the rest of the app already consumed is preserved:
// `session` (truthy when signed in) and `profile` ({ displayName, avatarUrl }).
// Email accounts add `signUpEmail`, `signInEmail`, `resetPassword`, and a
// `pending-verification` phase for the gap between sign-up and clicking the
// verification link. Social sign-in keeps the same `signIn(provider)` entry.
//
// All session/cookie handling lives in the better-auth client (lib/authClient):
// SecureStore cookie-jar on native, browser cookies on web.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { authClient } from './authClient';
import { pickAvatarUrl, pickDisplayName, type AuthUser } from './profile';
import {
  deriveAuthPhase,
  interpretSignIn,
  interpretSignUp,
  type AuthPhase,
  type ClientResponse,
  type EmailAuthResult,
} from './authForms';

export type SocialProvider = 'google' | 'facebook';

export interface AuthProfile {
  displayName: string;
  avatarUrl: string | null;
}

export type SignInResult =
  | { status: 'signed-in' }
  | { status: 'cancelled' }
  | { status: 'redirecting' } // web: the page is navigating away
  | { status: 'error'; message: string };

export type ResetResult = { status: 'sent' } | { status: 'error'; message: string };

interface AuthValue {
  // Null when signed out. Consumers only check truthiness; the shape is the
  // better-auth session record.
  session: unknown | null;
  user: AuthUser | null;
  profile: AuthProfile | null;
  // True until the persisted session (if any) has been read back.
  loading: boolean;
  // guest | pending-verification | signed-in | loading.
  phase: AuthPhase;
  // The email awaiting verification, if the last email action left one pending.
  pendingEmail: string | null;
  signIn(provider: SocialProvider): Promise<SignInResult>;
  signUpEmail(input: { name: string; email: string; password: string }): Promise<EmailAuthResult>;
  signInEmail(input: { email: string; password: string }): Promise<EmailAuthResult>;
  resetPassword(email: string): Promise<ResetResult>;
  // Drop the pending-verification state (e.g. the user backs out to guest).
  clearPending(): void;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

// Where the provider sends the browser back after a social sign-in or a
// password-reset link. Native returns to the app scheme; web to the origin.
function redirectTarget(path: string): string {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' ? window.location.origin : '/';
  }
  return `prends://${path}`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isPending } = authClient.useSession();
  const user = (data?.user ?? null) as AuthUser | null;
  const session = data?.session ?? null;
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  // Once a session exists the pending-verification state is moot (verify +
  // auto-sign-in landed the user). Clear it so a later sign-out returns to a
  // clean guest state rather than a stale "check your email".
  useEffect(() => {
    if (session) setPendingEmail(null);
  }, [session]);

  const signIn = useCallback(async (provider: SocialProvider): Promise<SignInResult> => {
    try {
      const res = (await authClient.signIn.social({
        provider,
        callbackURL: redirectTarget('auth-callback'),
      })) as ClientResponse;
      if (res?.error) return { status: 'error', message: res.error.message ?? 'Sign-in failed.' };
      // Web navigates the whole page away; native completes the browser hop and
      // the session hook picks up the new session.
      return Platform.OS === 'web' ? { status: 'redirecting' } : { status: 'signed-in' };
    } catch {
      // Backing out of the provider browser rejects. That is an ordinary
      // choice: say nothing, stay a guest.
      return { status: 'cancelled' };
    }
  }, []);

  const signUpEmail = useCallback(
    async (input: { name: string; email: string; password: string }): Promise<EmailAuthResult> => {
      const res = (await authClient.signUp.email(input)) as ClientResponse;
      const result = interpretSignUp(res, input.email);
      if (result.status === 'verification-pending') setPendingEmail(input.email);
      if (result.status === 'signed-in') setPendingEmail(null);
      return result;
    },
    [],
  );

  const signInEmail = useCallback(
    async (input: { email: string; password: string }): Promise<EmailAuthResult> => {
      const res = (await authClient.signIn.email(input)) as ClientResponse;
      const result = interpretSignIn(res, input.email);
      if (result.status === 'verification-pending') setPendingEmail(input.email);
      if (result.status === 'signed-in') setPendingEmail(null);
      return result;
    },
    [],
  );

  const resetPassword = useCallback(async (email: string): Promise<ResetResult> => {
    // The Worker always replies with a generic message (no account enumeration),
    // so a non-error response means "if that account exists, a link was sent".
    const res = (await authClient.requestPasswordReset({
      email,
      redirectTo: redirectTarget('reset'),
    })) as ClientResponse;
    if (res?.error) return { status: 'error', message: res.error.message ?? 'Could not send the reset email.' };
    return { status: 'sent' };
  }, []);

  const clearPending = useCallback(() => setPendingEmail(null), []);

  const signOut = useCallback(async () => {
    await authClient.signOut();
    setPendingEmail(null);
  }, []);

  const profile = useMemo<AuthProfile | null>(
    () => (user ? { displayName: pickDisplayName(user), avatarUrl: pickAvatarUrl(user) } : null),
    [user],
  );

  const phase = deriveAuthPhase({ loading: isPending, hasSession: Boolean(session), pendingEmail });

  const value = useMemo<AuthValue>(
    () => ({
      session,
      user,
      profile,
      loading: isPending,
      phase,
      pendingEmail,
      signIn,
      signUpEmail,
      signInEmail,
      resetPassword,
      clearPending,
      signOut,
    }),
    [
      session,
      user,
      profile,
      isPending,
      phase,
      pendingEmail,
      signIn,
      signUpEmail,
      signInEmail,
      resetPassword,
      clearPending,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
