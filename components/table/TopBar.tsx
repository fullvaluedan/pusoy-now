// Slim in-table top bar: back, the table's difficulty, and (during play) the
// skip control. Extracted from app/game-local.tsx unchanged. Replaces the stock
// navigation header, which clashed with the felt and wasted a full bar of
// vertical space.
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography, withAlpha } from '../../lib/theme';

// Local 250ms countdown ticker, live only while a deadline is set. Null deadline
// (the bot table, or the viewer's own turn) never arms the interval, so only the
// top bar re-renders as another seat's countdown ticks -- not the whole table.
function useCountdownSeconds(deadline: number | null | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline == null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline]);
  if (deadline == null) return null;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function TopBar({
  title,
  turnLabel,
  turnDeadline,
  timer,
  onBack,
  onSkip,
  compact,
}: {
  title: string;
  // Compact, persistent turn/round status chip under the title. Optional so
  // the finished/loading screens (which reuse TopBar without it) stay as-is.
  turnLabel?: string;
  // Online only: the current (non-viewer) seat's turn deadline (epoch ms). When
  // set, this bar runs its own 250ms ticker and appends "- Ns" to turnLabel
  // internally, so the countdown re-renders only this bar. Omitted by the bot
  // table, which shows a static turnLabel.
  turnDeadline?: number | null;
  // Elapsed game clock ("M:SS"), shown during play only.
  timer?: string;
  onBack: () => void;
  onSkip?: () => void;
  // Short-viewport variant: shortens the skip label to "Skip" so it fits the
  // now-symmetric right column.
  compact?: boolean;
}) {
  const seconds = useCountdownSeconds(turnDeadline);
  const turnLabelText =
    turnLabel && seconds !== null ? `${turnLabel} - ${seconds}s` : turnLabel;
  return (
    <View style={[styles.topBar, compact && styles.topBarCompact]}>
      <Pressable onPress={onBack} hitSlop={12} style={[styles.topBarSide, styles.topBarLeft]}>
        <Text style={styles.topBarBack}>{'←'}</Text>
      </Pressable>
      <View style={styles.topBarCenter}>
        <Text style={styles.topBarTitle} numberOfLines={1}>{title}</Text>
        {turnLabelText ? (
          <View style={styles.turnChip}>
            <Text style={styles.turnChipText} numberOfLines={1}>{turnLabelText}</Text>
          </View>
        ) : null}
      </View>
      <View style={[styles.topBarSide, styles.topBarRight]}>
        {timer ? <Text style={[styles.timerText, compact && styles.timerTextCompact]}>{timer}</Text> : null}
        {onSkip ? (
          <Pressable
            style={({ pressed }) => [styles.btnSmall, styles.btnSkip, compact && styles.btnSkipCompact, pressed && styles.btnSmallPressed]}
            hitSlop={compact ? 7 : undefined}
            onPress={onSkip}
          >
            <Text style={styles.btnSmallText} numberOfLines={1}>{compact ? 'Skip' : 'Skip to end'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Slim in-table top bar replacing the stock navigation header.
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  // Short-viewport: trim the bar's own vertical padding (the Skip button and
  // timer shrink alongside) to reclaim height for the full-size pool.
  topBarCompact: {
    paddingTop: spacing.xs,
    paddingBottom: 2,
  },
  topBarSide: { justifyContent: 'center' },
  // Symmetric side columns (R2): both 96px so the title + turn chip sit at the
  // true optical center of the bar. The back chevron is left-aligned inside
  // its column; the timer + Skip button are right-aligned inside theirs (Skip
  // shortens to "Skip" in compact mode so it fits the 96px column).
  topBarLeft: { width: 96, alignItems: 'flex-start' },
  topBarRight: { width: 96, alignItems: 'flex-end' },
  topBarBack: { color: colors.textOnFelt, fontSize: 22, fontWeight: '700' },
  topBarCenter: { flex: 1, alignItems: 'center', gap: 3 },
  topBarTitle: {
    textAlign: 'center',
    color: colors.textOnFeltMuted,
    fontSize: typography.caption.fontSize,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  // Compact, persistent turn-status chip, always visible under the title
  // (unlike the gold "Your turn" banner over the hand, which only shows on
  // the human's own turn).
  turnChip: {
    backgroundColor: withAlpha(colors.black, 0.25),
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: 999,
    maxWidth: 180,
  },
  turnChipText: {
    color: colors.textOnFelt,
    fontSize: typography.tiny.fontSize,
    fontWeight: '700',
  },
  // Sort / Skip: the felt-light secondary chunky button, smaller than
  // Play/Pass. Shared with the hand toolbar's Sort button in game-local.tsx;
  // kept here so the top bar is self-contained.
  btnSmall: {
    backgroundColor: colors.feltLight,
    minHeight: 40,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    borderBottomWidth: 4,
    borderBottomColor: colors.felt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSmallPressed: { borderBottomWidth: 0, transform: [{ translateY: 4 }] },
  // The top-bar Skip button gets tighter horizontal padding so "Skip to end"
  // fits the symmetric right column.
  btnSkip: { paddingHorizontal: spacing.sm },
  // Short-viewport: shorter Skip (label is just "Skip" here) so the top bar
  // reclaims height. hitSlop on the Pressable keeps the effective tap >=44.
  btnSkipCompact: { minHeight: 30, paddingVertical: 2 },
  btnSmallText: { color: colors.textOnFelt, fontWeight: '800', fontSize: typography.caption.fontSize, textTransform: 'uppercase', letterSpacing: 0.3 },
  // Elapsed game clock in the top bar, sitting above the Skip button. Tabular
  // width would be ideal but RN has no cross-platform monospace; the fixed
  // right-align keeps it from jittering as the seconds tick.
  timerText: {
    color: colors.textOnFelt,
    fontSize: typography.caption.fontSize,
    fontWeight: '800',
    marginBottom: spacing.xs,
    letterSpacing: 0.5,
  },
  // Short-viewport: pull the timer nearly flush to the Skip button beneath it,
  // shaving a few px off the top bar's right column.
  timerTextCompact: { marginBottom: 1 },
});
