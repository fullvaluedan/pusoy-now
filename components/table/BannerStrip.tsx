// Reserved headroom strip above the hand toolbar. Extracted from
// app/game-local.tsx unchanged.
//
// INVARIANT: the strip is ALWAYS rendered, at a fixed height (16px, or 14px
// compact), during play. The gold "Your turn" banner, the auto-pass notice,
// and play errors all render INSIDE it (centered, one at a time) instead of
// mounting their own row. Because the strip's height never changes with its
// contents, a message appearing or disappearing can never shift anything below
// it -- the toolbar, hand fan, and controls stay put. Do not make the strip's
// height content-dependent or conditionally unmount it; that reintroduces the
// layout shift this strip exists to prevent.
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../lib/theme';

export function BannerStrip({
  autoPassing,
  error,
  isMyTurn,
  compact,
}: {
  autoPassing: boolean;
  error: string | null;
  isMyTurn: boolean;
  compact?: boolean;
}) {
  return (
    <View style={[styles.bannerStrip, compact && styles.bannerStripCompact]} pointerEvents="none">
      {autoPassing ? (
        <View style={styles.turnBanner}>
          <Text style={styles.turnBannerText}>No playable hand, passing…</Text>
        </View>
      ) : error ? (
        <View style={[styles.turnBanner, styles.errorBanner]}>
          <Text style={[styles.turnBannerText, styles.errorBannerText]} numberOfLines={1}>{error}</Text>
        </View>
      ) : isMyTurn ? (
        <View style={styles.turnBanner}>
          <Text style={styles.turnBannerText}>Your turn</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Reserved headroom strip above the toolbar: always present during play so
  // the toolbar/Sort row never jumps between turns. The banner sits inside it
  // (in normal flow, no absolute overlap).
  bannerStrip: {
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Short-viewport: a slimmer headroom strip above the toolbar. The gold "Your
  // turn" banner still centers in it; a couple px reclaimed for the pool.
  bannerStripCompact: { height: 14 },
  turnBanner: {
    backgroundColor: colors.gold,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
    borderRadius: 999,
  },
  turnBannerText: {
    color: colors.felt,
    fontSize: typography.tiny.fontSize,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  errorBanner: { backgroundColor: colors.danger },
  errorBannerText: { color: colors.white },
});
