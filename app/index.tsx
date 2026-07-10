// Home: mode picker. For the vertical slice we have:
//   - Play vs Bots (no account needed, runs locally)
//   - Sign in to play online (links to sign-in screen)
//
// Online lobby creation/joining and Bluetooth are stubs that show a "coming
// soon" toast and link to the relevant doc page.
import { useRouter } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { Button, ScreenContainer } from '../components/ui';
import { colors, spacing, typography } from '../lib/theme';

export default function Home() {
  const router = useRouter();

  return (
    <ScreenContainer>
      <Text style={styles.title}>Pusoy Now</Text>
      <Text style={styles.subtitle}>4-player Filipino card game</Text>

      <Button
        title="Play vs Bots"
        subtitle="No account required"
        variant="primary"
        align="left"
        onPress={() => router.push('/bot-select')}
        style={styles.menuItem}
      />

      <Button
        title="Sign in to play online"
        subtitle="Apple, Google, Facebook, X, TikTok"
        variant="secondary"
        align="left"
        onPress={() => router.push('/sign-in')}
        style={styles.menuItem}
      />

      <Button
        title="Leaderboard"
        variant="ghost"
        align="left"
        onPress={() => router.push('/leaderboard')}
        style={styles.menuItem}
      />

      <Button
        title="Bluetooth (plane mode)"
        subtitle="Coming soon"
        variant="ghost"
        align="left"
        onPress={() => router.push('/bluetooth-info')}
        style={styles.menuItem}
      />

      <Text style={styles.footer}>v0.1 vertical slice</Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.felt, marginTop: spacing.xl },
  subtitle: { ...typography.body, color: colors.textMuted, marginBottom: spacing.xxl },
  menuItem: { marginBottom: spacing.md },
  footer: { textAlign: 'center', color: colors.textFaint, marginTop: 'auto' },
});
