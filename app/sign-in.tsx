// Sign-in screen. Stub for vertical slice.
//
// To enable real social logins:
//   1. Configure each provider in Supabase (Authentication > Providers)
//   2. Add OAuth client IDs/secrets to the supabase project
//   3. Use supabase.auth.signInWithIdToken or signInWithOAuth
//   4. For iOS specifically, add the URL scheme in app.json
//
// For the vertical slice we show a list of buttons and a "coming soon" toast
// explaining what's needed to flip each one on.
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Provider {
  id: string;
  name: string;
  color: string;
  hint: string;
}

const PROVIDERS: Provider[] = [
  { id: 'apple', name: 'Apple', color: '#000', hint: 'iOS only' },
  { id: 'google', name: 'Google', color: '#4285F4', hint: 'Recommended' },
  { id: 'facebook', name: 'Facebook / Instagram', color: '#1877F2', hint: 'via Facebook Login' },
  { id: 'twitter', name: 'X (Twitter)', color: '#000', hint: '' },
  { id: 'tiktok', name: 'TikTok', color: '#010101', hint: 'Beta' },
];

export default function SignIn() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.subtitle}>
          Choose a social account. We only use it for your display name and to track your wins and losses.
        </Text>
        {PROVIDERS.map((p) => (
          <Pressable
            key={p.id}
            style={[styles.btn, { backgroundColor: p.color }]}
            onPress={() => alert(`${p.name} login requires Supabase config.\n\nSee supabase/schema.sql and lib/supabase/client.ts.`)}
          >
            <Text style={styles.btnText}>Continue with {p.name}</Text>
            {p.hint && <Text style={styles.btnHint}>{p.hint}</Text>}
          </Pressable>
        ))}

        <Pressable
          style={[styles.btn, styles.btnGhost]}
          onPress={() => router.replace('/')}
        >
          <Text style={styles.btnText}>Back</Text>
        </Pressable>

        <View style={styles.setupBox}>
          <Text style={styles.setupTitle}>Setup required</Text>
          <Text style={styles.setupBody}>
            Each provider needs an OAuth app on its developer portal, and Supabase must be configured to use it. See the README for a step-by-step.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f1e8' },
  scroll: { padding: 20, gap: 12 },
  title: { fontSize: 28, fontWeight: '800', color: '#0e4a3a', marginTop: 8 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 20 },
  btn: { padding: 16, borderRadius: 12, alignItems: 'center' },
  btnGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#0e4a3a',
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnHint: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
  setupBox: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 10,
    marginTop: 24,
  },
  setupTitle: { fontWeight: '700', color: '#0e4a3a', marginBottom: 4 },
  setupBody: { color: '#444', fontSize: 13, lineHeight: 18 },
});
