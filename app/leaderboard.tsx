// Leaderboard stub. Real implementation will read from public.leaderboard
// (wins/losses) and public.players (display name, avatar) via Supabase.
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Leaderboard() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Leaderboard</Text>
      <Text style={styles.subtitle}>Top players by total wins</Text>

      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          Leaderboard is empty — sign in and play a few games to populate it.
        </Text>
        <Text style={styles.emptyText}>
          Real data will come from public.leaderboard (Supabase).
        </Text>
      </View>

      <Pressable
        style={styles.btn}
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
    marginBottom: 24,
  },
  emptyText: { color: '#666', marginBottom: 8, fontSize: 14 },
  btn: { backgroundColor: '#0e4a3a', padding: 14, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
