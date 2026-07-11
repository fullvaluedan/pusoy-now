// Bicycle-style playing card component. Card FACES are pure View+Text (no
// SVG, no images) so they stay crisp at small sizes — large pips in
// top-left and bottom-right (rotated 180°), big center pip for face cards,
// cream background, thin border, rounded corners. The card BACK is the
// generated `card-back.png` art, with a themed felt color behind it so
// nothing flashes blank while the image loads.

import { memo } from 'react';
import { Image, Text, View } from 'react-native';
import { colors, withAlpha } from '../lib/theme';
import type { Card, Suit, Rank } from '../lib/pusoy/types';

const CARD_BACK_IMG = require('../assets/art/card-back.png');

const RANK_LABEL: Record<Rank, string> = {
  '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  '10': '10', J: 'J', Q: 'Q', K: 'K', A: 'A', '2': '2',
};
const SUIT_GLYPH: Record<Suit, string> = {
  C: '♣', D: '♦', H: '♥', S: '♠',
};
// Red suits get red ink, black suits get near-black.
const SUIT_COLOR: Record<Suit, string> = {
  C: colors.ink, D: colors.cardRed, H: colors.cardRed, S: colors.ink,
};

const CARD_W = 64;
const CARD_H = 92;

export const CARD_WIDTH = CARD_W;
export const CARD_HEIGHT = CARD_H;

// Shared "held fan" hand-layout geometry. Both the interactive hand (HandRow
// in app/game-local.tsx) and the dealing animation use these so a dealt card
// lands in the exact spot -- horizontal position, tilt, and lift -- that the
// live hand renders it in once dealing ends. Keeping the math in one place
// (instead of duplicating it in both files) is what keeps them in sync; if
// they drifted, the hand would visibly jump/flatten when the deal finishes.

// Horizontal spacing: the stride between adjacent card left-edges, and the
// x-offset of the first card, centering the whole fan inside `viewportWidth`
// with `sideMargin` of breathing room on each side. Stride shrinks toward
// zero (more overlap) as `total` grows so the whole hand always fits, but is
// capped so a full 13-card hand keeps ~65-75% overlap between neighbors
// instead of spreading too thin on a narrow phone.
export function fanRowLayout(
  total: number,
  viewportWidth: number,
  sideMargin = 28,
): { stride: number; startX: number } {
  const available = viewportWidth - sideMargin * 2;
  const fitStride = total > 1 ? (available - CARD_WIDTH) / (total - 1) : 0;
  const stride = total > 1 ? Math.min(CARD_WIDTH, fitStride) : 0;
  const totalWidth = CARD_WIDTH + stride * Math.max(0, total - 1);
  const startX = (viewportWidth - totalWidth) / 2;
  return { stride, startX };
}

// Max upward lift (px) of the edge cards in the arc, relative to the center
// card. Callers should inset their resting `top` by this amount so the
// highest point of the arc (the edges) lines up with the flat fan's old
// resting position, instead of poking above it.
export const FAN_LIFT_MAX = 10;
const FAN_ROTATE_MAX_DEG = 9;

// Per-card arc offset for card `index` of `total`: a shallow "smile" curve
// where the center card sits at the baseline and both edges lift up
// (negative translateY) and tilt outward a few degrees, like a fan held in
// the hand. Symmetric around the center card.
export function fanCardArc(index: number, total: number): { translateY: number; rotateDeg: number } {
  if (total <= 1) return { translateY: 0, rotateDeg: 0 };
  const center = (total - 1) / 2;
  const t = (index - center) / center; // -1 (left edge) .. 0 (center) .. 1 (right edge)
  return {
    translateY: -FAN_LIFT_MAX * t * t,
    rotateDeg: FAN_ROTATE_MAX_DEG * t,
  };
}

interface Props {
  card?: Card;
  faceDown?: boolean;
  small?: boolean; // for opponent stacks
  selected?: boolean; // human's hand highlight
  dimmed?: boolean; // passed/finished
  tiltDeg?: number; // small rotation for fanned opponent stacks
}

