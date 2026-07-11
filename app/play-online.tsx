// Play online: host setup. Pick a seat count and a bot difficulty (used to
// fill any seats nobody joins by start), then create a room and land in its
// lobby. Signed-out visitors get a sign-in prompt instead -- a room needs a
// real account behind the host seat.
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Header, ScreenContainer } from '../components/ui';
import { colors, radii, spacing, typography } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { createRoom, type OnlineBotLevel } from '../lib/rooms';

const SEAT_OPTIONS = [2, 3, 4] as const;
const LEVEL_OPTIONS: { level: OnlineBotLevel; label: string }[] = [
  { level: 'easy', label: 'Easy' },
  { level: 'normal', label: 'Normal' },
  { level: 'expert', label: 'Expert' },
];

export default function PlayOnline() {
  const router = useRouter();
  const { session } = useAuth();
  const [seats, setSeats] = useState<number>(4);
  const [botLevel, setBotLevel] = useState<OnlineBotLevel>('normal');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!session) {
    return (
      <ScreenContainer>
        <Header title="Play online" onBack={() => router.back()} />
        <Card style={styles.signInCard}>
          <Text style={styles.signInText}>Sign in to host a room and invite friends.</Text>
          <Button title="Sign in" onPress={() => router.push('/sign-in')} style={styles.signInBtn} />
        </Card>
      </ScreenContainer>
    );
  }

  async function onCreate() {
    setError(null);
    setCreating(true);
    try {
      const room = await createRoom(seats, botLevel);
      if (!room) {
        setError('Could not create the room. Try again.');
        return;
      }
      router.replace({
        pathname: '/room/[code]',
        params: { code: room.code, link: room.link, deepLink: room.deepLink },
      });
    } finally {
      setCreating(false);
    }
  }

  return (
    <ScreenContainer scroll>
      <Header title="Play online" onBack={() => router.back()} />

      <Text style={styles.label}>Seats</Text>
      <View style={styles.optionRow}>
        {SEAT_OPTIONS.map((n) => (
          <OptionChip key={n} label={String(n)} selected={seats === n} onPress={() => setSeats(n)} />
        ))}
      </View>

      <Text style={styles.label}>Bot difficulty</Text>
      <Text style={styles.hint}>Fills any seats nobody has joined by the time you start.</Text>
      <View style={styles.optionRow}>
        {LEVEL_OPTIONS.map((o) => (
          <OptionChip
            key={o.level}
            label={o.label}
            selected={botLevel === o.level}
            onPress={() => setBotLevel(o.level)}
          />
        ))}
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <Button
        title="Create room"
        subtitle={`${seats} seats`}
        align="left"
        loading={creating}
        onPress={() => void onCreate()}
        style={styles.createBtn}
      />
    </ScreenContainer>
  );
}

function OptionChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.chip, selected ? styles.chipSelected : styles.chipUnselected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  signInCard: { alignItems: 'center', marginTop: spacing.lg },
  signInText: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md },
  signInBtn: { alignSelf: 'stretch' },
  label: { ...typography.label, color: colors.felt, fontWeight: '700', marginTop: spacing.md, marginBottom: spacing.sm },
  hint: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
  optionRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    alignItems: 'center',
    borderWidth: 2,
  },
  chipUnselected: { backgroundColor: colors.surface, borderColor: colors.border },
  chipSelected: { backgroundColor: colors.felt, borderColor: colors.gold },
  chipText: { ...typography.bodyBold, color: colors.felt },
  chipTextSelected: { color: colors.textOnFelt },
  errorBanner: {
    backgroundColor: colors.dangerSoftBg,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.dangerSoftBorder,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: { color: colors.dangerSoftText, fontSize: typography.caption.fontSize },
  createBtn: { marginTop: spacing.md },
});
