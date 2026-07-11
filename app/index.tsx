// Home: mode picker. For the vertical slice we have:
//   - Play vs Bots (no account needed, runs locally)
//   - Sign in to play online (links to sign-in screen)
//
// Online lobby creation/joining and Bluetooth are stubs that show a "coming
// soon" toast and link to the relevant doc page.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Avatar } from '../components/Avatar';
import { Button, Card, ScreenContainer } from '../components/ui';
import { colors, radii, spacing, typography } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { authClient } from '../lib/authClient';
import { getLocalGuestName } from '../lib/guest';

const LOGO_IMG = require('../assets/art/logo.png');
const HERO_IMG = require('../assets/art/hero.png');

// Content is centered and capped at this width so the hero/logo don't
// stretch to absurd sizes on a wide desktop browser.
const MAX_CONTENT_WIDTH = 480;
// hero.png is 1536x1024 (3:2 landscape).
const HERO_ASPECT_RATIO = 1536 / 1024;

export default function Home() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { session, profile, isAnonymous } = useAuth();

  const contentWidth = Math.min(width - spacing.lg * 2, MAX_CONTENT_WIDTH);
  const heroHeight = contentWidth / HERO_ASPECT_RATIO;

  // The locally-generated guest name (R1), shown immediately -- it exists
  // before any server session does, so it renders for both a fresh guest and
  // one who has already gone anonymous server-side.
  const [guestName, setGuestName] = useState<string | null>(null);
  useEffect(() => {
    void getLocalGuestName().then(setGuestName);
  }, []);

  // One-time post-sign-in consent prompt (Round 6 U3): social-login users
  // never see the signup checkbox, so on the first authenticated home render
  // check whether they have a consent row at all. checkedRef guards this to
  // once per signed-in session (and resets on sign-out) so it never re-fires
  // on every render, and either answer POSTs a row so the prompt never
  // repeats for this account. Anonymous sessions never see this at all (R5):
  // a guest has not agreed to anything yet, so there is nothing to ask.
  const [showConsentPrompt, setShowConsentPrompt] = useState(false);
  const checkedConsentRef = useRef(false);

  useEffect(() => {
    if (!session || isAnonymous) {
      checkedConsentRef.current = false;
      setShowConsentPrompt(false);
      return;
    }
    if (checkedConsentRef.current) return;
    checkedConsentRef.current = true;
    (async () => {
      const { data } = await authClient.$fetch<{ consent: unknown | null }>('/api/consent');
      if (data && data.consent === null) setShowConsentPrompt(true);
    })();
  }, [session, isAnonymous]);

  async function answerConsentPrompt(optIn: boolean) {
    setShowConsentPrompt(false);
    void authClient.$fetch('/api/consent', { method: 'POST', body: { optIn, source: 'prompt' } });
  }

  return (
    <ScreenContainer scroll>
      <View style={[styles.content, { width: contentWidth }]}>
        <Image
          source={LOGO_IMG}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Prends logo"
        />
        <Text style={styles.subtitle}>4-player Filipino card game</Text>

        <Image
          source={HERO_IMG}
          style={[styles.hero, { width: contentWidth, height: heroHeight }]}
          resizeMode="cover"
          accessibilityLabel="Prends table art"
        />

        <Button
          title="Play vs Bots"
          subtitle="No account required"
          variant="primary"
          align="left"
          onPress={() => router.push('/bot-select')}
          style={styles.menuItem}
        />

        <Button
          title="Play online"
          subtitle="Host a room and invite friends"
          variant="secondary"
          align="left"
          onPress={() => router.push('/play-online')}
          style={styles.menuItem}
        />

        {/* Compact nav row */}
        <View style={styles.navRow}>
          <Pressable
            style={styles.navBtn}
            onPress={() => router.push('/bot-select')}
          >
            <Text style={styles.navBtnText}>Play</Text>
          </Pressable>
          <Pressable
            style={styles.navBtn}
            onPress={() => router.push('/stats')}
          >
            <Text style={styles.navBtnText}>Scoreboard</Text>
          </Pressable>
          <Pressable
            style={styles.navBtn}
            onPress={() => router.push('/settings')}
          >
            <Text style={styles.navBtnText}>Settings</Text>
          </Pressable>
        </View>

        <SignInEntry
          signedIn={Boolean(session) && !isAnonymous}
          guestName={guestName}
          displayName={profile?.displayName}
          avatarUrl={profile?.avatarUrl}
          onPress={() => router.push('/sign-in')}
        />

        {showConsentPrompt ? (
          <Card style={styles.consentCard}>
            <Text style={styles.consentText}>Want game updates by email?</Text>
            <View style={styles.consentRow}>
              <Button
                title="No thanks"
                variant="ghost"
                onPress={() => void answerConsentPrompt(false)}
                style={styles.consentBtn}
              />
              <Button title="Yes" variant="secondary" onPress={() => void answerConsentPrompt(true)} style={styles.consentBtn} />
            </View>
          </Card>
        ) : null}

        <Button
          title="Friends"
          subtitle="Add friends and see the ranking"
          variant="ghost"
          align="left"
          onPress={() => router.push('/friends')}
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
      </View>
    </ScreenContainer>
  );
}

// Secondary sign-in entry. A guest (no session, or an anonymous one) sees
// their local random name plus a button to save progress under a real
// account; signed-in players get a chip carrying their avatar and display
// name.
function SignInEntry({
  signedIn,
  guestName,
  displayName,
  avatarUrl,
  onPress,
}: {
  signedIn: boolean;
  guestName?: string | null;
  displayName?: string;
  avatarUrl?: string | null;
  onPress: () => void;
}) {
  if (!signedIn) {
    return (
      <>
        {guestName ? <Text style={styles.guestLine}>Playing as {guestName}</Text> : null}
        <Button
          title="Sign in to save your progress"
          variant="secondary"
          align="left"
          onPress={onPress}
          style={styles.menuItem}
        />
      </>
    );
  }

  return (
    <Pressable style={[styles.chip, styles.menuItem]} onPress={onPress}>
      <Avatar
        name={displayName ?? 'Player'}
        url={avatarUrl}
        size={40}
      />
      <View style={styles.chipTextGroup}>
        <Text style={styles.chipTitle}>Signed in</Text>
        <Text style={styles.chipSubtitle} numberOfLines={1}>{displayName}</Text>
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
  guestLine: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
  consentCard: { marginBottom: spacing.md, gap: spacing.sm },
  consentText: { ...typography.bodyBold, color: colors.textPrimary },
  consentRow: { flexDirection: 'row', gap: spacing.sm },
  consentBtn: { flex: 1 },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  navBtn: {
    flex: 1,
    backgroundColor: colors.felt,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnText: {
    ...typography.label,
    color: colors.textOnFelt,
    fontWeight: '700',
  },
  footer: { textAlign: 'center', color: colors.textFaint, marginTop: spacing.lg },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.feltLight,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  chipTextGroup: { flex: 1 },
  chipTitle: { color: colors.textOnFelt, fontSize: typography.bodyBold.fontSize, fontWeight: typography.bodyBold.fontWeight },
  chipSubtitle: { color: colors.textOnFeltMuted, fontSize: typography.caption.fontSize, marginTop: 2 },
});
