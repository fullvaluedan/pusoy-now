// Settings stub.
import { useRouter } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { Button, Card, ScreenContainer } from '../components/ui';
import { colors, spacing, typography } from '../lib/theme';

export default function Settings() {
  const router = useRouter();
  return (
    <ScreenContainer>
      <Text style={styles.title}>Settings</Text>

      <Card style={styles.box}>
        <Text style={styles.row}>Account</Text>
        <Text style={styles.row}>Sound</Text>
        <Text style={styles.row}>Haptics</Text>
        <Text style={styles.row}>About</Text>
      </Card>

      <Button title="Back" style={styles.btn} onPress={() => router.replace('/')} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.heading, color: colors.felt },
  box: { marginTop: spacing.md + 2 },
  row: { fontSize: 16, color: colors.textPrimary, paddingVertical: spacing.sm },
  btn: { marginTop: spacing.lg },
});
