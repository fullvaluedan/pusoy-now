// Home tab (Round 9 U2): compact Duolingo-style hub that fits 360x640
// alongside the 60px tab bar (R7) -- top to bottom: a slim identity row
// (logo + wordmark, Players Online chip), an optional hero strip on tall
// screens only, stat tiles (hidden until the player has played a game), the
// one-line PLAY | QUICK MATCH | PRIVATE action row, and a slim HOW TO PLAY
// chip.
//
// PLAY reads the saved bot difficulty (lib/settingsRules.ts botLevel): the
// first-ever tap swaps the action row inline to an EASY | NORMAL | EXPERT
// picker (no navigation, no new route -- decideOnPlay in settingsRules.ts is
// the pure decision behind this); picking saves it and starts the game.
// Every later tap starts instantly with the saved level.
//
// The guest "Playing as X" line + sign-in nudge that used to live here moved
// to the Profile tab (U3) -- that is now the one place identity/settings
// links live. The post-sign-in consent prompt (Round 6 U3) stays: it is rare
// and dismissible, and is allowed to exceed the viewport on the odd render
// where it shows.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { PresenceChip } from '../../components/PresenceChip';
import { Button, Card, ScreenContainer } from '../../components/ui';
import { colors, radii, spacing, typography } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { apiUrl, authClient } from '../../lib/authClient';
import { usePresence } from '../../lib/presence';
import { loadStats } from '../../lib/stats';
import { resolveHomeStatTiles, type HomeStatTiles } from '../../lib/homeStats';
import { loadSettings, saveSettings } from '../../lib/settings';
import { decideOnPlay } from '../../lib/settingsRules';
import type { BotLevel } from '../../lib/pusoy/types';

const DIFFICULTY_OPTIONS: { level: BotLevel; label: string; color: string }[] = [
  { level: 'easy', label: 'Easy', color: colors.successBright },
  { level: 'normal', label: 'Normal', color: colors.felt },
  { level: 'expert', label: 'Expert', color: colors.dangerBright },
];

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

  // Saved bot difficulty (Round 9 U2), reloaded on every focus so a change
  // made on the Settings screen is picked up the next time Home is shown --
  // same pattern as the stat tiles above.
  const [botLevel, setBotLevel] = useState<BotLevel | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void loadSettings().then((s) => {
        if (!cancelled) setBotLevel(s.botLevel);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  function startBotGame(level: BotLevel) {
    router.push(`/game-local?bots=3&level=${level}`);
  }

  function onPressPlay() {
    if (decideOnPlay(botLevel) === 'pick') {
      setPickerOpen(true);
      return;
    }
    startBotGame(botLevel as BotLevel);
  }

  function onPickDifficulty(level: BotLevel) {
    setPickerOpen(false);
    setBotLevel(level);
    void loadSettings().then((s) => void saveSettings({ ...s, botLevel: level }));
    startBotGame(level);
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

        {pickerOpen ? (
          <View style={styles.pickerBlock}>
            <View style={styles.pickerHeaderRow}>
              <Text style={styles.pickerCaption}>Pick your difficulty</Text>
              <Pressable
                onPress={() => setPickerOpen(false)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Back"
                style={styles.pickerBack}
              >
                <Text style={styles.pickerBackText}>x</Text>
              </Pressable>
            </View>
            <View style={styles.actionRow}>
              {DIFFICULTY_OPTIONS.map((option) => (
                <Button
                  key={option.level}
                  title={option.label}
                  variant="primary"
                  color={option.color}
                  onPress={() => onPickDifficulty(option.level)}
                  style={styles.actionBtn}
                  textStyle={styles.actionBtnText}
                />
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.actionRow}>
            <Button title="Play" variant="primary" onPress={onPressPlay} style={styles.actionBtn} textStyle={styles.actionBtnText} />
            <Button
              title="Quick match"
              variant="secondary"
              color={colors.skyBlue}
              onPress={() => router.push('/matchmaking')}
              style={styles.actionBtn}
              textStyle={styles.actionBtnText}
            />
            <Button
              title="Private"
              variant="secondary"
              onPress={() => router.push('/play-online')}
              style={styles.actionBtn}
              textStyle={styles.actionBtnText}
            />
          </View>
        )}

        <Pressable
          onPress={() => router.push('/how-to-play')}
          style={styles.howToPlayChip}
          accessibilityRole="button"
        >
          <Text style={styles.howToPlayText}>How to play</Text>
        </Pressable>

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
  // One-line PLAY | QUICK MATCH | PRIVATE action row (Round 9 U2) -- three
  // equal buttons, no subtitles, tight padding so all three labels fit on
  // one line down to 360px. The EASY | NORMAL | EXPERT picker reuses this
  // exact row geometry so swapping in/out never reflows anything below it.
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  actionBtn: { flex: 1, minHeight: 56, paddingHorizontal: spacing.xs, paddingVertical: spacing.sm },
  // Down a notch from the shared Button 16px + letterSpacing 0.5 caps style
  // so the longest label (QUICK MATCH) fits on one line in an equal-thirds
  // slot at 360px width, per the R1 one-line guarantee.
  actionBtnText: { fontSize: 13, letterSpacing: 0 },
  pickerBlock: { marginBottom: spacing.sm },
  pickerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  pickerCaption: { ...typography.caption, color: colors.textMuted },
  pickerBack: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  pickerBackText: { ...typography.bodyBold, color: colors.textMuted },
  howToPlayChip: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  howToPlayText: { ...typography.label, color: colors.felt, fontWeight: '600', textDecorationLine: 'underline' },
  consentCard: { marginTop: spacing.md, gap: spacing.sm },
  consentText: { ...typography.bodyBold, color: colors.textPrimary },
  consentRow: { flexDirection: 'row', gap: spacing.sm },
  consentBtn: { flex: 1 },
});
