// Leaderboard stub. Real implementation will read from public.leaderboard
// (wins/losses) and public.players (display name, avatar) via Supabase.
import { useRouter } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { Button, Card, ScreenContainer } from '../components/ui';
import { colors, spacing, typography } from '../lib/theme';

export default function Leaderboard() {
  const router = useRouter();
  return (
    <ScreenContainer>
      <Text style={styles.title}>Leaderboard</Text>
      <Text style={styles.subtitle}>Top players by total wins</Text>

      <Card style={styles.empty}>
        <Text style={styles.emptyText}>
          Leaderboard is empty. Sign in and play a few games to populate it.
        </Text>
        <Text style={styles.emptyText}>
          Real data will come from public.leaderboard (Supabase).
        </Text>
      </Card>

      <Button title="Back" onPress={() => router.replace('/')} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.heading, color: colors.felt },
  subtitle: { ...typography.label, color: colors.textMuted, marginBottom: spacing.lg },
  empty: {
    padding: spacing.xl,
    marginBottom: spacing.xl,
  },
  emptyText: { color: colors.textMuted, marginBottom: spacing.sm, fontSize: 14 },
});
