// Root layout: sets up the Stack navigator and puts the auth session in scope
// for every screen. AuthProvider degrades quietly: with no signed-in session
// the app simply runs as a guest.
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../lib/auth';
import { EntitlementProvider } from '../lib/entitlements';
import { colors, typography } from '../lib/theme';

export default function RootLayout() {
  return (
    <AuthProvider>
      {/* Entitlements depend on auth (the premium flag lives on the account),
          so this nests inside AuthProvider. */}
      <EntitlementProvider>
        <SafeAreaProvider>
          <StatusBar style="auto" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.cream },
              headerTintColor: colors.textPrimary,
              headerTitleStyle: { fontWeight: typography.subheading.fontWeight, color: colors.textPrimary },
              headerTitleAlign: 'center',
              headerShadowVisible: false,
            }}
          >
            <Stack.Screen name="index" options={{ title: 'Prends' }} />
            <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
            <Stack.Screen name="lobby" options={{ title: 'Lobby' }} />
            <Stack.Screen name="bot-select" options={{ title: 'Pick opponents' }} />
            {/* The game draws its own slim in-table top bar; the default header
                would stack a second bar above the felt and clash with it. */}
            <Stack.Screen name="game-local" options={{ headerShown: false }} />
            <Stack.Screen name="play-online" options={{ title: 'Play online' }} />
            {/* The room screen draws its own in-line header (see app/room/[code].tsx)
                since it becomes the live felt-less table once play starts. */}
            <Stack.Screen name="room/[code]" options={{ headerShown: false }} />
            <Stack.Screen name="join/[code]" options={{ title: 'Join game' }} />
            <Stack.Screen name="leaderboard" options={{ title: 'Leaderboard' }} />
            <Stack.Screen name="stats" options={{ title: 'Scoreboard' }} />
            <Stack.Screen name="settings" options={{ title: 'Settings' }} />
            <Stack.Screen name="privacy" options={{ title: 'Privacy Policy' }} />
            <Stack.Screen name="terms" options={{ title: 'Terms of Service' }} />
            <Stack.Screen name="profile" options={{ title: 'Profile' }} />
            <Stack.Screen name="friends" options={{ title: 'Friends' }} />
            <Stack.Screen name="friends-rank" options={{ title: 'Ranking' }} />
            <Stack.Screen name="paywall" options={{ title: 'Remove ads', presentation: 'modal' }} />
          </Stack>
        </SafeAreaProvider>
      </EntitlementProvider>
    </AuthProvider>
  );
}
