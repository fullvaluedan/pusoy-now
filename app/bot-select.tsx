// Bot-count picker. Pusoy Dos is 4-player only, so this is a single start
// button. The human plays against 3 computer opponents.
import { useRouter } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { Button, ScreenContainer } from '../components/ui';
import { colors, spacing, typography } from '../lib/theme';

export default function BotSelect() {
  const router = useRouter();
  return (
    <ScreenContainer>
      <Text style={styles.title}>Pusoy Dos is a 4-player game</Text>
      <Text style={styles.subtitle}>
        You'll play against 3 computer opponents. The player with the 3 of clubs leads first.
      </Text>
      <Button
        title="Start game"
        subtitle="You + 3 bots"
        align="left"
        onPress={() => router.push('/game-local?bots=3')}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.heading, fontSize: 26, color: colors.felt, marginTop: spacing.xl },
  subtitle: { ...typography.label, color: colors.textMuted, marginBottom: spacing.xxl, lineHeight: 22 },
});
