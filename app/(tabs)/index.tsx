// Home tab (Round 10 U5): a VERTICAL, page-filling Duolingo-hard hub. Top to
// bottom: a slim identity row (logo + wordmark, Players Online chip), a
// flex-filled hero region (hero art, with the stat tiles docked to its
// bottom edge once the player has a game on record) that soaks up whatever
// vertical space is left over, a stacked column of full-width chunky
// actions (PLAY biggest, then QUICK MATCH, then PRIVATE), and a chunky HOW
// TO PLAY row. The hero region uses flex:1 (not a window-height gate) so the
// page is exactly full at any portrait size, phone or tablet, with no
// scroll and no dead space.
//
// PLAY reads the saved bot difficulty (lib/settingsRules.ts botLevel): the
// first-ever tap swaps the PLAY slot inline to an EASY | NORMAL | EXPERT
// picker (no navigation, no new route -- decideOnPlay in settingsRules.ts is
// the pure decision behind this); picking saves it and starts the game.
// Every later tap starts instantly with the saved level. QUICK MATCH and
// PRIVATE stay put below the PLAY slot the whole time.
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
import { Button, Card, FeltHero, IconTile, ScreenContainer } from '../../components/ui';
import { colors, radii, spacing, typography } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { getLocalGuestName } from '../../lib/guest';
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

export default function Home() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { session, isAnonymous, profile } = useAuth();
  const { count: onlineCount } = usePresence();

  const contentWidth = Math.min(width - spacing.lg * 2, MAX_CONTENT_WIDTH);

  // Identity caption (Round 10 fix): the home redesign moved the "Playing as X"
  // line to Profile, but a guest still deserves to see the random username they
  // are playing under. Signed-in users show their display name; a guest shows
  // the on-device generated name (getLocalGuestName). Tapping opens Profile.
  const [guestName, setGuestName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getLocalGuestName().then((n) => {
      if (!cancelled) setGuestName(n);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const identityName = profile?.displayName ?? guestName;

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

        <FeltHero style={styles.heroWrap}>
          <Image
            source={HERO_IMG}
            style={styles.hero}
            resizeMode="cover"
            accessibilityLabel="Prends table art"
          />
          {identityName ? (
            <Pressable
              onPress={() => router.push('/profile')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Playing as ${identityName}. Open profile.`}
              style={styles.identityStrip}
            >
              <Text style={styles.identityText} numberOfLines={1}>
                Playing as <Text style={styles.identityName}>{identityName}</Text>
              </Text>
            </Pressable>
          ) : null}
        </FeltHero>

        {tiles?.visible ? (
          <View style={styles.statRow}>
            <StatTile emoji="🎮" tint={colors.skyBlue} value={tiles.gamesLabel} label="Games played" />
            <StatTile emoji="⏱️" tint={colors.gold} value={tiles.bestTimeLabel} label="Best win time" />
          </View>
        ) : null}

        <View style={styles.actionsStack}>
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
              <View style={styles.pickerRow}>
                {DIFFICULTY_OPTIONS.map((option) => (
                  <Button
                    key={option.level}
                    title={option.label}
                    variant="primary"
                    color={option.color}
                    onPress={() => onPickDifficulty(option.level)}
                    style={styles.pickerBtn}
                    textStyle={styles.pickerBtnText}
                  />
                ))}
              </View>
            </View>
          ) : (
            <Button title="Play" variant="primary" size="big" onPress={onPressPlay} style={styles.fullWidthBtn} />
          )}
          <Button
            title="Quick match"
            variant="secondary"
            color={colors.skyBlue}
            onPress={() => router.push('/matchmaking')}
            style={styles.fullWidthBtn}
          />
          <Button
            title="Private"
            variant="secondary"
            onPress={() => router.push('/play-online')}
            style={styles.fullWidthBtn}
          />
        </View>

        <Button
          title="How to play"
          variant="secondary"
          onPress={() => router.push('/how-to-play')}
          style={styles.howToPlayBtn}
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

// One Duolingo-style colored stat tile: a tinted emoji chip alongside a bold
// numeral + a tiny caption, in a bordered white card so the two tiles read as
// a distinct row of chips between the hero and the actions.
function StatTile({ emoji, tint, value, label }: { emoji: string; tint: string; value: string; label: string }) {
  return (
    <View style={styles.statTile}>
      <IconTile emoji={emoji} tint={tint} size={34} />
      <View style={styles.statTextGroup}>
        <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
        <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
      </View>
    </View>
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
  // Identity caption is now a gold-on-felt strip docked to the bottom of the
  // hero block (part of the designed header ensemble), not a separate row.
  identityStrip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.felt,
  },
  identityText: { ...typography.caption, color: colors.textOnFeltMuted },
  identityName: { ...typography.caption, color: colors.gold, fontWeight: '800' },
  // Round 10 U5: the hero region is flex:1 (not a window-height gate) so it
  // soaks up exactly whatever vertical space the fixed rows above/below
  // leave behind -- the page is always exactly full, at 360x570 through
  // 412x915, with no scroll and no dead space. minHeight:0 lets it shrink
  // all the way down on the shortest viewports instead of forcing overflow.
  heroWrap: { flex: 1, minHeight: 0, marginBottom: spacing.sm },
  hero: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    backgroundColor: colors.felt,
  },
  statRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  statTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: colors.creamEdge,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  statTextGroup: { flex: 1, minWidth: 0 },
  statValue: { ...typography.subheading, color: colors.felt },
  statLabel: { ...typography.tiny, color: colors.textMuted },
  // Vertical stack of full-width chunky actions (Round 10 U5): PLAY is the
  // hero (size="big"), then QUICK MATCH, then PRIVATE, each its own
  // full-width row rather than a cramped equal-thirds row.
  actionsStack: { gap: spacing.sm, marginBottom: spacing.sm },
  fullWidthBtn: { width: '100%' },
  pickerBlock: { gap: spacing.xs },
  pickerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerCaption: { ...typography.caption, color: colors.textMuted },
  pickerBack: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  pickerBackText: { ...typography.bodyBold, color: colors.textMuted },
  // Three-segment EASY | NORMAL | EXPERT row inside the PLAY slot -- same
  // slot, so picking a difficulty never reflows Quick match / Private below.
  pickerRow: { flexDirection: 'row', gap: spacing.sm },
  pickerBtn: { flex: 1, minHeight: 64, paddingHorizontal: spacing.xs, paddingVertical: spacing.sm },
  pickerBtnText: { fontSize: 14, letterSpacing: 0 },
  // Chunky secondary row, not a bare underlined link (Round 10 U5).
  howToPlayBtn: { width: '100%' },
  consentCard: { marginTop: spacing.md, gap: spacing.sm },
  consentText: { ...typography.bodyBold, color: colors.textPrimary },
  consentRow: { flexDirection: 'row', gap: spacing.sm },
  consentBtn: { flex: 1 },
});
