// Account deletion (U4): store-compliant, works two ways.
//
//   In-app / signed in: explain exactly what gets deleted, require the user to
//   type DELETE to arm the red button, call DELETE /api/account, then sign out
//   locally and return home. Deletion is irreversible.
//
//   Signed out (web visitors landing on prends.app/delete-account, the URL
//   Google's Data Safety form requires): explain the flow and offer a button
//   to sign in first, since deletion is account-scoped and needs a session.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Button, Card, Field, ScreenContainer } from '../components/ui';
import { colors, spacing, typography } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { apiUrl, authClient } from '../lib/authClient';

// The literal word the user must type to arm the delete button. A deliberate
// friction step so deletion is never a single mis-tap.
const CONFIRM_WORD = 'DELETE';

export default function DeleteAccount() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Signed-out visitors (the public web deletion page) cannot delete without a
  // session, so route them to sign in first.
  if (!session) {
    return (
      <ScreenContainer scroll>
        <Text style={styles.title}>Delete your account</Text>
        <Card style={styles.card}>
          <Text style={styles.body}>
            To delete your Prends account you first need to sign in, so we can confirm the account is
            yours. Once signed in, open this page again (or Settings, then Delete account) to finish.
          </Text>
          <Text style={styles.body}>
            Deleting removes your account, profile, friends, stats, and email preferences. It cannot
            be undone.
          </Text>
        </Card>
        <Button
          title="Sign in to delete your account"
          onPress={() => router.replace('/sign-in')}
          style={styles.action}
        />
        <Button title="Back" variant="ghost" onPress={() => router.back()} style={styles.action} />
      </ScreenContainer>
    );
  }

  const armed = confirm.trim().toUpperCase() === CONFIRM_WORD && !busy;

  async function handleDelete() {
    setError(null);
    setBusy(true);
    try {
      const { error: fetchError } = await authClient.$fetch(apiUrl('/api/account'), { method: 'DELETE' });
      if (fetchError) {
        setError('We could not delete your account. Please try again in a moment.');
        return;
      }
      // Drop the local session + SecureStore cookie jar, then leave for home as
      // a guest. The account no longer exists server-side either way.
      await signOut();
      router.replace('/');
    } catch {
      setError('We could not delete your account. Please try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenContainer scroll>
      <Text style={styles.title}>Delete your account</Text>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>This permanently deletes</Text>
        <Text style={styles.bullet}>- Your account and sign-in</Text>
        <Text style={styles.bullet}>- Your profile and username</Text>
        <Text style={styles.bullet}>- Your friends and friend requests</Text>
        <Text style={styles.bullet}>- Your stats and rankings</Text>
        <Text style={styles.bullet}>- Your marketing email preference</Text>
        <Text style={styles.note}>
          Game records in finished rooms stay, but they are anonymous and no longer linked to you.
          This cannot be undone.
        </Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Confirm</Text>
        <Text style={styles.body}>
          Type {CONFIRM_WORD} below to enable the delete button.
        </Text>
        <Field
          value={confirm}
          onChangeText={setConfirm}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder={CONFIRM_WORD}
          error={error}
        />
      </Card>

      <Button
        title="Delete my account"
        color={colors.cardRed}
        disabled={!armed}
        loading={busy}
        onPress={handleDelete}
        style={styles.action}
      />
      <Button title="Cancel" variant="ghost" onPress={() => router.back()} style={styles.action} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.heading,
    color: colors.felt,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  card: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.bodyBold,
    color: colors.felt,
    marginBottom: spacing.sm,
  },
  body: {
    ...typography.body,
    color: colors.textBody,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  bullet: {
    ...typography.body,
    color: colors.textBody,
    lineHeight: 20,
    marginLeft: spacing.md,
    marginBottom: 2,
  },
  note: {
    ...typography.caption,
    color: colors.textMuted,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  action: {
    marginTop: spacing.sm,
  },
});
