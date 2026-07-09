// Online lobby. Stub for vertical slice.
//
// Real implementation will:
//   - Subscribe to Supabase realtime channel on `games` table
//   - Show waiting games (status='waiting') and a "Create game" button
//   - On join, update seat_N to current user, transition to active, deal
//   - Navigate to /game-online
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Lobby() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Online lobby</Text>
      <Text style={styles.subtitle}>
        Available games will appear here. Supabase realtime is required.
      </Text>

      <View style={styles.empty}>
        <Text style={styles.emptyText}>No games waiting</Text>
        <Pressable
          style={styles.btn}
          onPress={() => alert('Create game requires Supabase auth. See /sign-in.')}
        >
          <Text style={styles.btnText}>Create game</Text>
        </Pressable>
      </View>

      <Pressable
        style={[styles.btn, styles.btnGhost]}
        onPress={() => router.replace('/')}
      >
        <Text style={styles.btnText}>Back</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f4f1e8' },
  title: { fontSize: 28, fontWeight: '800', color: '#0e4a3a' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 20 },
  empty: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    marginVertical: 24,
  },
  emptyText: { color: '#666', marginBottom: 16 },
  btn: { backgroundColor: '#0e4a3a', padding: 14, borderRadius: 10, alignItems: 'center' },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#0e4a3a' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
