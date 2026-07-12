// Home tab (U4): compact Duolingo-style hub that fits 360x640 alongside the
// 60px tab bar (R7) -- top to bottom: a slim identity row (logo + wordmark,
// Players Online chip), an optional hero strip on tall screens only, stat
// tiles (hidden until the player has played a game), a giant PLAY button,
// QUICK MATCH, and a compact PLAY WITH FRIENDS / HOW TO PLAY row.
//
// The guest "Playing as X" line + sign-in nudge that used to live here moved
// to the Profile tab (U3) -- that is now the one place identity/settings
// links live. The post-sign-in consent prompt (Round 6 U3) stays: it is rare
// and dismissible, and is allowed to exceed the viewport on the odd render
// where it shows.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { PresenceChip } from '../../components/PresenceChip';
import { Button, Card, ScreenContainer } from '../../components/ui';
import { colors, radii, spacing, typography } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { apiUrl, authClient } from '../../lib/authClient';
import { usePresence } from '../../lib/presence';
import { loadStats } from '../../lib/stats';
import { resolveHomeStatTiles, type HomeStatTiles } from '../../lib/homeStats';

const LOGO_IMG = require('../../assets/art/logo.png');
const HERO_IMG = require('../../assets/art/hero.png');

// Content is centered and capped at this width so the hub doesn't stretch to
// absurd sizes on a wide desktop browser.
const MAX_CONTENT_WIDTH = 480;
const LOGO_SIZE = 44;
const HERO_HEIGHT = 120;
// Below this window height there is no room for the hero strip alongside
// the identity row, stat tiles, and all four action buttons without
// scrolling (R7) -- the hero is the first thing to go on a short viewport.
const HERO_MIN_WINDOW_HEIGHT = 700;

export default function Home() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const { session, isAnonymous } = useAuth();
  const { count: onlineCount } = usePresence();

  const contentWidth = Math.min(width - spacing.lg * 2, MAX_CONTENT_WIDTH);
  const showHero = height >= HERO_MIN_WINDOW_HEIGHT;

  // Local bot-game stat tiles (R11), reloaded on every focus rather than
  // only on mount: the bottom tab bar (U3) keeps this screen mounted when
  // the player switches tabs, so a mount-only load would go stale the first
  // time they finish a game and come back to Home.
  const [tiles, setTiles] = useState<HomeStatTiles | null>(null);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void loadStats().then((s) => {
        if (!cancelled) setTiles(resolveHomeStatTiles(s));
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

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
      const { data } = await authClient.$fetch<{ consent: unknown | null }>(apiUrl('/api/consent'));
      if (data && data.consent === null) setShowConsentPrompt(true);
    })();
  }, [session, isAnonymous]);

  async function answerConsentPrompt(optIn: boolean) {
    setShowConsentPrompt(false);
    void authClient.$fetch(apiUrl('/api/consent'), { method: 'POST', body: { optIn, source: 'prompt' } });
  }

  return (
    <ScreenContainer>
      <View style={[styles.content, { width: contentWidth }]}>
        <View style={styles.headerRow}>
          <View style={styles.brandGroup}>
            <Image
              source={LOGO_IMG}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="Prends logo"
            />
            <Text style={styles.wordmark}>Prends</Text>
          </View>
          <PresenceChip count={onlineCount} />
        </View>

        {showHero ? (
          <Image
            source={HERO_IMG}
            style={styles.hero}
            resizeMode="cover"
            accessibilityLabel="Prends table art"
          />
        ) : null}

        {tiles?.visible ? (
          <View style={styles.statRow}>
            <StatTile value={tiles.gamesLabel} label="Games played" />
            <StatTile value={tiles.bestTimeLabel} label="Best win time" />
          </View>
        ) : null}

        <Button
          title="Play"
          subtitle="Jump into a game vs smart bots"
          variant="primary"
          align="left"
          onPress={() => router.push('/bot-select')}
          style={styles.playBtn}
        />

        <Button
          title="Quick match"
          subtitle="Play against people online"
          variant="secondary"
          align="left"
          onPress={() => router.push('/matchmaking')}
          style={styles.menuItem}
        />

        <View style={styles.compactRow}>
          <Button
            title="Play with friends"
            variant="secondary"
            onPress={() => router.push('/play-online')}
            style={styles.compactBtn}
          />
          <Button
            title="How to play"
            variant="secondary"
            onPress={() => router.push('/how-to-play')}
            style={styles.compactBtn}
          />
        </View>

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

// One Duolingo-style stat tile: a bold numeral over a small caption label,
// in a Card so the two tiles read as a distinct row.
function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <Card style={styles.statTile}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { alignSelf: 'center', flex: 1 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  brandGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE },
  wordmark: { ...typography.subheading, color: colors.felt },
  hero: {
    width: '100%',
    height: HERO_HEIGHT,
    borderRadius: radii.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.felt,
  },
  statRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  statTile: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm },
  statValue: { ...typography.heading, color: colors.felt },
  statLabel: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  playBtn: { minHeight: 64, marginBottom: spacing.sm },
  menuItem: { marginBottom: spacing.sm },
  compactRow: { flexDirection: 'row', gap: spacing.sm },
  compactBtn: { flex: 1 },
  consentCard: { marginTop: spacing.md, gap: spacing.sm },
  consentText: { ...typography.bodyBold, color: colors.textPrimary },
  consentRow: { flexDirection: 'row', gap: spacing.sm },
  consentBtn: { flex: 1 },
});
