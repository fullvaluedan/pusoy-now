// Home: mode picker. For the vertical slice we have:
//   - Play vs Bots (no account needed, runs locally)
//   - Sign in to play online (links to sign-in screen)
//
// Online lobby creation/joining and Bluetooth are stubs that show a "coming
// soon" toast and link to the relevant doc page.
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Button, ScreenContainer } from '../components/ui';
import { colors, radii, spacing, typography } from '../lib/theme';

const LOGO_IMG = require('../assets/art/logo.png');
const HERO_IMG = require('../assets/art/hero.png');

// Content is centered and capped at this width so the hero/logo don't
// stretch to absurd sizes on a wide desktop browser.
const MAX_CONTENT_WIDTH = 480;
// hero.png is 1536x1024 (3:2 landscape).
const HERO_ASPECT_RATIO = 1536 / 1024;

// -----------------------------------------------------------------------
// Signed-in chip: presentational only for now. There is no auth yet - U7
// adds lib/auth.tsx with a real AuthProvider/useAuth session. This screen
// deliberately does not import from an auth module (it doesn't exist).
// The `session` state below defaults to the guest shape; U7 will replace
// this useState with `const { session } = useAuth()` and delete
// GUEST_SESSION.
// -----------------------------------------------------------------------
interface SessionChipState {
  signedIn: boolean;
  displayName?: string;
  avatarUrl?: string;
}

const GUEST_SESSION: SessionChipState = { signedIn: false };

export default function Home() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [session] = useState<SessionChipState>(GUEST_SESSION);

  const contentWidth = Math.min(width - spacing.lg * 2, MAX_CONTENT_WIDTH);
  const heroHeight = contentWidth / HERO_ASPECT_RATIO;

  return (
    <ScreenContainer scroll>
      <View style={[styles.content, { width: contentWidth }]}>
        <Image
          source={LOGO_IMG}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Pusoy Now logo"
        />
        <Text style={styles.subtitle}>4-player Filipino card game</Text>

        <Image
          source={HERO_IMG}
          style={[styles.hero, { width: contentWidth, height: heroHeight }]}
          resizeMode="cover"
          accessibilityLabel="Pusoy Now table art"
        />

        <Button
          title="Play vs Bots"
          subtitle="No account required"
          variant="primary"
          align="left"
          onPress={() => router.push('/bot-select')}
          style={styles.menuItem}
        />

        <SignInEntry session={session} onPress={() => router.push('/sign-in')} />

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
      </View>
    </ScreenContainer>
  );
}

// Secondary sign-in entry. Guest state renders the existing plain button;
// signed-in state (not reachable yet, drawn from GUEST_SESSION) renders an
// avatar chip with the player's initial and display name instead.
function SignInEntry({ session, onPress }: { session: SessionChipState; onPress: () => void }) {
  if (!session.signedIn) {
    return (
      <Button
        title="Sign in to play online"
        subtitle="Google, Facebook, TikTok"
        variant="secondary"
        align="left"
        onPress={onPress}
        style={styles.menuItem}
      />
    );
  }

  const initial = (session.displayName ?? '?').trim().charAt(0).toUpperCase();

  return (
    <Pressable style={[styles.chip, styles.menuItem]} onPress={onPress}>
      <View style={styles.chipAvatar}>
        <Text style={styles.chipAvatarText}>{initial}</Text>
      </View>
      <View style={styles.chipTextGroup}>
        <Text style={styles.chipTitle}>Signed in</Text>
        <Text style={styles.chipSubtitle}>{session.displayName}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { alignSelf: 'center', flex: 1 },
  logo: { width: 96, height: 96, alignSelf: 'center', marginTop: spacing.lg },
  subtitle: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.lg },
  hero: {
    borderRadius: radii.lg,
    marginBottom: spacing.xl,
    backgroundColor: colors.felt,
  },
  menuItem: { marginBottom: spacing.md },
  footer: { textAlign: 'center', color: colors.textFaint, marginTop: spacing.lg },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.feltLight,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  chipAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipAvatarText: { ...typography.bodyBold, color: colors.ink },
  chipTextGroup: { flex: 1 },
  chipTitle: { color: colors.textOnFelt, fontSize: typography.bodyBold.fontSize, fontWeight: typography.bodyBold.fontWeight },
  chipSubtitle: { color: colors.textOnFeltMuted, fontSize: typography.caption.fontSize, marginTop: 2 },
});
