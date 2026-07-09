// Dealing animation overlay. Renders a brief scene of cards flying from the
// center of the screen out to each player's seat. Pure RN Animated — no
// native deps.
//
// Sequence: for each of 52 steps, animate a face-down card from (0.5, 0.5) to
// the seat's position. Each step takes ~50ms; the whole animation ~2.6s.

import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, Text, View } from 'react-native';
import { OpponentCardStack, PlayingCard } from './PlayingCard';
import type { DealStep, LocalPlayer } from '../lib/pusoy/localGame';

const STEP_MS = 50;
const TOTAL_STEPS = 52;

interface Props {
  dealOrder: DealStep[];
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

export function DealingAnimation({ dealOrder, playerKinds, playerNames, onDone }: Props) {
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
      <View style={styles.overlay}>
        <View style={styles.shuffleBox}>
          <View style={styles.deckStack}>
            <View style={[styles.deckCard, { top: 0, left: 0 }]} />
            <View style={[styles.deckCard, { top: 2, left: 2 }]} />
            <View style={[styles.deckCard, { top: 4, left: 4 }]} />
            <View style={[styles.deckCard, { top: 6, left: 6 }]} />
          </View>
          <Text style={styles.shuffleText}>Shuffling…</Text>
        </View>
      </View>
    );
  }

  // Last 5 opponents' stack previews along the top, plus a "dealing" indicator
  const humanSeat = playerKinds.findIndex((k) => k === 'human');
  const oppStacks: number[] = [0, 1, 2, 3].map((s) => s === humanSeat ? -1 : s);
  return (
    <View style={styles.overlay}>
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
      <Animated.View style={[styles.flyingCard, { left: x, top: y, opacity }]}>
        <PlayingCard faceDown />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#0e4a3a',
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
    backgroundColor: '#1e4a8a',
    borderWidth: 2,
    borderColor: '#fff',
  },
  shuffleText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
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
  oppName: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginBottom: 4 },
  dealingLabel: {
    position: 'absolute',
    top: '50%',
    left: 0, right: 0,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  flyingCard: {
    position: 'absolute',
  },
});
