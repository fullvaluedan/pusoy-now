// Supabase client + schema bootstrap instructions.
//
// To run end-to-end you need a Supabase project. Free tier is enough.
//
// 1. Create project at https://supabase.com
// 2. Add a .env file at the project root with:
//      EXPO_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
//      EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
// 3. Run the SQL in supabase/schema.sql in the Supabase SQL editor
// 4. Enable the providers you want in Authentication > Providers:
//    - Apple (iOS), Google, Facebook, X/Twitter, TikTok
//    (Each requires its own OAuth app registration. For the vertical slice we
//    wire Google and Apple as the easiest path — Facebook/Instagram/X/TikTok
//    need Meta/Twitter/ByteDance developer setup and app review.)
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

let _client: SupabaseClient | null = null;

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
        Platform.OS === 'web'
          ? // use a non-secure fallback for web only
            (typeof window !== 'undefined' ? window.localStorage : undefined) as any
          : (ExpoSecureStoreAdapter as any),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return _client;
}
