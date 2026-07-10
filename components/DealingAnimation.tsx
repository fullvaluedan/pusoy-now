// Dealing animation overlay. Renders a brief scene of cards flying from the
// center of the screen out to each player's seat. Pure RN Animated — no
// native deps.
//
// Sequence: for each of 52 steps, animate a face-down card from (0.5, 0.5) to
// the seat's position. Each step takes ~50ms; the whole animation ~2.6s.

import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { OpponentCardStack, PlayingCard } from './PlayingCard';
import { colors, withAlpha } from '../lib/theme';
import type { DealStep, LocalPlayer } from '../lib/pusoy/localGame';

const CARD_BACK_IMG = require('../assets/art/card-back.png');

const STEP_MS = 50;
const TOTAL_STEPS = 52;

interface Props {
  dealOrder: DealStep[];
  deck: import('../lib/pusoy/types').Card[];
  playerKinds: LocalPlayer[];
  playerNames: string[];
  onDone: () => void;
}

// Seat positions as fractions of the screen (0..1, 0..1). These match the
// positions the game table uses:
//   - top-left, top-right: 2 opponents
//   - bottom-center: human
function seatFraction(seat: number, humanSeat: number, total: number): { x: number; y: number } {
  // Layout: human at bottom center. Other 3 seats fan above (left, top, right).
  // Compute the seat's position relative to the human.
  const order: number[] = [];
  for (let i = 0; i < total; i++) {
    const idx = (humanSeat + 1 + i) % total;
    order.push(idx);
  }
  // order[0] is the seat to the right of human; order[1] is across; order[2] is left
  const pos = order.indexOf(seat);
  if (pos === 0) return { x: 0.78, y: 0.22 }; // right opponent
  if (pos === 1) return { x: 0.5, y: 0.12 }; // top opponent
  if (pos === 2) return { x: 0.22, y: 0.22 }; // left opponent
  return { x: 0.5, y: 0.85 }; // human
}

