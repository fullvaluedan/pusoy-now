// The human's hand: all 13 cards fanned across the table width, centered. Each
// card is tappable to select and draggable (no long-press) to reorder; an
// upward flick into the center auto-plays an established hand. Extracted from
// app/game-local.tsx unchanged so both tables share one drag/reorder/flick
// implementation.
import { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View, useWindowDimensions } from 'react-native';
import {
  PlayingCard,
  CARD_HEIGHT,
  fanRowLayout,
  fanCardArc,
  FAN_LIFT_MAX,
} from '../PlayingCard';
import { layout } from '../../lib/theme';
import type { Card } from '../../lib/pusoy/types';

// The fan container's height and each resting card's top inset -- the exact
// geometry DraggableCard renders at (see its `top` below). Exported so
// DealingAnimation can build its accumulating hand inside a container of the
// same shape, anchored the same way (top, not bottom), so the deal-to-play
// switch moves nothing: both phases stack cards at identical coordinates.
export const HAND_FAN_CONTAINER_HEIGHT = CARD_HEIGHT + 24 + FAN_LIFT_MAX;
export const HAND_FAN_CARD_TOP = 12 + FAN_LIFT_MAX;

export function HandRow({
  hand,
  selected,
  playableIds,
  onTap,
  onReorder,
  onDropToCenter,
  dropEnabled,
}: {
  hand: Card[];
  selected: Card[];
  // Cards eligible for a legal play right now; null = no dimming (not my turn).
  playableIds: Set<string> | null;
  onTap: (c: Card) => void;
  onReorder: (from: number, to: number) => void;
  // Called when a card is flicked up into the center to auto-play it.
  onDropToCenter: (c: Card) => void;
  // Whether an upward flick should attempt a play (true on the human's turn,
  // whether leading or following).
  dropEnabled: boolean;
}) {
  // Reactive: reflows the fan when the browser window resizes / device rotates.
  // Capped to the table column so the fan stays composed on wide viewports.
  const { width: windowWidth } = useWindowDimensions();
  const width = Math.min(windowWidth, layout.maxTableWidth);
  // Horizontal spacing (stride + centering) is shared with DealingAnimation
  // via fanRowLayout so the dealt cards land exactly where this fan renders
  // them -- see components/PlayingCard.tsx.
  const { stride, startX } = fanRowLayout(hand.length, width);
  // Fan container height must derive from card HEIGHT, not width: each card
  // sits at `top: HAND_FAN_CARD_TOP` (DraggableCard) so a resting card's
  // bottom edge is at most `HAND_FAN_CARD_TOP + CARD_HEIGHT`; the +24 leaves
  // headroom below for the card's shadow and for a selected card's -16px
  // lift, and the extra FAN_LIFT_MAX accounts for the arc's own lift, so
  // nothing in the fan is ever clipped.
  return (
    <View style={[styles.handFan, { height: HAND_FAN_CONTAINER_HEIGHT }]}>
      {hand.map((c, i) => (
        <DraggableCard
          key={c.id}
          card={c}
          isSelected={!!selected.find((s) => s.id === c.id)}
          isDimmed={playableIds !== null && !playableIds.has(c.id)}
          index={i}
          onTap={() => onTap(c)}
          onReorder={onReorder}
          onDropToCenter={onDropToCenter}
          dropEnabled={dropEnabled}
          total={hand.length}
          startX={startX}
          stride={stride}
        />
      ))}
    </View>
  );
}

function DraggableCard({
  card,
  isSelected,
  isDimmed,
  index,
  onTap,
  onReorder,
  onDropToCenter,
  dropEnabled,
  total,
  startX,
  stride,
}: {
  card: Card;
  isSelected: boolean;
  isDimmed: boolean;
  index: number;
  onTap: () => void;
  onReorder: (from: number, to: number) => void;
  onDropToCenter: (c: Card) => void;
  dropEnabled: boolean;
  total: number;
  startX: number;
  stride: number;
}) {
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [dragging, setDragging] = useState(false);
  // The "rest" position for this card in the fan.
  const restX = startX + index * stride;
  // Shallow-arc fan offset for this card's slot: edges lift up and tilt
  // outward, center sits at the baseline. Shared with the dealing animation
  // (see components/PlayingCard.tsx) so cards never jump when dealing ends.
  const arc = fanCardArc(index, total);

  // Claim the gesture on touch-start (not via a child Pressable) so a drag
  // works on the very first press, even on a card that isn't selected yet. On
  // web a wrapping Pressable would swallow the mousedown and the PanResponder
  // would never see the drag until a prior click had "primed" the card. Tap vs
  // drag is decided on release by how far the pointer moved.
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_, g) => {
          if (Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6) setDragging(true);
          pan.x.setValue(g.dx);
          pan.y.setValue(g.dy);
        },
        onPanResponderRelease: (_, g) => {
          setDragging(false);
          const moved = Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8;
          if (!moved) {
            onTap();
          } else {
            // An upward flick into the center plays an established hand; a
            // mostly-horizontal drag reorders. Vertical must dominate so a
            // normal reorder never fires a play.
            const isUpwardFlick = dropEnabled && g.dy < -70 && Math.abs(g.dy) > Math.abs(g.dx);
            if (isUpwardFlick) {
              onDropToCenter(card);
            } else {
              const target = Math.max(0, Math.min(total - 1, index + Math.round(g.dx / Math.max(1, stride))));
              if (target !== index) onReorder(index, target);
            }
          }
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        },
        onPanResponderTerminate: () => {
          setDragging(false);
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        },
      }),
    [index, total, onReorder, onTap, onDropToCenter, dropEnabled, card, pan, stride],
  );

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: restX,
        // Baseline top is inset by FAN_LIFT_MAX so the arc's upward lift
        // (translateY below, 0..-FAN_LIFT_MAX) never rises above where the
        // old flat fan used to sit -- same headroom, just distributed by
        // the arc instead of being uniform.
        top: HAND_FAN_CARD_TOP,
        transform: [
          { translateY: arc.translateY },
          { rotate: `${arc.rotateDeg}deg` },
          { translateX: pan.x },
          { translateY: pan.y },
        ],
        zIndex: dragging ? 100 : index,
      }}
      {...responder.panHandlers}
    >
      <PlayingCard card={card} selected={isSelected} dimmed={isDimmed && !isSelected} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  handFan: {
    // The hand is a fan of absolutely-positioned cards centered horizontally
    // on the screen. Height is set by the parent (HandRow) to match card
    // height + a bit of vertical padding for the lift animation.
    width: '100%',
    position: 'relative',
  },
});
