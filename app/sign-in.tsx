// Sign-in screen. Stub for vertical slice.
//
// Providers: Google, Facebook, TikTok. Apple is deferred to iOS App Store
// submission time and X/Twitter has been dropped (see the redesign plan).
// Instagram consumer login was retired by Meta in Dec 2024, so "Facebook"
// covers both.
//
// None of these buttons are wired up yet:
//   - Google and Facebook go live once lib/auth.tsx lands (Supabase OAuth).
//   - TikTok needs a Login Kit + Supabase Edge Function bridge and TikTok
//     developer app approval, so it ships later still.
// For now they show a "coming soon" toast so the hint text never claims a
// provider works before it does.
import { useRouter } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { Button, Card, ScreenContainer } from '../components/ui';
import { colors, providerBrand, spacing, typography } from '../lib/theme';

interface Provider {
  id: string;
  name: string;
  color: string;
  hint: string;
}

const PROVIDERS: Provider[] = [
  { id: 'google', name: 'Google', color: providerBrand.google, hint: 'Not connected yet' },
  { id: 'facebook', name: 'Facebook', color: providerBrand.facebook, hint: 'Not connected yet' },
  { id: 'tiktok', name: 'TikTok', color: providerBrand.tiktok, hint: 'Coming soon' },
];

export default function SignIn() {
  const router = useRouter();

  return (
    <ScreenContainer scroll>
      <Text style={styles.title}>Sign in</Text>
      <Text style={styles.subtitle}>
        Choose a social account. We only use it for your display name and to track your wins and losses.
      </Text>
      {PROVIDERS.map((p) => (
        <Button
          key={p.id}
          title={`Continue with ${p.name}`}
          subtitle={p.hint}
          color={p.color}
          onPress={() => alert(`${p.name} sign-in isn't connected yet.\n\nGuests can still play against bots with no account.`)}
        />
      ))}

      <Button title="Back" variant="ghost" onPress={() => router.replace('/')} />

      <Card style={styles.setupBox}>
        <Text style={styles.setupTitle}>Setup required</Text>
        <Text style={styles.setupBody}>
          Social sign-in isn't live yet. Google and Facebook are next up; TikTok follows once its developer app is approved. You can keep playing against bots without an account in the meantime.
        </Text>
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.heading, color: colors.felt, marginTop: spacing.sm },
  subtitle: { ...typography.label, color: colors.textMuted, marginBottom: spacing.lg },
  setupBox: { marginTop: spacing.xl },
  setupTitle: { fontWeight: '700', color: colors.felt, marginBottom: spacing.xs },
  setupBody: { color: colors.textBody, fontSize: 13, lineHeight: 18 },
});
