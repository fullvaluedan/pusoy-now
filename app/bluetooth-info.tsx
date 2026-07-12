// Bluetooth mode: a polished "coming soon" screen. Local pass-and-play over
// Bluetooth needs a native dev build and a native P2P module, so it is its own
// track (see docs/plans). This screen sets that expectation cleanly rather than
// pretending the mode exists.
import { useRouter } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';
import { CompactHeader, Button, Card, ScreenContainer } from '../components/ui';
import { colors, spacing, typography } from '../lib/theme';

const EMPTY_IMG = require('../assets/art/empty-state.png');

export default function BluetoothInfo() {
  const router = useRouter();
  return (
    <ScreenContainer scroll>
      <CompactHeader title="Bluetooth multiplayer" onBack={() => router.replace("/")} />
      <View style={styles.hero}>
        <Image source={EMPTY_IMG} style={styles.heroImg} resizeMode="contain" />
        <View style={styles.badge}>
          <Text style={styles.badgeText}>COMING SOON</Text>
        </View>
      </View>
      <Text style={styles.title}>Bluetooth multiplayer</Text>
      <Text style={styles.subtitle}>
        Play with people right next to you, no internet needed. Built for flights, commutes, and the back seat.
      </Text>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Why it is not here yet</Text>
        <Text style={styles.body}>
          Nearby-device play needs a native build of the app and a device-to-device connection layer that the standard managed app cannot run. It is on the roadmap as its own release once online play lands.
        </Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Play now</Text>
        <Text style={styles.body}>
          The full game is ready against bots, with easy, normal, and expert opponents. Online multiplayer and the leaderboard are coming next.
        </Text>
      </Card>

      <Button title="Play vs bots" variant="primary" onPress={() => router.replace('/')} style={styles.action} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginBottom: spacing.md },
  heroImg: { width: 200, height: 200 },
  badge: {
    marginTop: -spacing.sm,
    backgroundColor: colors.gold,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: { color: colors.felt, fontWeight: '800', fontSize: typography.tiny.fontSize, letterSpacing: 1 },
  title: { ...typography.heading, color: colors.felt, textAlign: 'center' },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  card: { marginBottom: spacing.md },
  cardTitle: { ...typography.bodyBold, color: colors.felt, marginBottom: spacing.xs },
  body: { ...typography.body, color: colors.textBody, lineHeight: 20 },
  action: { marginTop: spacing.sm },
});
