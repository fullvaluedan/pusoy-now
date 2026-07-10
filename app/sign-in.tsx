// Sign-in screen.
//
// Providers: Google, Facebook, TikTok. Apple is deferred to iOS App Store
// submission time and X/Twitter has been dropped (see the redesign plan).
// Instagram consumer login was retired by Meta in Dec 2024, so "Facebook"
// covers both.
//
// Google and Facebook run the real Supabase OAuth flow. TikTok is not a
// Supabase provider: it needs a Login Kit + Edge Function bridge and TikTok
// developer-app approval, so its button stays behind a coming-soon flag until
// that approval lands.
//
// Signing in is only ever about a display name and a picture. Guests keep full
// access to bot games, so nothing here is a gate.
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button, Card, ScreenContainer } from '../components/ui';
import { colors, providerBrand, spacing, typography } from '../lib/theme';
import { useAuth, type SocialProvider } from '../lib/auth';

// Flip to true once the TikTok developer app is approved and the tiktok-auth
// Edge Function is deployed.
const TIKTOK_ENABLED = false;

interface ProviderEntry {
  id: SocialProvider | 'tiktok';
  name: string;
  color: string;
}

const PROVIDERS: ProviderEntry[] = [
  { id: 'google', name: 'Google', color: providerBrand.google },
  { id: 'facebook', name: 'Facebook', color: providerBrand.facebook },
  { id: 'tiktok', name: 'TikTok', color: providerBrand.tiktok },
];

export default function SignIn() {
  const router = useRouter();
  const { session, profile, loading, configured, signIn, signOut } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onPressProvider(entry: ProviderEntry) {
    if (entry.id === 'tiktok') return; // disabled below; belt and braces
    setError(null);
    setBusy(entry.id);
    try {
      const result = await signIn(entry.id);
      if (result.status === 'signed-in') router.replace('/');
      // 'cancelled' means the player closed the browser. Say nothing.
      if (result.status === 'error') setError(result.message);
    } finally {
      setBusy(null);
    }
  }

  function hintFor(entry: ProviderEntry): string {
    if (entry.id === 'tiktok') return 'Coming soon';
    if (!configured) return 'Needs Supabase setup';
    return '';
  }

  if (loading) {
    return (
      <ScreenContainer>
        <ActivityIndicator color={colors.felt} />
      </ScreenContainer>
    );
  }

  if (session) {
    return (
      <ScreenContainer scroll>
        <Text style={styles.title}>Signed in</Text>
        <Text style={styles.subtitle}>
          You are signed in as {profile?.displayName ?? 'Player'}. Your name and picture show at your seat.
        </Text>
        <Button
          title="Sign out"
          onPress={async () => {
            await signOut();
            router.replace('/');
          }}
        />
        <Button title="Back" variant="ghost" onPress={() => router.replace('/')} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll>
      <Text style={styles.title}>Sign in</Text>
      <Text style={styles.subtitle}>
        Choose a social account. We only use it for your display name and picture, and to track your wins and losses.
      </Text>

      {PROVIDERS.map((p) => {
        const disabled = p.id === 'tiktok' ? !TIKTOK_ENABLED : !configured || busy !== null;
        return (
          <Button
            key={p.id}
            title={busy === p.id ? 'Opening browser...' : `Continue with ${p.name}`}
            subtitle={hintFor(p)}
            color={p.color}
            disabled={disabled}
            onPress={() => void onPressProvider(p)}
          />
        );
      })}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <Button title="Back" variant="ghost" onPress={() => router.replace('/')} />

      {!configured ? (
        <Card style={styles.setupBox}>
          <Text style={styles.setupTitle}>Setup required</Text>
          <Text style={styles.setupBody}>
            Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to a .env file, then enable Google and
            Facebook in your Supabase project. See .env.example. You can keep playing against bots without an account
            in the meantime.
          </Text>
        </Card>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.heading, color: colors.felt, marginTop: spacing.sm },
  subtitle: { ...typography.label, color: colors.textMuted, marginBottom: spacing.lg },
  setupBox: { marginTop: spacing.xl },
  setupTitle: { fontWeight: '700', color: colors.felt, marginBottom: spacing.xs },
  setupBody: { color: colors.textBody, fontSize: 13, lineHeight: 18 },
  errorBox: {
    backgroundColor: colors.dangerLight,
    borderRadius: 10,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  errorText: { color: colors.danger, fontSize: 13 },
});