export function DealingAnimation({ dealOrder, deck, playerKinds, playerNames, onDone }: Props) {
  const { width, height } = Dimensions.get('window');
  const [step, setStep] = useState(0);
  const x = useRef(new Animated.Value(width * 0.5 - 32)).current;
  const y = useRef(new Animated.Value(height * 0.5 - 46)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const [showShuffle, setShowShuffle] = useState(true);

  // Shuffle phase: deck bobs for 800ms, then fades
  useEffect(() => {
    const t = setTimeout(() => setShowShuffle(false), 900);
    return () => clearTimeout(t);
  }, []);

  // Dealing phase: 52 steps
  useEffect(() => {
    if (showShuffle) return;
    if (step >= TOTAL_STEPS) {
      const t = setTimeout(onDone, 350);
      return () => clearTimeout(t);
    }
    const humanSeat = playerKinds.findIndex((k) => k === 'human');
    const next = dealOrder[step];
    const target = seatFraction(next.seat, humanSeat, 4);
    Animated.parallel([
      Animated.timing(x, {
        toValue: target.x * width - 32,
        duration: STEP_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(y, {
        toValue: target.y * height - 46,
        duration: STEP_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 5, useNativeDriver: false }),
        Animated.delay(STEP_MS - 10),
        Animated.timing(opacity, { toValue: 0, duration: 5, useNativeDriver: false }),
      ]),
    ]).start(() => setStep((s) => s + 1));
  }, [step, showShuffle, dealOrder, playerKinds, x, y, opacity, onDone, width, height]);

  if (showShuffle) {
    return (
      <Pressable style={styles.overlay} onPress={onDone}>
        <View style={styles.shuffleBox}>
          <View style={styles.deckStack}>
            <View style={[styles.deckCard, { top: 0, left: 0 }]}>
              <Image source={CARD_BACK_IMG} style={styles.deckCardImage} resizeMode="cover" />
            </View>
            <View style={[styles.deckCard, { top: 2, left: 2 }]}>
              <Image source={CARD_BACK_IMG} style={styles.deckCardImage} resizeMode="cover" />
            </View>
            <View style={[styles.deckCard, { top: 4, left: 4 }]}>
              <Image source={CARD_BACK_IMG} style={styles.deckCardImage} resizeMode="cover" />
            </View>
            <View style={[styles.deckCard, { top: 6, left: 6 }]}>
              <Image source={CARD_BACK_IMG} style={styles.deckCardImage} resizeMode="cover" />
            </View>
          </View>
          <Text style={styles.shuffleText}>Shuffling…</Text>
          <Text style={styles.skipHint}>Tap to skip</Text>
        </View>
      </Pressable>
    );
  }

  // The card currently being dealt.
  const humanSeat = playerKinds.findIndex((k) => k === 'human');
  const oppStacks: number[] = [0, 1, 2, 3].map((s) => s === humanSeat ? -1 : s);
  const currentStep = dealOrder[step];
  const currentCard = currentStep ? deck[currentStep.cardIndex] : null;
  const isHumanCard = currentStep?.seat === humanSeat;

  // The human's cards that have already landed (steps before the one now in
  // flight). They accumulate face-up in a fan at the bottom so the player
  // watches their own hand fill, and the cards stay put when the deal ends and
  // the real hand takes over the same spot.
  const humanDealt: import('../lib/pusoy/types').Card[] = [];
  for (let s = 0; s < step; s++) {
    if (dealOrder[s].seat === humanSeat) humanDealt.push(deck[dealOrder[s].cardIndex]);
  }
  // Overlap the small cards enough that all 13 fit on a narrow screen.
  const stride = 20;

  return (
    <Pressable style={styles.overlay} onPress={onDone}>
      <View style={styles.oppRow}>
        {oppStacks.map((s) =>
          s < 0 ? null : (
            <View key={s} style={styles.oppSlot}>
              <Text style={styles.oppName}>{playerNames[s]}</Text>
              <OpponentCardStack count={Math.min(13, Math.floor((step + 3) / 4))} />
            </View>
          ),
        )}
      </View>
      <Text style={styles.dealingLabel}>Dealing…</Text>

      <View style={styles.dealHandRow}>
        {humanDealt.map((c, i) => (
          <View key={c.id} style={{ marginLeft: i === 0 ? 0 : -stride }}>
            <PlayingCard card={c} small />
          </View>
        ))}
      </View>

      <Animated.View style={[styles.flyingCard, { left: x, top: y, opacity }]}>
        <PlayingCard card={isHumanCard ? currentCard ?? undefined : undefined} faceDown={!isHumanCard} />
      </Animated.View>
      <Text style={styles.skipHintBottom}>Tap to skip</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: colors.felt,
    zIndex: 100,
  },
  shuffleBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deckStack: {
    width: 80,
    height: 110,
    marginBottom: 24,
  },
  deckCard: {
    position: 'absolute',
    width: 64,
    height: 92,
    borderRadius: 7,
    // Themed felt fallback shows through while card-back.png loads.
    backgroundColor: colors.felt,
    borderWidth: 2,
    borderColor: colors.cream,
    overflow: 'hidden',
  },
  deckCardImage: {
    width: 64,
    height: 92,
    borderRadius: 6,
  },
  shuffleText: {
    color: colors.textOnFelt,
    fontSize: 22,
    fontWeight: '600',
  },
  skipHint: {
    color: withAlpha(colors.white, 0.45),
    fontSize: 13,
    marginTop: 10,
  },
  skipHintBottom: {
    position: 'absolute',
    bottom: 24,
    left: 0, right: 0,
    textAlign: 'center',
    color: withAlpha(colors.white, 0.45),
    fontSize: 13,
  },
  oppRow: {
    position: 'absolute',
    top: 40,
    left: 0, right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
  },
  oppSlot: { alignItems: 'center' },
  oppName: { color: withAlpha(colors.white, 0.85), fontSize: 13, marginBottom: 4 },
  dealingLabel: {
    position: 'absolute',
    top: '50%',
    left: 0, right: 0,
    textAlign: 'center',
    color: withAlpha(colors.white, 0.5),
    fontSize: 14,
  },
  flyingCard: {
    position: 'absolute',
  },
  // The accumulating human hand, centered near the bottom where the real hand
  // fan will sit once play begins.
  dealHandRow: {
    position: 'absolute',
    bottom: 64,
    left: 0, right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
