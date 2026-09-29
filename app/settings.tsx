// Settings screen: toggles for sound/haptics, the saved bot Difficulty
// (Round 9 U2 -- also settable inline from Home's first-ever PLAY tap),
// navigation to account/legal, version footer.
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { CompactHeader, Card, ListRow, ScreenContainer } from '../components/ui';
import { useAuth } from '../lib/auth';
import { apiUrl, authClient } from '../lib/authClient';
import { colors, radii, spacing, typography } from '../lib/theme';
import { AppSettings, DEFAULT_SETTINGS, loadSettings, saveSettings } from '../lib/settings';
import type { BotLevel } from '../lib/pusoy/types';

const DIFFICULTY_OPTIONS: { level: BotLevel; label: string }[] = [
  { level: 'easy', label: 'Easy' },
  { level: 'normal', label: 'Normal' },
  { level: 'expert', label: 'Expert' },
];

export default function Settings() {
  const router = useRouter();
  const { session, isAnonymous } = useAuth();
  // Marketing-email opt-in only makes sense for a real (non-guest) account with
  // an email; guests never see this toggle.
  const signedInReal = Boolean(session) && !isAnonymous;
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [emailOptIn, setEmailOptIn] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load settings on mount
  useEffect(() => {
    let active = true;
    void loadSettings().then((s) => {
      if (active) {
        setSettings(s);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const handleSoundToggle = useCallback(
    (value: boolean) => {
      const updated = { ...settings, sound: value };
      setSettings(updated);
      void saveSettings(updated);
    },
    [settings],
  );

  const handleHapticsToggle = useCallback(
    (value: boolean) => {
      const updated = { ...settings, haptics: value };
      setSettings(updated);
      void saveSettings(updated);
    },
    [settings],
  );

  const handleDifficultyPick = useCallback(
    (level: BotLevel) => {
      const updated = { ...settings, botLevel: level };
      setSettings(updated);
      void saveSettings(updated);
    },
    [settings],
  );

  // Load the saved marketing-email choice for a real account. Defaults to off
  // (a pre-ticked opt-in is not lawful consent); GET returns null until the
  // user has ever chosen, in which case it stays off.
  useEffect(() => {
    if (!signedInReal) return;
    let active = true;
    void (async () => {
      try {
        const { data } = await authClient.$fetch<{ consent: { optIn?: boolean } | null }>(apiUrl('/api/consent'));
        if (active && data?.consent) setEmailOptIn(Boolean(data.consent.optIn));
      } catch {
        // leave the default (off)
      }
    })();
    return () => {
      active = false;
    };
  }, [signedInReal]);

  const handleEmailOptInToggle = useCallback((value: boolean) => {
    setEmailOptIn(value);
    void authClient.$fetch(apiUrl('/api/consent'), { method: 'POST', body: { optIn: value, source: 'settings' } });
  }, []);

  if (loading) {
    return (
      <ScreenContainer>
        <ActivityIndicator size="large" color={colors.felt} />
      </ScreenContainer>
    );
  }

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <ScreenContainer scroll>
      <CompactHeader title="Settings" />

      {/* Sound & Haptics group */}
      <Text style={styles.groupHeading}>Sound & Haptics</Text>
      <ListRow
        label="Sound"
        leading={<Text style={styles.rowEmoji}>🔊</Text>}
        onPress={() => handleSoundToggle(!settings.sound)}
        trailing={
          <Switch
            value={settings.sound}
            onValueChange={handleSoundToggle}
            trackColor={{ false: colors.textMuted, true: colors.felt }}
            thumbColor={colors.white}
          />
        }
      />
      <ListRow
        label="Haptics"
        leading={<Text style={styles.rowEmoji}>📳</Text>}
        onPress={() => handleHapticsToggle(!settings.haptics)}
        trailing={
          <Switch
            value={settings.haptics}
            onValueChange={handleHapticsToggle}
            trackColor={{ false: colors.textMuted, true: colors.felt }}
            thumbColor={colors.white}
          />
        }
      />

      {/* Game group: saved bot difficulty (Round 9 U2) */}
      <Text style={[styles.groupHeading, styles.groupHeadingSpaced]}>Game</Text>
      <Card style={styles.difficultyCard}>
        <Text style={styles.rowLabel}>Difficulty</Text>
        <View style={styles.difficultyRow}>
          {DIFFICULTY_OPTIONS.map((option) => {
            const selected = settings.botLevel === option.level;
            return (
              <Pressable
                key={option.level}
                onPress={() => handleDifficultyPick(option.level)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={[styles.difficultyOption, selected ? styles.difficultyOptionSelected : styles.difficultyOptionUnselected]}
              >
                <Text style={[styles.difficultyOptionText, selected && styles.difficultyOptionTextSelected]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* Notifications group: the marketing-email opt-in lives here (moved out
          of the sign-up flow and the home hub). Real accounts only. */}
      {signedInReal ? (
        <>
          <Text style={[styles.groupHeading, styles.groupHeadingSpaced]}>Notifications</Text>
          <ListRow
            label="Email me game updates"
            leading={<Text style={styles.rowEmoji}>✉️</Text>}
            onPress={() => handleEmailOptInToggle(!emailOptIn)}
            trailing={
              <Switch
                value={emailOptIn}
                onValueChange={handleEmailOptInToggle}
                trackColor={{ false: colors.textMuted, true: colors.felt }}
                thumbColor={colors.white}
              />
            }
          />
        </>
      ) : null}

      {/* Account group */}
      <Text style={[styles.groupHeading, styles.groupHeadingSpaced]}>Account</Text>
      <ListRow label="Profile" leading={<Text style={styles.rowEmoji}>👤</Text>} chevron onPress={() => router.push('/account')} />
      <ListRow
        label="Delete account"
        leading={<Text style={styles.rowEmoji}>🗑️</Text>}
        tone="danger"
        chevron
        onPress={() => router.push('/delete-account')}
      />

      {/* Legal group */}
      <Text style={[styles.groupHeading, styles.groupHeadingSpaced]}>Legal</Text>
      <ListRow label="Privacy Policy" leading={<Text style={styles.rowEmoji}>📜</Text>} chevron onPress={() => router.push('/privacy')} />
      <ListRow label="Terms of Service" leading={<Text style={styles.rowEmoji}>📄</Text>} chevron onPress={() => router.push('/terms')} />

      {/* Version footer */}
      <Text style={styles.version}>Prends v{appVersion}</Text>

    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  // Bold uppercase section label, Duolingo-style, above each stack of rows.
  groupHeading: {
    ...typography.label,
    color: colors.felt,
    marginBottom: spacing.sm,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  groupHeadingSpaced: { marginTop: spacing.lg },
  difficultyCard: { marginBottom: spacing.sm },
  difficultyRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  // Chunky chip: 2px resting border + a darker 4px bottom edge, same 3D
  // language as ListRow/Button, so the difficulty picker reads as part of
  // the same tactile system as the rows around it.
  difficultyOption: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    alignItems: 'center',
    borderWidth: 2,
    borderBottomWidth: 4,
  },
  difficultyOptionUnselected: { backgroundColor: colors.surface, borderColor: colors.border, borderBottomColor: colors.creamEdge },
  difficultyOptionSelected: { backgroundColor: colors.felt, borderColor: colors.gold, borderBottomColor: colors.goldEdge },
  difficultyOptionText: { ...typography.bodyBold, color: colors.felt },
  difficultyOptionTextSelected: { color: colors.textOnFelt },
  rowLabel: {
    ...typography.bodyBold,
    color: colors.textPrimary,
  },
  rowEmoji: { fontSize: 22 },
  version: {
    ...typography.caption,
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
});
