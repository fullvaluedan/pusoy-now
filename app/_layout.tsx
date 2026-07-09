// Root layout: just sets up the Stack navigator with the screens we use.
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0e4a3a' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Pusoy Now' }} />
        <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
        <Stack.Screen name="lobby" options={{ title: 'Lobby' }} />
        <Stack.Screen name="game" options={{ title: 'Game' }} />
        <Stack.Screen name="leaderboard" options={{ title: 'Leaderboard' }} />
        <Stack.Screen name="stats" options={{ title: 'Your stats' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
