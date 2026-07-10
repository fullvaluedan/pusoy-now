// Bicycle-style playing card component. Card FACES are pure View+Text (no
// SVG, no images) so they stay crisp at small sizes — large pips in
// top-left and bottom-right (rotated 180°), big center pip for face cards,
// cream background, thin border, rounded corners. The card BACK is the
// generated `card-back.png` art, with a themed felt color behind it so
// nothing flashes blank while the image loads.

import { memo } from 'react';
import { Image, Text, View } from 'react-native';
import { colors } from '../lib/theme';
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

  if (faceDown || !card) {
    return (
      <View
        style={[
          cardBackStyle(w, h),
          dimmed && { opacity: 0.45 },
          selected && { transform: [{ translateY: -10 }] },
          tiltDeg !== 0 && { transform: [{ rotate: `${tiltDeg}deg` }, { translateY: -10 }] },
        ]}
      >
        {/* colors.felt shows through as a fallback until the art loads */}
        <Image source={CARD_BACK_IMG} style={cardBackImageStyle(w, h)} resizeMode="cover" />
      </View>
    );
  }

  return (
    <View
      style={[
        cardFaceStyle(w, h),
        dimmed && { opacity: 0.45 },
        selected && { transform: [{ translateY: -16 }] },
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
  shadowColor: colors.black,
  shadowOpacity: 0.35,
  shadowRadius: 2,
  shadowOffset: { width: 1, height: 1 },
  elevation: 2,
});

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
