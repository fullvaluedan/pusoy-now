// Supabase client + schema bootstrap instructions.
//
// To run end-to-end you need a Supabase project. Free tier is enough.
//
// 1. Create project at https://supabase.com
// 2. Add a .env file at the project root with:
//      EXPO_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
//      EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
// 3. Run the SQL in supabase/schema.sql in the Supabase SQL editor
// 4. Enable Google and Facebook in Authentication > Providers. Each needs its
//    own OAuth app (Google Cloud Console / Meta for Developers) with the
//    Supabase callback URL registered. TikTok is not a Supabase provider and
//    goes through the Edge Function bridge in supabase/functions/tiktok-auth.
// 5. Add the app's redirect URLs to Authentication > URL Configuration:
//      pusoynow://auth-callback        (native)
//      http://localhost:8081           (web dev)
//
// The schema is intentionally minimal. Realtime is enabled on the games table
// so all 4 clients can listen to state changes.

import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// SecureStore on iOS uses Keychain (encrypted). On Android, encrypted shared
// prefs. Both are secure. Web has no equivalent so we fall back to a plain
// storage adapter if running in a browser.
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => {
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string) => {
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string) => {
    return SecureStore.deleteItemAsync(key);
  },
};

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const isWeb = Platform.OS === 'web';

let _client: SupabaseClient | null = null;

// Guests play bots with no account and no .env, so nothing may throw just
// because Supabase is unconfigured. Callers that need auth check this first.
export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  if (!url || !anonKey) {
    // Friendly error to surface in the UI rather than a cryptic client crash.
    throw new Error(
      'Supabase not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env',
    );
  }
  _client = createClient(url, anonKey, {
    auth: {
      storage:
        isWeb
          ? // use a non-secure fallback for web only
            (typeof window !== 'undefined' ? window.localStorage : undefined) as any
          : (ExpoSecureStoreAdapter as any),
      autoRefreshToken: true,
      persistSession: true,
      // PKCE keeps the authorization code useless without the verifier this
      // client holds, which matters most on native where the redirect lands on
      // a URL scheme any app could claim.
      flowType: 'pkce',
      // On web the provider redirects the whole page back with `?code=`, and
      // supabase-js exchanges it on load. On native there is no page to detect,
      // so lib/auth.tsx exchanges the code from the deep link itself.
      detectSessionInUrl: isWeb,
    },
  });
  return _client;
}

// Null instead of throwing, for the guest paths.
export function getSupabaseOrNull(): SupabaseClient | null {
  return isSupabaseConfigured() ? getSupabase() : null;
}
