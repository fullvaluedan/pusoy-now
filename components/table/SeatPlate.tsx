// One opponent seat around the top arc of the table, plus the small per-seat
// status chip. Extracted from app/game-local.tsx unchanged so both tables draw
// identical seats. Props-only: the consumer resolves names, counts, and turn
// state and hands them in.
import { StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { Avatar } from '../Avatar';
import { OpponentCardStack } from '../PlayingCard';
import { colors, radii, spacing, withAlpha } from '../../lib/theme';

const PLACE_LABEL = ['1st', '2nd', '3rd', '4th'];

// Small status chip on a seat: PASS while sitting out the trick, or the
// finishing place once out of cards. Turn state is carried by the gold ring
// and plate glow, not text. Exported for the human seat's toolbar too.
export function SeatChip({ passed, place }: { passed: boolean; place: number | null }) {
  if (place !== null) {
    return (
      <View style={[styles.seatChip, styles.seatChipPlace]}>
        <Text style={styles.seatChipPlaceText}>{PLACE_LABEL[place - 1]}</Text>
      </View>
    );
  }
  if (passed) {
    return (
      <View style={[styles.seatChip, styles.seatChipPass]}>
        <Text style={styles.seatChipPassText}>PASS</Text>
      </View>
    );
  }
  return null;
}

// One opponent seat around the top arc of the table. The human has no plate
// here; their seat is merged into the hand area at the bottom.
export function SeatPlate({
  name,
  avatarUrl = null,
  avatarSource,
  isCurrent,
  place,
  passed,
  count,
  raised,
  compact,
}: {
  name: string;
  avatarUrl?: string | null;
  avatarSource?: ImageSourcePropType;
  isCurrent: boolean;
  // 1-based finishing place once out of cards, else null.
  place: number | null;
  passed: boolean;
  count: number;
  // The middle seat sits higher than the two flanking it, arcing the seats
  // around the table instead of lining them up.
  raised: boolean;
  // Short-viewport variant: a smaller avatar, the face-down stack art dropped,
  // and the card count carried as a chip in the name row instead of on the
  // stack -- reclaiming the ~50px the stack occupies so the controls and hand
  // fan stay on-screen.
  compact: boolean;
}) {
  const finished = place !== null;
  return (
    <View
      style={[
        styles.oppBox,
        raised ? styles.oppBoxRaised : null,
        compact && styles.oppBoxCompact,
        isCurrent && styles.oppBoxActive,
        finished && styles.oppBoxDone,
      ]}
    >
      <Avatar
        name={name}
        url={avatarUrl}
        localSource={avatarSource}
        size={compact ? 28 : 48}
        framed
        active={isCurrent && !finished}
        style={compact ? styles.oppAvatarMarginCompact : styles.oppAvatarMargin}
      />
      <View style={[styles.oppNameRow, compact && styles.oppNameRowCompact]}>
        <Text style={[styles.oppName, compact && styles.oppNameCompact]} numberOfLines={1} ellipsizeMode="tail">{name}</Text>
        {/* Micro seat (compact): one text line only -- name, the PASS/place
            status chip (null until it applies), and the card-count chip. The
            face-down stack art is dropped entirely, reclaiming its ~50px so the
            full-size pool + controls stay on-screen. */}
        <SeatChip passed={passed} place={place} />
        {compact ? (
          <View style={styles.oppCountChip}>
            <Text style={styles.oppCountChipText}>{count}</Text>
          </View>
        ) : null}
      </View>
      {compact ? null : (
        <View style={styles.oppStackRow}>
          <View style={styles.oppStackWrap}>
            <OpponentCardStack count={count} small />
            {/* Compact card-count chip, overlapping the stack's bottom-right
                corner -- the at-a-glance "how many cards do they hold" cue
                mobile card games use instead of a bare number. */}
            <View style={styles.cardCountBadge}>
              <Text style={styles.cardCountBadgeText}>{count}</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  oppBox: {
    backgroundColor: withAlpha(colors.ink, 0.25),
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    borderRadius: radii.md,
    alignItems: 'center',
    // 3 boxes across oppRow's content width (347px at 375, after its own
    // paddingHorizontal) leaves ~115px per box; 120 (the old value) made 3
    // boxes add up to 360px and overflow the row at exactly 375px. 96 covers
    // the 48px avatar + this box's own padding with a little to spare.
    minWidth: 96,
    marginTop: spacing.lg,
  },
  // The middle seat sits higher, arcing the row around the table's far edge.
  oppBoxRaised: { marginTop: 0 },
  // Short-viewport: a micro seat -- tight padding, a small top offset, and a
  // narrow min width to go with the 28px avatar, single text line, and dropped
  // stack art. This is the row the layout compresses first (never the pool) to
  // free height on the shortest phones.
  oppBoxCompact: {
    paddingVertical: 3,
    marginTop: 2,
    minWidth: 76,
  },
  // Count chip carried in the name row when the stack art is hidden (compact).
  oppCountChip: {
    minWidth: 20,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  oppCountChipText: { color: colors.felt, fontSize: 11, fontWeight: '800' },
  // The avatar's own turn-ring (see components/Avatar.tsx) now carries most of
  // the "whose turn" signal, so the plate itself only needs a whisper of gold
  // rather than a full wash + border.
  oppBoxActive: {
    backgroundColor: withAlpha(colors.gold, 0.08),
    borderWidth: 1,
    borderColor: withAlpha(colors.gold, 0.6),
  },
  oppBoxDone: { opacity: 0.55 },
  oppAvatarMargin: { marginBottom: spacing.sm },
  oppAvatarMarginCompact: { marginBottom: 2 },
  oppNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  // Micro seat: no bottom margin (single line, nothing below it) and a tighter
  // gap so name + status + count sit compactly on one row.
  oppNameRowCompact: { marginBottom: 0, gap: 4 },
  oppName: { color: colors.textOnFelt, fontSize: 15, fontWeight: '700', flex: 1, minWidth: 0 },
  oppNameCompact: { fontSize: 13 },
  oppStackRow: { flexDirection: 'row', alignItems: 'center' },
  oppStackWrap: { position: 'relative' },
  cardCountBadge: {
    position: 'absolute',
    right: -6,
    bottom: -2,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.felt,
  },
  cardCountBadgeText: { color: colors.felt, fontSize: 11, fontWeight: '800' },

  // Seat status chips: PASS while sitting out, place medal once out of cards.
  seatChip: {
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1,
    borderRadius: 999,
  },
  seatChipPass: { backgroundColor: withAlpha(colors.cardRed, 0.9) },
  seatChipPassText: { color: colors.white, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  seatChipPlace: { backgroundColor: colors.gold },
  seatChipPlaceText: { color: colors.felt, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
});
