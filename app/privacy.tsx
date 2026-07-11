// Privacy Policy for Prends: plain-English explanation of data collection,
// processing, retention, and user rights.
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, ScreenContainer } from '../components/ui';
import { colors, spacing, typography } from '../lib/theme';

export default function Privacy() {
  const router = useRouter();

  return (
    <ScreenContainer scroll>
      <Text style={styles.title}>Privacy Policy</Text>
      <Text style={styles.date}>Effective 2026-07-11</Text>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>What we collect</Text>
        <Text style={styles.body}>
          When you sign up or sign in to Prends, we collect:
        </Text>
        <Text style={styles.bulletList}>
          - Your email address (used to sign in and for account recovery)
        </Text>
        <Text style={styles.bulletList}>
          - Your display name (shown to other players)
        </Text>
        <Text style={styles.bulletList}>
          - Your user ID (identifies your account in our database)
        </Text>
        <Text style={styles.bulletList}>
          - Your game stats (wins, losses, rankings, hands played)
        </Text>
        <Text style={styles.bulletList}>
          - Your friends list and connection data
        </Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Why we collect it</Text>
        <Text style={styles.body}>
          We use this information to:
        </Text>
        <Text style={styles.bulletList}>
          - Run the game and let you play against other people online
        </Text>
        <Text style={styles.bulletList}>
          - Keep your friends list and ranking scores accurate
        </Text>
        <Text style={styles.bulletList}>
          - Send you marketing emails about game updates and events (only if you opt in, and you can unsubscribe anytime)
        </Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Who processes your data</Text>
        <Text style={styles.body}>
          Your data is hosted and processed by:
        </Text>
        <Text style={styles.bulletList}>
          - Cloudflare (web hosting, database, API)
        </Text>
        <Text style={styles.bulletList}>
          - Google, Facebook, or Apple (if you use their sign-in)
        </Text>
        <Text style={styles.bulletList}>
          - Resend (sends marketing emails if you opt in)
        </Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>What we do NOT do</Text>
        <Text style={styles.bulletList}>
          - No ads or ad networks
        </Text>
        <Text style={styles.bulletList}>
          - No tracking pixels or analytics for marketing
        </Text>
        <Text style={styles.bulletList}>
          - No selling or sharing your data with third parties
        </Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>How long we keep your data</Text>
        <Text style={styles.body}>
          We keep your data while your account exists. When you delete your account, all your personal data is removed from our servers within 30 days.
        </Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Delete your account</Text>
        <Text style={styles.body}>
          You can delete your account from within the app: go to Settings and tap "Delete account". You will need to confirm by typing DELETE.
        </Text>
        <Text style={styles.body}>
          You can also delete your account on the web at prends.app/delete-account without the app installed.
        </Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Unsubscribe from marketing emails</Text>
        <Text style={styles.body}>
          Every marketing email we send includes an unsubscribe link you can click. You can also manage your email preferences in the app under Settings.
        </Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Questions or concerns</Text>
        <Text style={styles.body}>
          Contact us at danreola@gmail.com if you have questions about how we handle your data.
        </Text>
      </Card>

      <Button
        title="Back"
        variant="ghost"
        style={styles.backBtn}
        onPress={() => router.back()}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.heading,
    color: colors.felt,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  date: {
    ...typography.caption,
    color: colors.textMuted,
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
  bulletList: {
    ...typography.body,
    color: colors.textBody,
    lineHeight: 20,
    marginLeft: spacing.md,
    marginBottom: 2,
  },
  backBtn: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
});
