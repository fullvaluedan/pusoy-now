// Play with friends (U4): host setup only -- pick a seat count and a bot
// difficulty (used to fill any seats nobody joins by start), then create a
// room and land in its lobby. Quick match moved to the Home hub (U4); this
// screen no longer offers it. A guest gets a lazy anonymous session on mount
// (R2) rather than a sign-in wall -- this path needs just *some* session
// behind a seat, not a real account.
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, CompactHeader, ScreenContainer } from '../components/ui';
import { colors, radii, spacing, typography } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { getLocalGuestName } from '../lib/guest';
import { createRoom, type OnlineBotLevel } from '../lib/rooms';

const SEAT_OPTIONS = [2, 3, 4] as const;
const LEVEL_OPTIONS: { level: OnlineBotLevel; label: string }[] = [
  { level: 'easy', label: 'Easy' },
  { level: 'normal', label: 'Normal' },
  { level: 'expert', label: 'Expert' },
];

export default function PlayOnline() {
  const router = useRouter();
  const { ensureSession, isAnonymous } = useAuth();
  const [seats, setSeats] = useState<number>(4);
  const [botLevel, setBotLevel] = useState<OnlineBotLevel>('normal');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guestName, setGuestName] = useState<string | null>(null);

  useEffect(() => {
    void ensureSession();
    void getLocalGuestName().then(setGuestName);
  }, [ensureSession]);

  async function onCreate() {
    setError(null);
    setCreating(true);
    try {
      const ready = await ensureSession();
      if (ready === 'failed') {
        setError('Could not start a session. Try again.');
        return;
      }
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
    <ScreenContainer>
      <CompactHeader title="Play with friends" />

      {isAnonymous && guestName ? <Text style={styles.guestLine}>Playing as {guestName}</Text> : null}

      <Card style={styles.card}>
        <Text style={styles.cardSubtitle}>Host a room and share the invite link.</Text>

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
          variant="secondary"
          align="left"
          loading={creating}
          onPress={() => void onCreate()}
          style={styles.createBtn}
        />
      </Card>
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
  guestLine: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
  card: { marginBottom: spacing.md },
  cardSubtitle: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
  label: { ...typography.label, color: colors.felt, fontWeight: '700', marginTop: spacing.sm, marginBottom: spacing.xs },
  hint: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.xs },
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
