// Center pool / trick region: the played pool is the hero, with the two
// actions centered around it -- Pass above, Play below -- so both sit in the
// middle of the table, equally reachable and never mis-tapped for each other.
// Extracted from app/game-local.tsx's inline center block unchanged.
//
// The PASS and PLAY controls are passed in as `passSlot` / `playSlot` so each
// consumer keeps its own button wiring (onPress, disabled, styles) while this
// component fixes their position around the pool. The pool itself is a
// protected region: trickWrap reserves POOL_MIN_HEIGHT (a full-size PlayingCard
// + caption + name) at every viewport, so the played combo always renders full
// size and never clips -- on short viewports the surrounding chrome gives up
// height, never the pool.
import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PlayingCard } from '../PlayingCard';
import { colors, spacing, typography, withAlpha } from '../../lib/theme';
import type { Card } from '../../lib/pusoy/types';
import { POOL_MIN_HEIGHT } from './layout';

export function PoolRegion({
  lastPlay,
  prevPlay,
  emptyText,
  compact,
  passSlot,
  playSlot,
}: {
  // The current play: the cards to show, who played it (raw name; uppercased
  // here for the caption), and the full combo label under the cards. null when
  // no one has led the trick yet.
  lastPlay: { cards: Card[]; playerName: string; label: string } | null;
  // The play immediately before the current one, ghosted under the pool. null
  // when there is none, or hidden entirely in compact.
  prevPlay: { cards: Card[] } | null;
  // Shown in place of the pool while the trick is empty (whose turn to lead).
  emptyText: string;
  compact: boolean;
  // The PASS control, positioned above the pool.
  passSlot: ReactNode;
  // The PLAY control, positioned below the pool.
  playSlot: ReactNode;
}) {
  return (
    <View style={styles.center}>
      {passSlot}

      {/* Pool wrapper: the protected region. It reserves POOL_MIN_HEIGHT
          (a full-size PlayingCard + caption + name) at every viewport, so
          the played combo always renders full size and never clips. It does
          NOT shrink -- the controls and chrome around it do -- reversing the
          rejected R8 design where the pool was the thing that gave up height
          and ended up a clipped sliver. */}
      <View style={styles.trickWrap}>
        {lastPlay ? (
          <View style={[styles.trickArea, compact && styles.trickAreaCompact]}>
            {prevPlay && !compact && (
              <View style={styles.trickGhost} pointerEvents="none">
                {prevPlay.cards.map((c, i) => (
                  <View key={c.id} style={{ marginLeft: i === 0 ? 0 : -34 }}>
                    <PlayingCard card={c} />
                  </View>
                ))}
              </View>
            )}
            <Text style={[styles.trickCaption, compact && styles.trickCaptionCompact]}>
              {lastPlay.playerName.toUpperCase()} PLAYED
            </Text>
            <View style={[styles.trickCards, compact && styles.trickCardsCompact]}>
              {lastPlay.cards.map((c, i) => (
                <View key={c.id} style={{ marginLeft: i === 0 ? 0 : -22, zIndex: 10 + i }}>
                  {/* The pool is the hero: cards ALWAYS render at full
                      PlayingCard size (CARD_HEIGHT), at every viewport. On
                      short phones the height comes from shrinking everything
                      else (controls, seats, chrome) -- never the pool -- and
                      trickWrap reserves a full-size minHeight so the played
                      combo, its caption, and its name never clip. */}
                  <PlayingCard card={c} />
                </View>
              ))}
            </View>
            <Text style={styles.trickName} numberOfLines={1}>{lastPlay.label}</Text>
          </View>
        ) : (
          <View style={[styles.trickArea, compact && styles.trickAreaCompact]}>
            <Text style={styles.trickEmpty}>{emptyText}</Text>
          </View>
        )}
      </View>

      {playSlot}
    </View>
  );
}

const styles = StyleSheet.create({
  // Center pool — the current play is the hero, sitting bare on the felt.
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.md, minHeight: 120 },
  // The center pool region. It is NEVER the flexing/shrinking region anymore
  // (the rejected R8 design let it shrink + clip to a sliver). Instead it holds
  // a protected minHeight sized to a full PlayingCard + caption + name, so the
  // trick display always renders at full size and never clips. On short
  // viewports the surrounding chrome shrinks to make room; the center box (a
  // flex:1 parent) donates its slack here first. No overflow:hidden -- the
  // ghost discard layer below is the only thing that could bleed, and it is
  // hidden in compact and has slack in the roomy layout.
  trickWrap: {
    minHeight: POOL_MIN_HEIGHT,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trickArea: { alignItems: 'center', justifyContent: 'center' },
  // Short-viewport hook. The pool itself never scales (full-size cards at every
  // viewport); only the caption/name margins tighten (trickCaptionCompact /
  // trickCardsCompact) so the full-size combo still fits POOL_MIN_HEIGHT.
  trickAreaCompact: {},
  trickCaption: {
    color: colors.textOnFeltMuted,
    fontSize: typography.tiny.fontSize,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
  },
  trickCaptionCompact: { marginBottom: 2 },
  // The previous play, ghosted beneath the current one like a discard pile.
  trickGhost: {
    position: 'absolute',
    flexDirection: 'row',
    opacity: 0.25,
    transform: [{ rotate: '-5deg' }, { translateY: -10 }],
  },
  trickCards: { flexDirection: 'row', justifyContent: 'center', marginBottom: spacing.sm },
  trickCardsCompact: { marginBottom: 2 },
  trickName: { color: colors.gold, fontSize: typography.label.fontSize, fontWeight: '700' },
  trickEmpty: { color: withAlpha(colors.white, 0.8), fontSize: typography.body.fontSize, paddingVertical: 30 },
});