function PlayingCardComponent({ card, faceDown, small, selected, dimmed, tiltDeg = 0 }: Props) {
  const w = small ? 38 : CARD_W;
  const h = small ? 54 : CARD_H;
  const fontSize = small ? 12 : 18;
  const glyphSize = small ? 13 : 20;

  // A card is never both selected and dimmed in practice (the game passes
  // `dimmed={isDimmed && !isSelected}`), but if it were, selected should win.
  const isDimmed = dimmed && !selected;

  if (faceDown || !card) {
    return (
      <View
        style={[
          cardBackStyle(w, h),
          selected && { borderColor: colors.gold, borderWidth: 2, transform: [{ translateY: -10 }] },
          tiltDeg !== 0 && { transform: [{ rotate: `${tiltDeg}deg` }, { translateY: -10 }] },
        ]}
      >
        {/* colors.felt shows through as a fallback until the art loads */}
        <Image source={CARD_BACK_IMG} style={cardBackImageStyle(w, h)} resizeMode="cover" />
        {/* Faint dark tint on top of the art reads as "inactive" without
            tanking legibility the way heavy transparency over felt would. */}
        {isDimmed && <View style={dimOverlayStyle} pointerEvents="none" />}
      </View>
    );
  }

  return (
    <View
      style={[
        cardFaceStyle(w, h),
        selected && { borderColor: colors.gold, borderWidth: 2, transform: [{ translateY: -16 }] },
        tiltDeg !== 0 && { transform: [{ rotate: `${tiltDeg}deg` }, { translateY: -10 }] },
      ]}
    >
      {/* Top-left corner */}
      <View style={cornerTopLeft}>
        <Text style={{ color: SUIT_COLOR[card.suit], fontSize, fontWeight: '700', lineHeight: fontSize + 1 }}>
          {RANK_LABEL[card.rank]}
        </Text>
        <Text style={{ color: SUIT_COLOR[card.suit], fontSize: glyphSize, lineHeight: glyphSize + 1, marginTop: -2 }}>
          {SUIT_GLYPH[card.suit]}
        </Text>
      </View>
      {/* Center big pip — face cards get a letter, others get the suit glyph */}
      <View style={centerPip}>
        <Text
          style={{
            color: SUIT_COLOR[card.suit],
            fontSize: small ? 22 : 36,
            fontWeight: '700',
            lineHeight: small ? 22 : 38,
          }}
        >
          {['J', 'Q', 'K'].includes(card.rank) ? card.rank : SUIT_GLYPH[card.suit]}
        </Text>
      </View>
      {/* Bottom-right corner (rotated 180°) */}
      <View style={cornerBottomRight}>
        <Text
          style={{
            color: SUIT_COLOR[card.suit],
            fontSize,
            fontWeight: '700',
            lineHeight: fontSize + 1,
            transform: [{ rotate: '180deg' }],
          }}
        >
          {RANK_LABEL[card.rank]}
        </Text>
        <Text
          style={{
            color: SUIT_COLOR[card.suit],
            fontSize: glyphSize,
            lineHeight: glyphSize + 1,
            marginTop: -2,
            transform: [{ rotate: '180deg' }],
          }}
        >
          {SUIT_GLYPH[card.suit]}
        </Text>
      </View>
      {/* Faint dark tint reads as "inactive" while keeping pips legible
          underneath (see dimmed treatment on the face-down branch above). */}
      {isDimmed && <View style={dimOverlayStyle} pointerEvents="none" />}
    </View>
  );
}

export const PlayingCard = memo(PlayingCardComponent);

// Stacked face-down deck for opponent card counts.
export function OpponentCardStack({ count, small = true }: { count: number; small?: boolean }) {
  const w = small ? 38 : CARD_W;
  const h = small ? 54 : CARD_H;
  const visible = Math.min(count, 5); // show at most 5 stacked
  return (
    <View style={{ width: w + 20, height: h + 16, alignItems: 'center', justifyContent: 'center' }}>
      {Array.from({ length: visible }).map((_, i) => {
        const offset = (i - (visible - 1) / 2) * 4;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              top: 6 + Math.abs(i - (visible - 1) / 2) * 0.5,
              left: 10 + offset,
            }}
          >
            <PlayingCard faceDown small />
          </View>
        );
      })}
    </View>
  );
}

const cardBase = (w: number, h: number) => ({
  width: w,
  height: h,
  borderRadius: 7,
  borderWidth: 1,
  borderColor: colors.cardBorder,
  backgroundColor: colors.cardFace,
  // Slightly stronger, consistent shadow so every card (hand, trick pile,
  // opponent stacks) visibly lifts off the dark felt.
  shadowColor: colors.black,
  shadowOpacity: 0.4,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 2 },
  elevation: 4,
});

// Absolutely-positioned dark scrim used for the dimmed treatment (see above).
// The card itself stays FULLY OPAQUE — no card-level opacity — so the felt and
// neighboring cards never bleed through; only this scrim conveys "inactive".
const dimOverlayStyle = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  borderRadius: 6,
  backgroundColor: withAlpha(colors.ink, 0.38),
};

const cardFaceStyle = (w: number, h: number) => ({
  ...cardBase(w, h),
  position: 'relative' as const,
});

const cardBackStyle = (w: number, h: number) => ({
  ...cardBase(w, h),
  // Themed felt fallback shows through while card-back.png loads.
  backgroundColor: colors.felt,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  overflow: 'hidden' as const,
  borderColor: colors.cream,
  borderWidth: 2,
});

const cardBackImageStyle = (w: number, h: number) => ({
  width: w,
  height: h,
  borderRadius: 6,
});

const cornerTopLeft = {
  position: 'absolute' as const,
  top: 3,
  left: 4,
  alignItems: 'center' as const,
};

const cornerBottomRight = {
  position: 'absolute' as const,
  bottom: 3,
  right: 4,
  alignItems: 'center' as const,
};

const centerPip = {
  flex: 1,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};
