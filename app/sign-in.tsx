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
  { id: 'apple', name: 'Apple', color: providerBrand.apple, hint: 'iOS only' },
  { id: 'google', name: 'Google', color: providerBrand.google, hint: 'Recommended' },
  { id: 'facebook', name: 'Facebook / Instagram', color: providerBrand.facebook, hint: 'via Facebook Login' },
  { id: 'twitter', name: 'X (Twitter)', color: providerBrand.twitter, hint: '' },
  { id: 'tiktok', name: 'TikTok', color: providerBrand.tiktok, hint: 'Beta' },
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
          onPress={() => alert(`${p.name} login requires Supabase config.\n\nSee supabase/schema.sql and lib/supabase/client.ts.`)}
        />
      ))}

      <Button title="Back" variant="ghost" onPress={() => router.replace('/')} />

      <Card style={styles.setupBox}>
        <Text style={styles.setupTitle}>Setup required</Text>
        <Text style={styles.setupBody}>
          Each provider needs an OAuth app on its developer portal, and Supabase must be configured to use it. See the README for a step-by-step.
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
