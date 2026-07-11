// The better-auth client, talking to the Cloudflare auth Worker.
//
// Platform split (the plan's session decision):
//   native  the @better-auth/expo plugin keeps the session in a SecureStore
//           cookie-jar (Keychain / encrypted prefs) and drives the OAuth
//           browser hop back through the prends:// scheme.
//   web     ordinary browser cookies. The Expo plugin is undocumented on
//           react-native-web, so it is left off and requests just send
//           credentials; web flows are verified manually.
//
// expo-secure-store exposes synchronous getItem/setItem, which is exactly the
// storage shape the Expo plugin requires (it cannot await).

import { Platform } from 'react-native';
import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';

// The deployed auth Worker. Overridable via env so a local `wrangler dev` or a
// staging Worker can be pointed at without touching code.
export const AUTH_BASE_URL =
  process.env.EXPO_PUBLIC_AUTH_URL ?? 'https://pusoy-now-auth.fullvaluedan.workers.dev';

const isWeb = Platform.OS === 'web';

export const authClient = createAuthClient({
  baseURL: AUTH_BASE_URL,
  // Cross-site session cookies must ride along on every request.
  fetchOptions: { credentials: 'include' },
  plugins: isWeb
    ? []
    : [
        expoClient({
          scheme: 'prends',
          storagePrefix: 'prends',
          storage: SecureStore,
        }),
      ],
});
