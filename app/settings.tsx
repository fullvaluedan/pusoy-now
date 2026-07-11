// Settings screen: toggles for sound/haptics, navigation to account/legal, version footer.
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { Button, Card, ScreenContainer } from '../components/ui';
import { colors, spacing, typography } from '../lib/theme';
import { AppSettings, DEFAULT_SETTINGS, loadSettings, saveSettings } from '../lib/settings';

export default function Settings() {
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
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
      {/* Sound & Haptics group */}
      <Card>
        <Text style={styles.groupHeading}>Sound & Haptics</Text>
        <Row
          label="Sound"
          type="toggle"
          value={settings.sound}
          onToggle={handleSoundToggle}
        />
        <Row
          label="Haptics"
          type="toggle"
          value={settings.haptics}
          onToggle={handleHapticsToggle}
        />
      </Card>

      {/* Account group */}
      <Card style={styles.card}>
        <Text style={styles.groupHeading}>Account</Text>
        <Row
          label="Profile"
          type="nav"
          onPress={() => router.push('/profile')}
        />
        <Row
          label="Delete account"
          type="nav"
          onPress={() => router.push('/delete-account')}
        />
      </Card>

      {/* Legal group */}
      <Card style={styles.card}>
        <Text style={styles.groupHeading}>Legal</Text>
        <Row
          label="Privacy Policy"
          type="nav"
          onPress={() => router.push('/privacy')}
        />
        <Row
          label="Terms of Service"
          type="nav"
          onPress={() => router.push('/terms')}
        />
      </Card>

      {/* Version footer */}
      <Text style={styles.version}>Prends v{appVersion}</Text>

      <Button
        title="Back"
        variant="ghost"
        style={styles.backBtn}
        onPress={() => router.back()}
      />
    </ScreenContainer>
  );
}

// Reusable row component for settings: toggle on the right or nav chevron.
interface RowProps {
  label: string;
  type: 'toggle' | 'nav';
  value?: boolean;
  onToggle?: (value: boolean) => void;
  onPress?: () => void;
}

function Row({ label, type, value, onToggle, onPress }: RowProps) {
  if (type === 'toggle') {
    return (
      <Pressable style={styles.row} onPress={() => onToggle?.(!value)}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Switch
          value={value ?? false}
          onValueChange={onToggle}
          trackColor={{ false: colors.textMuted, true: colors.felt }}
          thumbColor={colors.white}
        />
      </Pressable>
    );
  }

  // type === 'nav'
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.chevron}>&gt;</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  groupHeading: {
    ...typography.label,
    color: colors.felt,
    marginBottom: spacing.md,
    fontWeight: '700',
  },
  card: {
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.overlay,
  },
  rowLabel: {
    ...typography.body,
    color: colors.textPrimary,
  },
  chevron: {
    ...typography.body,
    color: colors.textMuted,
  },
  version: {
    ...typography.caption,
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  backBtn: {
    marginBottom: spacing.lg,
  },
});
