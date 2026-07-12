// Terms of Service for Prends: the short version covering account use,
// content policy, service disclaimers, and contact info.
import { useRouter } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { CompactHeader, Button, Card, ScreenContainer } from '../components/ui';
import { colors, spacing, typography } from '../lib/theme';

export default function Terms() {
  const router = useRouter();

  return (
    <ScreenContainer scroll>
      <CompactHeader title="Terms of Service" />
      <Text style={styles.date}>Effective 2026-07-11</Text>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>The game is free</Text>
        <Text style={styles.body}>
          Prends is free to play. You can create an account, play online, and compete on the leaderboard at no cost. There are no hidden fees or subscriptions in this version.
        </Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Play fair</Text>
        <Text style={styles.body}>
          Your account must not be used to:
        </Text>
        <Text style={styles.bulletList}>
          - Use offensive, abusive, or hateful usernames
        </Text>
        <Text style={styles.bulletList}>
          - Cheat or exploit game bugs to gain an unfair advantage
        </Text>
        <Text style={styles.bulletList}>
          - Harass, threaten, or abuse other players
        </Text>
        <Text style={styles.body}>
          Accounts that break these rules will be removed without warning.
        </Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>No warranties</Text>
        <Text style={styles.body}>
          Prends is provided as-is. We do not guarantee that the game will always be available, free from bugs, or work exactly as you expect. We are not responsible for any losses, interruptions, or problems you experience while playing.
        </Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>We can remove your account</Text>
        <Text style={styles.body}>
          If you break the play-fair rules or use the service in a way that harms other players or the game, we can remove your account at any time without notice or refund.
        </Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Questions</Text>
        <Text style={styles.body}>
          If you have questions about these terms, contact us at danreola@gmail.com.
        </Text>
      </Card>

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
