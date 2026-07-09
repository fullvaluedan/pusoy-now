// Your stats + head-to-head records. Stub for vertical slice.
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Stats() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Your stats</Text>
      <Text style={styles.subtitle}>Sign in to start tracking</Text>

      <View style={styles.box}>
        <Text style={styles.statLabel}>Wins</Text>
        <Text style={styles.statValue}>—</Text>
      </View>
      <View style={styles.box}>
        <Text style={styles.statLabel}>Losses</Text>
        <Text style={styles.statValue}>—</Text>
      </View>
      <View style={styles.box}>
        <Text style={styles.statLabel}>Win rate</Text>
        <Text style={styles.statValue}>—</Text>
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
  box: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 10,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: { color: '#666', fontSize: 16 },
  statValue: { color: '#0e4a3a', fontSize: 22, fontWeight: '800' },
  btn: { backgroundColor: '#0e4a3a', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 20 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
