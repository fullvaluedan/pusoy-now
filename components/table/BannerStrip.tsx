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
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography, withAlpha } from '../../lib/theme';

// Local 250ms countdown ticker, live only while a deadline is set. When the
// deadline is null (the bot table) the interval never arms, so this component
// stays a zero-cost leaf there -- the online table alone drives the countdown,
// and only THIS pill re-renders as it ticks, not the whole felt table.
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

export function BannerStrip({
  autoPassing,
  error,
  isMyTurn,
  compact,
  turnText,
  deadline,
  reconnecting,
}: {
  autoPassing: boolean;
  error: string | null;
  isMyTurn: boolean;
  compact?: boolean;
  // Optional override for the gold "Your turn" pill's text, used only when no
  // live countdown is running. The bot table omits it (plain "Your turn"); the
  // online table drives the countdown via `deadline` below instead.
  turnText?: string;
  // Online only: the viewer's turn deadline (epoch ms). When set on the viewer's
  // OWN turn, this pill runs its own 250ms ticker and renders "Your turn - Ns"
  // internally, so the countdown never re-renders anything outside this leaf.
  // Omitted (or null) by the bot table, which shows a static pill.
  deadline?: number | null;
  // Online only: a mid-game socket drop. Shown as a distinct (non-gold) pill
  // that takes precedence over everything else so a disconnect is impossible to
  // miss, and -- like every other state here -- lives inside the fixed-height
  // strip so it never shifts the toolbar/hand below. Omitted by the bot table.
  reconnecting?: boolean;
}) {
  const seconds = useCountdownSeconds(isMyTurn ? deadline : null);
  const yourTurnText = seconds !== null ? `Your turn - ${seconds}s` : turnText ?? 'Your turn';
  return (
    <View style={[styles.bannerStrip, compact && styles.bannerStripCompact]} pointerEvents="none">
      {reconnecting ? (
        <View style={[styles.turnBanner, styles.reconnectBanner]}>
          <Text style={[styles.turnBannerText, styles.reconnectText]} numberOfLines={1}>Reconnecting…</Text>
        </View>
      ) : autoPassing ? (
        <View style={styles.turnBanner}>
          <Text style={styles.turnBannerText}>No playable hand, passing…</Text>
        </View>
      ) : error ? (
        <View style={[styles.turnBanner, styles.errorBanner]}>
          <Text style={[styles.turnBannerText, styles.errorBannerText]} numberOfLines={1}>{error}</Text>
        </View>
      ) : isMyTurn ? (
        <View style={styles.turnBanner}>
          <Text style={styles.turnBannerText} numberOfLines={1}>{yourTurnText}</Text>
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
  // Reconnecting: a distinct dark pill with a gold hairline, deliberately unlike
  // the gold "Your turn" and red error pills so a live disconnect reads as its
  // own state at a glance.
  reconnectBanner: {
    backgroundColor: withAlpha(colors.ink, 0.85),
    borderWidth: 1,
    borderColor: colors.gold,
  },
  reconnectText: { color: colors.gold },
});
