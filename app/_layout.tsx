// Root layout: sets up the Stack navigator and puts the auth session in scope
// for every screen. AuthProvider is safe to mount with no Supabase config: it
// reports `configured: false` and the app runs as a guest.
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
          <Stack.Screen name="game-local" options={{ title: 'Game' }} />
          <Stack.Screen name="leaderboard" options={{ title: 'Leaderboard' }} />
          <Stack.Screen name="stats" options={{ title: 'Scoreboard' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        </Stack>
      </SafeAreaProvider>
    </AuthProvider>
  );
}
