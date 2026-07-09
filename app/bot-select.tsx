// Bot-count picker. Pusoy Dos is 4-player only, so this is a single start
// button. The human plays against 3 computer opponents.
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function BotSelect() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Pusoy Dos is a 4-player game</Text>
      <Text style={styles.subtitle}>
        You'll play against 3 computer opponents. The player with the 3 of clubs leads first.
      </Text>
      <Pressable
        style={styles.btn}
        onPress={() => router.push('/game-local?bots=3')}
      >
        <Text style={styles.btnText}>Start game</Text>
        <Text style={styles.btnSub}>You + 3 bots</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f4f1e8' },
  title: { fontSize: 26, fontWeight: '800', color: '#0e4a3a', marginTop: 24 },
  subtitle: { fontSize: 15, color: '#666', marginBottom: 32, lineHeight: 22 },
  btn: { padding: 22, borderRadius: 14, backgroundColor: '#0e4a3a' },
  btnText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  btnSub: { color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 2 },
});
