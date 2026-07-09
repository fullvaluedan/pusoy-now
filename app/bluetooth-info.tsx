// Bluetooth info screen. For the vertical slice this is a placeholder. The
// real implementation requires:
//   1. expo prebuild + dev client (not Expo Go) to add the native module
//   2. react-native-nearby-connection for iOS+Android
//   3. Permission requests via expo-permissions
//   4. A lobby model: discover nearby devices, pick one, host or join
//   5. Adapt localGame.ts to drive itself over the BT channel instead of bots
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function BluetoothInfo() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Bluetooth multiplayer</Text>
        <Text style={styles.subtitle}>
          Play with people nearby — no internet required. Perfect for flights, commutes, and the back seat.
        </Text>

        <Text style={styles.section}>What works today</Text>
        <Text style={styles.bullet}>
          • Full Pusoy Dos game engine (1 human vs 1-3 bots)
        </Text>
        <Text style={styles.bullet}>
          • 4-player rotation, 15s turn timer, pass mechanic
        </Text>

        <Text style={styles.section}>What's needed for Bluetooth</Text>
        <Text style={styles.bullet}>
          • Switch from Expo Go to a dev client (one-time setup)
        </Text>
        <Text style={styles.bullet}>
          • Add react-native-nearby-connection
        </Text>
        <Text style={styles.bullet}>
          • Build a discovery + host/join flow
        </Text>
        <Text style={styles.bullet}>
          • Reuse the existing local game state for the in-game traffic
        </Text>

        <Pressable
          style={styles.btn}
          onPress={() => router.replace('/')}
        >
          <Text style={styles.btnText}>Back</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f1e8' },
  scroll: { padding: 20 },
  title: { fontSize: 28, fontWeight: '800', color: '#0e4a3a' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 8, marginBottom: 24 },
  section: { fontSize: 16, fontWeight: '700', color: '#0e4a3a', marginTop: 16, marginBottom: 4 },
  bullet: { fontSize: 14, color: '#222', marginBottom: 6, lineHeight: 20 },
  btn: { backgroundColor: '#0e4a3a', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 24 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
