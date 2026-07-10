// Auth surface for the whole app: <AuthProvider> plus useAuth().
//
// Sign-in exists for one reason: to put a real name and picture on a seat.
// Everything else (playing bots, stats-free local games) works signed out, so
// this provider must degrade quietly. If Supabase is unconfigured, `configured`
// is false, the sign-in buttons say so, and the rest of the app is unaffected.
//
// The OAuth flow, per platform:
//
//   native  signInWithOAuth(skipBrowserRedirect) hands back an authorize URL.
//           We open it in the system browser, the provider redirects to
//           pusoynow://auth-callback?code=..., and we exchange that code for a
//           session (PKCE, so the code is useless to anyone else).
//   web     signInWithOAuth redirects the whole page. On the way back,
//           supabase-js sees `?code=` and exchanges it itself
//           (detectSessionInUrl), so there is no browser hop to manage.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseOrNull, isSupabaseConfigured } from './supabase/client';
import {
  buildPlayerRow,
  interpretAuthSessionResult,
  pickDisplayName,
  resolveAvatarUrl,
  upsertPlayer,
} from './profile';

// Closes the popup window the provider opened, on web.
WebBrowser.maybeCompleteAuthSession();

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

interface AuthValue {
  // Null when signed out. Guests are the default, not an error state.
  session: Session | null;
  profile: AuthProfile | null;
  // True until the persisted session (if any) has been read back from storage.
  loading: boolean;
  // False when there is no .env. Sign-in is unavailable but the app still runs.
  configured: boolean;
  signIn(provider: SocialProvider): Promise<SignInResult>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

// Native lands back on the app's own scheme (app.json `scheme: pusoynow`).
// Web has to come back to a real page, so use the current origin.
function redirectUrl(): string {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' ? window.location.origin : '';
  }
  return Linking.createURL('auth-callback');
}

function profileFrom(session: Session, avatarUrl: string | null): AuthProfile {
  return { displayName: pickDisplayName(session.user), avatarUrl };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(configured);
  // Avoid setState after unmount, and avoid re-upserting the same session.
  const mounted = useRef(true);
  const syncedUserId = useRef<string | null>(null);

  // Cache the social avatar on the players row and mirror it into local state.
  // provider_token only exists on the session right after sign-in, and Facebook
  // needs it to hand back anything bigger than a 50px thumbnail, so this runs
  // on every sign-in rather than only the first.
  const syncProfile = useCallback(async (client: SupabaseClient, next: Session) => {
    let avatarUrl: string | null = null;
    try {
      avatarUrl = await resolveAvatarUrl(next.user, { providerToken: next.provider_token ?? null });
    } catch {
      // A missing picture is not worth failing a sign-in over.
    }
    if (mounted.current) setProfile(profileFrom(next, avatarUrl));

    try {
      await upsertPlayer(client as any, buildPlayerRow(next.user.id, next.user, avatarUrl));
    } catch (e) {
      // The session is real either way. A failed profile write (offline, RLS
      // misconfigured) must not bounce the player back to the guest state.
      console.warn('players upsert failed', e);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const client = getSupabaseOrNull();
    if (!client) {
      setLoading(false);
      return () => {
        mounted.current = false;
      };
    }

    void client.auth.getSession().then(({ data }) => {
      if (!mounted.current) return;
      setSession(data.session);
      if (data.session) {
        // Restored from storage, not a fresh sign-in: there is no provider_token
        // to re-fetch with, so show what the token already carries.
        setProfile(profileFrom(data.session, null));
      }
      setLoading(false);
    });

    const { data: sub } = client.auth.onAuthStateChange((event, next) => {
      if (!mounted.current) return;
      setSession(next);
      if (!next) {
        syncedUserId.current = null;
        setProfile(null);
        return;
      }
      if (event === 'SIGNED_IN' && syncedUserId.current !== next.user.id) {
        syncedUserId.current = next.user.id;
        void syncProfile(client, next);
      }
    });

    return () => {
      mounted.current = false;
      sub.subscription.unsubscribe();
    };
  }, [syncProfile]);

  const signIn = useCallback(async (provider: SocialProvider): Promise<SignInResult> => {
    const client = getSupabaseOrNull();
    if (!client) return { status: 'error', message: 'Sign-in is not configured yet.' };

    const redirectTo = redirectUrl();

    // Web: let the provider redirect the page. supabase-js finishes the job on
    // the way back, so there is nothing to await here.
    if (Platform.OS === 'web') {
      const { error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo } });
      if (error) return { status: 'error', message: error.message };
      return { status: 'redirecting' };
    }

    const { data, error } = await client.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) return { status: 'error', message: error.message };
    if (!data?.url) return { status: 'error', message: 'Could not start sign-in.' };

    const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    const outcome = interpretAuthSessionResult(res);
    // Backing out of the browser is an ordinary choice. Say nothing, stay a guest.
    if (outcome.kind === 'cancelled') return { status: 'cancelled' };
    if (outcome.kind === 'error') return { status: 'error', message: outcome.message };

    const { error: exchangeError } = await client.auth.exchangeCodeForSession(outcome.code);
    if (exchangeError) return { status: 'error', message: exchangeError.message };
    // onAuthStateChange fires SIGNED_IN, which sets the session and the profile.
    return { status: 'signed-in' };
  }, []);

  const signOut = useCallback(async () => {
    const client = getSupabaseOrNull();
    if (!client) return;
    await client.auth.signOut();
    // onAuthStateChange clears session and profile, but do not rely on the
    // round trip: the UI should be back to guest immediately.
    if (mounted.current) {
      setSession(null);
      setProfile(null);
      syncedUserId.current = null;
    }
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ session, profile, loading, configured, signIn, signOut }),
    [session, profile, loading, configured, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
