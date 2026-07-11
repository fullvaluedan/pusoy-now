// Root layout: sets up the Stack navigator and puts the auth session in scope
// for every screen. AuthProvider degrades quietly: with no signed-in session
// the app simply runs as a guest.
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../lib/auth';
import { colors } from '../lib/theme';

export default function RootLayout() {
  return (
    <AuthProvider>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.felt },
            headerTintColor: colors.textOnFelt,
            headerTitleStyle: { fontWeight: '700' },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'Pusoy Now' }} />
          <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
          <Stack.Screen name="lobby" options={{ title: 'Lobby' }} />
          <Stack.Screen name="bot-select" options={{ title: 'Pick opponents' }} />
          {/* The game draws its own slim in-table top bar; the default header
              would stack a second bar above the felt and clash with it. */}
          <Stack.Screen name="game-local" options={{ headerShown: false }} />
          <Stack.Screen name="leaderboard" options={{ title: 'Leaderboard' }} />
          <Stack.Screen name="stats" options={{ title: 'Scoreboard' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        </Stack>
      </SafeAreaProvider>
    </AuthProvider>
  );
}
