// Home: mode picker. For the vertical slice we have:
//   - Play vs Bots (no account needed, runs locally)
//   - Sign in to play online (links to sign-in screen)
//
// Online lobby creation/joining and Bluetooth are stubs that show a "coming
// soon" toast and link to the relevant doc page.
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Home() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Pusoy Now</Text>
      <Text style={styles.subtitle}>4-player Filipino card game</Text>

      <View style={styles.menu}>
        <Pressable
          style={[styles.btn, styles.btnPrimary]}
          onPress={() => router.push('/bot-select')}
        >
          <Text style={styles.btnText}>Play vs Bots</Text>
          <Text style={styles.btnSub}>No account required</Text>
        </Pressable>

        <Pressable
          style={[styles.btn, styles.btnSecondary]}
          onPress={() => router.push('/sign-in')}
        >
          <Text style={styles.btnText}>Sign in to play online</Text>
          <Text style={styles.btnSub}>Apple, Google, Facebook, X, TikTok</Text>
        </Pressable>

        <Pressable
          style={[styles.btn, styles.btnGhost]}
          onPress={() => router.push('/leaderboard')}
        >
          <Text style={styles.btnText}>Leaderboard</Text>
        </Pressable>

        <Pressable
          style={[styles.btn, styles.btnGhost]}
          onPress={() => router.push('/bluetooth-info')}
        >
          <Text style={styles.btnText}>Bluetooth (plane mode)</Text>
          <Text style={styles.btnSub}>Coming soon</Text>
        </Pressable>
      </View>

      <Text style={styles.footer}>v0.1 vertical slice</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f4f1e8' },
  title: { fontSize: 40, fontWeight: '800', color: '#0e4a3a', marginTop: 24 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 32 },
  menu: { gap: 14 },
  btn: {
    padding: 18,
    borderRadius: 14,
    minHeight: 70,
    justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: '#0e4a3a' },
  btnSecondary: { backgroundColor: '#1c7a5d' },
  btnGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#0e4a3a',
  },
  btnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  btnSub: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 2 },
  footer: { textAlign: 'center', color: '#999', marginTop: 'auto' },
});
