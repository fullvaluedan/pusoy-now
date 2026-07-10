// Your stats + head-to-head records. Stub for vertical slice.
import { useRouter } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { Button, Card, ScreenContainer } from '../components/ui';
import { colors, spacing, typography } from '../lib/theme';

export default function Stats() {
  const router = useRouter();
  return (
    <ScreenContainer>
      <Text style={styles.title}>Your stats</Text>
      <Text style={styles.subtitle}>Sign in to start tracking</Text>

      <Card style={styles.box}>
        <Text style={styles.statLabel}>Wins</Text>
        <Text style={styles.statValue}>-</Text>
      </Card>
      <Card style={styles.box}>
        <Text style={styles.statLabel}>Losses</Text>
        <Text style={styles.statValue}>-</Text>
      </Card>
      <Card style={styles.box}>
        <Text style={styles.statLabel}>Win rate</Text>
        <Text style={styles.statValue}>-</Text>
      </Card>

      <Button title="Back" style={styles.btn} onPress={() => router.replace('/')} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.heading, color: colors.felt },
  subtitle: { ...typography.label, color: colors.textMuted, marginBottom: spacing.lg },
  box: {
    marginBottom: spacing.sm + 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: { color: colors.textMuted, fontSize: 16 },
  statValue: { color: colors.felt, fontSize: 22, fontWeight: '800' },
  btn: { marginTop: spacing.lg },
});
