// Bot-count picker. 1-3 bots, then routes to the local game screen.
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function BotSelect() {
  const router = useRouter();

  const go = (count: number) => {
    router.push({ pathname: '/game-local', params: { bots: count } });
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Choose your opponents</Text>
      <Text style={styles.subtitle}>You + up to 3 bots (4 players total)</Text>

      <View style={styles.menu}>
        {[1, 2, 3].map((n) => (
          <Pressable
            key={n}
            style={styles.btn}
            onPress={() => go(n)}
          >
            <Text style={styles.btnText}>You vs {n} bot{n > 1 ? 's' : ''}</Text>
            <Text style={styles.btnSub}>
              {n + 1} players
              {n === 1 ? ' (faster)' : n === 2 ? '' : ' (full table)'}
            </Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f4f1e8' },
  title: { fontSize: 28, fontWeight: '800', color: '#0e4a3a', marginTop: 24 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 32 },
  menu: { gap: 14 },
  btn: {
    padding: 22,
    borderRadius: 14,
    backgroundColor: '#0e4a3a',
  },
  btnText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  btnSub: { color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 2 },
});
