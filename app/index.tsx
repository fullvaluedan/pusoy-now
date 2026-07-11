// Home: single clear hierarchy (Round 7 U6).
//   - Header row: small logo left, Players Online chip top-right.
//   - Hero art, title + subtitle.
//   - One primary CTA (Play vs bots), two secondary CTAs (Play online, How to
//     play), then a quiet ghost-button list for the rest.
//   - Identity line at the bottom: guest name + sign-in nudge, or the
//     signed-in avatar chip.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Avatar } from '../components/Avatar';
import { PresenceChip } from '../components/PresenceChip';
import { Button, Card, ScreenContainer } from '../components/ui';
import { colors, radii, spacing, typography } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { authClient } from '../lib/authClient';
import { usePresence } from '../lib/presence';
import { getLocalGuestName } from '../lib/guest';

const LOGO_IMG = require('../assets/art/logo.png');
const HERO_IMG = require('../assets/art/hero.png');

// Content is centered and capped at this width so the hero/logo don't
// stretch to absurd sizes on a wide desktop browser.
const MAX_CONTENT_WIDTH = 480;
// hero.png is 1536x1024 (3:2 landscape).
const HERO_ASPECT_RATIO = 1536 / 1024;
const LOGO_SIZE = 72;

export default function Home() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { session, profile, isAnonymous } = useAuth();
  const { count: onlineCount } = usePresence();

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

  const signedIn = Boolean(session) && !isAnonymous;

  return (
    <ScreenContainer scroll>
      <View style={[styles.content, { width: contentWidth }]}>
        <View style={styles.headerRow}>
          <Image
            source={LOGO_IMG}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Prends logo"
          />
          <PresenceChip count={onlineCount} />
        </View>

        <Image
          source={HERO_IMG}
          style={[styles.hero, { width: contentWidth, height: heroHeight }]}
          resizeMode="cover"
          accessibilityLabel="Prends table art"
        />

        <Text style={styles.title}>Prends</Text>
        <Text style={styles.subtitle}>Pusoy Dos - the Filipino climbing card game</Text>

        <Button
          title="Play"
          subtitle="Jump into a game vs smart bots"
          variant="primary"
          align="left"
          onPress={() => router.push('/bot-select')}
          style={styles.menuItem}
        />

        <Button
          title="Play online"
          subtitle="Quick match or invite friends"
          variant="secondary"
          align="left"
          onPress={() => router.push('/play-online')}
          style={styles.menuItem}
        />

        <Button
          title="How to play"
          variant="secondary"
          align="left"
          onPress={() => router.push('/how-to-play')}
          style={styles.menuItem}
        />

        <View style={styles.quietSection}>
          <Button
            title="Leaderboard"
            variant="ghost"
            align="left"
            onPress={() => router.push('/friends-rank')}
            style={styles.quietItem}
          />
          <Button
            title="Friends"
            variant="ghost"
            align="left"
            onPress={() => router.push('/friends')}
            style={styles.quietItem}
          />
          <Button
            title="Scoreboard"
            variant="ghost"
            align="left"
            onPress={() => router.push('/stats')}
            style={styles.quietItem}
          />
          <Button
            title="Settings"
            variant="ghost"
            align="left"
            onPress={() => router.push('/settings')}
            style={styles.quietItem}
          />
        </View>

        <IdentityLine
          signedIn={signedIn}
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
      </View>
    </ScreenContainer>
  );
}

// Bottom identity line. A guest (no session, or an anonymous one) sees their
// local random name plus a button to save progress under a real account;
// signed-in players get a Card row carrying their avatar and display name.
function IdentityLine({
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
      <View style={styles.identityWrap}>
        {guestName ? <Text style={styles.guestLine}>Playing as {guestName}</Text> : null}
        <Button title="Sign in to save your progress" variant="ghost" align="left" onPress={onPress} />
      </View>
    );
  }

  return (
    <Pressable onPress={onPress} style={styles.identityWrap}>
      <Card style={styles.identityCard}>
        <Avatar name={displayName ?? 'Player'} url={avatarUrl} size={40} />
        <View style={styles.identityTextGroup}>
          <Text style={styles.identityTitle}>Signed in</Text>
          <Text style={styles.identitySubtitle} numberOfLines={1}>{displayName}</Text>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { alignSelf: 'center', flex: 1 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE },
  hero: {
    borderRadius: radii.lg,
    marginBottom: spacing.lg,
    backgroundColor: colors.felt,
  },
  title: { ...typography.title, color: colors.textPrimary, textAlign: 'center' },
  subtitle: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.lg },
  menuItem: { marginBottom: spacing.md },
  quietSection: { marginBottom: spacing.md },
  quietItem: { marginBottom: spacing.xs },
  identityWrap: { marginBottom: spacing.md },
  guestLine: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
  consentCard: { marginBottom: spacing.md, gap: spacing.sm },
  consentText: { ...typography.bodyBold, color: colors.textPrimary },
  consentRow: { flexDirection: 'row', gap: spacing.sm },
  consentBtn: { flex: 1 },
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  identityTextGroup: { flex: 1 },
  identityTitle: { ...typography.bodyBold, color: colors.textPrimary },
  identitySubtitle: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
});
