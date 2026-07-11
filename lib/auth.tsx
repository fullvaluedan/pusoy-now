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

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { authClient } from './authClient';
import { getLocalGuestName } from './guest';
import { pickAvatarUrl, pickDisplayName, type AuthUser } from './profile';
import { pushStatsSync } from './stats';
import { singleFlight } from './singleFlight';
import {
  deriveAuthPhase,
  interpretSignIn,
  interpretSignUp,
  type AuthPhase,
  type ClientResponse,
  type EmailAuthResult,
} from './authForms';

export type SocialProvider = 'google' | 'facebook' | 'apple';

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

export type EnsureSessionResult = 'ok' | 'failed';

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
  // True once a session exists and the plugin has marked the user anonymous
  // (i.e. signed in via signIn.anonymous(), never a real account). False for
  // both a signed-out guest and a real account.
  isAnonymous: boolean;
  // The email awaiting verification, if the last email action left one pending.
  pendingEmail: string | null;
  // Guarantees a server session exists before an online action (matchmaking,
  // rooms, friends, ranking) runs: a no-op when one already exists, otherwise
  // a single-flight signIn.anonymous() (never re-fired while one is already
  // resolving -- see the plugin retry issue in the plan's Risks). Never call
  // signIn.anonymous when a session already exists.
  ensureSession(): Promise<EnsureSessionResult>;
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

// Native Sign in with Apple (iOS only). expo-apple-authentication has no web
// implementation, so it is loaded with a Platform-guarded require() rather than
// a static import that would break the web/Android bundle. The identity token
// is handed to better-auth's idToken flow, which verifies it against the
// configured appBundleIdentifier server-side.
async function signInAppleNative(): Promise<SignInResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AppleAuthentication = require('expo-apple-authentication') as typeof import('expo-apple-authentication');
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) return { status: 'error', message: 'Apple did not return an identity token.' };
    const res = (await authClient.signIn.social({
      provider: 'apple',
      idToken: { token: credential.identityToken },
    })) as ClientResponse;
    if (res?.error) return { status: 'error', message: res.error.message ?? 'Sign-in failed.' };
    return { status: 'signed-in' };
  } catch (err) {
    // ERR_REQUEST_CANCELED is the user backing out of the sheet: stay a guest.
    if ((err as { code?: string })?.code === 'ERR_REQUEST_CANCELED') return { status: 'cancelled' };
    return { status: 'cancelled' };
  }
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

  // The anonymous plugin adds `isAnonymous` to the user row; AuthUser (shared
  // with profile.ts, which has no dependency on the anonymous plugin's types)
  // does not declare it, so it is read defensively.
  const isAnonymous = Boolean(session) && (user as { isAnonymous?: boolean } | null)?.isAnonymous === true;

  // ensureSession() reads the *latest* session/anonymous state at call time
  // (not whatever was captured when the singleFlight wrapper was created), so
  // the "never call signIn.anonymous when a session already exists" guard is
  // always checked fresh.
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const ensureSessionOnceRef = useRef<(() => Promise<EnsureSessionResult>) | null>(null);
  if (!ensureSessionOnceRef.current) {
    ensureSessionOnceRef.current = singleFlight(async (): Promise<EnsureSessionResult> => {
      if (sessionRef.current) return 'ok';
      // The React session state may not have hydrated yet (screens call this on
      // mount), so confirm against the server before minting a new anonymous
      // user: a cookie-carrying getSession is authoritative, and calling
      // signIn.anonymous over an existing anonymous session is a 400.
      try {
        const existing = await authClient.getSession();
        if (existing?.data?.session) return 'ok';
      } catch {
        // network hiccup; fall through and let signIn.anonymous decide
      }
      try {
        const res = (await authClient.signIn.anonymous()) as ClientResponse;
        if (res?.error) {
          // Already-anonymous race lost anyway: re-check before failing so the
          // user never sees a dead-end error while holding a valid session.
          const after = await authClient.getSession().catch(() => null);
          return after?.data?.session ? 'ok' : 'failed';
        }
      } catch {
        return 'failed';
      }
      // Fire-and-forget, failure-tolerant: sync the locally-generated guest
      // name onto the new anonymous user, then push any local stats so they
      // count toward the leaderboard immediately.
      void (async () => {
        try {
          const name = await getLocalGuestName();
          await authClient.updateUser({ name });
        } catch {
          // best-effort; the server-generated name still works
        }
      })();
      void pushStatsSync();
      return 'ok';
    });
  }
  const ensureSession = useCallback((): Promise<EnsureSessionResult> => ensureSessionOnceRef.current!(), []);

  // Safety net for the server-side onLinkAccount merge (U1): the moment a
  // previously-anonymous session becomes a real account (sign-up/sign-in while
  // playing as a guest), push local stats once more so a merge race can never
  // leave the new account under-counted.
  const wasAnonymousRef = useRef(false);
  useEffect(() => {
    if (!session) {
      wasAnonymousRef.current = false;
      return;
    }
    if (wasAnonymousRef.current && !isAnonymous) {
      void pushStatsSync();
    }
    wasAnonymousRef.current = isAnonymous;
  }, [session, isAnonymous]);

  const signIn = useCallback(async (provider: SocialProvider): Promise<SignInResult> => {
    // Apple on iOS uses the native sheet: it returns an identity token (audience
    // = the app bundle id) which better-auth verifies directly, avoiding the
    // release-build hang the browser-redirect flow has on iOS. Web and Android
    // fall through to the standard redirect path below (Android never shows the
    // Apple button, but the guard keeps this correct if it ever does).
    if (provider === 'apple' && Platform.OS === 'ios') {
      return signInAppleNative();
    }
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
      isAnonymous,
      pendingEmail,
      ensureSession,
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
      isAnonymous,
      pendingEmail,
      ensureSession,
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
