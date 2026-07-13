// Root layout: sets up the Stack navigator and puts the auth session in scope
// for every screen. AuthProvider degrades quietly: with no signed-in session
// the app simply runs as a guest.
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../lib/auth';
import { EntitlementProvider } from '../lib/entitlements';

export default function RootLayout() {
  return (
    <AuthProvider>
      {/* Entitlements depend on auth (the premium flag lives on the account),
          so this nests inside AuthProvider. */}
      <EntitlementProvider>
        <SafeAreaProvider>
          <StatusBar style="auto" />
          {/* U3: exactly one header system app-wide. Every native header is off
              here (screenOptions) so the in-screen CompactHeader (or, on the
              felt table / room screen, the game's own top bar) is the only
              header that ever renders -- no screen shows a duplicated title. */}
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="how-to-play" />
            <Stack.Screen name="sign-in" />
            <Stack.Screen name="bot-select" />
            <Stack.Screen name="game-local" />
            <Stack.Screen name="play-online" />
            <Stack.Screen name="matchmaking" />
            <Stack.Screen name="room/[code]" />
            <Stack.Screen name="join/[code]" />
            <Stack.Screen name="stats" />
            <Stack.Screen name="settings" />
            <Stack.Screen name="delete-account" />
            <Stack.Screen name="privacy" />
            <Stack.Screen name="terms" />
            <Stack.Screen name="account" />
            <Stack.Screen name="friends-rank" />
            <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
          </Stack>
        </SafeAreaProvider>
      </EntitlementProvider>
    </AuthProvider>
  );
}
