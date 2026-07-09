// Bicycle-style playing card component. Pure View+Text (no SVG, no images).
// Renders a standard card layout: large pips in top-left and bottom-right
// (rotated 180°), big center pip for face cards, white background, thin
// border, rounded corners. Card back is a classic blue with a white
// diamond pattern in the center.

import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Card, Suit, Rank } from '../lib/pusoy/types';

const RANK_LABEL: Record<Rank, string> = {
  '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  '10': '10', J: 'J', Q: 'Q', K: 'K', A: 'A', '2': '2',
};
const SUIT_GLYPH: Record<Suit, string> = {
  C: '♣', D: '♦', H: '♥', S: '♠',
};
// Red suits get red ink, black suits get near-black.
const SUIT_COLOR: Record<Suit, string> = {
  C: '#1a1a1a', D: '#c0392b', H: '#c0392b', S: '#1a1a1a',
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
        {/* Diamond pattern: a single big "♦" rotated */}
        <Text
          style={{
            color: '#fff',
            fontSize: h * 0.6,
            lineHeight: h * 0.6,
            transform: [{ rotate: '0deg' }],
            opacity: 0.9,
          }}
        >
          ◆
        </Text>
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
  borderColor: '#2c3e50',
  backgroundColor: '#fdfdfb',
  shadowColor: '#000',
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
  backgroundColor: '#1e4a8a',
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  // Subtle diagonal stripe pattern via border.
  borderColor: '#fff',
  borderWidth: 2,
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
