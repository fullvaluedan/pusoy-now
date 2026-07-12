// Dealing animation overlay. Renders a brief scene of cards flying from the
// center of the screen out to each player's seat. Pure RN Animated — no
// native deps.
//
// Sequence: for each of 52 steps, animate a face-down card from (0.5, 0.5) to
// the seat's position. Each step takes ~50ms; the whole animation ~2.6s.

import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import {
  OpponentCardStack,
  PlayingCard,
  CARD_WIDTH,
  CARD_HEIGHT,
  fanRowLayout,
  fanCardArc,
} from './PlayingCard';
import {
  COMPACT_PANEL_HEIGHT,
  HAND_FAN_BOTTOM,
  HAND_FAN_BOTTOM_COMPACT,
  HAND_FAN_CARD_TOP,
  HAND_FAN_CONTAINER_HEIGHT,
  usablePanelHeight,
} from './table';
import { colors, layout, withAlpha } from '../lib/theme';
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
  // Dealing renders as panel content, so every fly target and the shuffle /
  // center anchor derive from the measured panel box, not the full window.
  // This keeps the seats and the in-flight card inside the panel instead of
  // flinging them to window corners (the old Dimensions.get('window') defect).
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  // Same compact-mode budget app/game-local.tsx derives the live table's
  // `bottom` section from, so the accumulating hand's bottom offset (below)
  // matches whichever layout (roomy or compact) the live HandRow will render
  // in once dealing ends.
  const compact = usablePanelHeight(windowHeight, windowWidth > layout.maxTableWidth) < COMPACT_PANEL_HEIGHT;
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [step, setStep] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const [showShuffle, setShowShuffle] = useState(true);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((b) => (b && b.w === width && b.h === height ? b : { w: width, h: height }));
  };

  // Shuffle phase: deck bobs for 800ms, then fades
  useEffect(() => {
    const t = setTimeout(() => setShowShuffle(false), 900);
    return () => clearTimeout(t);
  }, []);

  // Dealing phase: 52 steps. Waits for the panel box to be measured so the
  // flight geometry is relative to the panel, not the window.
  useEffect(() => {
    if (showShuffle || !box) return;
    if (step >= TOTAL_STEPS) {
      const t = setTimeout(onDone, 350);
      return () => clearTimeout(t);
    }
    if (step === 0) {
      // Anchor the first card at the panel center before it flies out.
      x.setValue(box.w * 0.5 - CARD_WIDTH / 2);
      y.setValue(box.h * 0.5 - CARD_HEIGHT / 2);
    }
    const humanSeat = playerKinds.findIndex((k) => k === 'human');
    const next = dealOrder[step];
    const target = seatFraction(next.seat, humanSeat, 4);
    Animated.parallel([
      Animated.timing(x, {
        toValue: target.x * box.w - CARD_WIDTH / 2,
        duration: STEP_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(y, {
        toValue: target.y * box.h - CARD_HEIGHT / 2,
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
  }, [step, showShuffle, box, dealOrder, playerKinds, x, y, opacity, onDone]);

  if (showShuffle) {
    return (
      <Pressable style={styles.overlay} onPress={onDone} onLayout={onLayout}>
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
  // flight). They accumulate face-up, full size, in the same fanned layout the
  // real hand uses, so the player watches their actual playing hand fill and
  // the cards stay put when the deal ends and the live hand takes over.
  const humanDealt: import('../lib/pusoy/types').Card[] = [];
  for (let s = 0; s < step; s++) {
    if (dealOrder[s].seat === humanSeat) humanDealt.push(deck[dealOrder[s].cardIndex]);
  }
  // Fan math is the exact same shared helper HandRow uses (see
  // components/PlayingCard.tsx: fanRowLayout/fanCardArc) so each dealt card
  // lands in the final position -- and arc lift/tilt -- the live hand will
  // render it in, rather than shifting or flattening out when play begins.
  const totalHumanCards = dealOrder.reduce((n, d) => (d.seat === humanSeat ? n + 1 : n), 0);
  const fanWidth = Math.min(windowWidth, layout.maxTableWidth);
  const { stride, startX: fanStartX } = fanRowLayout(totalHumanCards, fanWidth);

  return (
    <Pressable style={styles.overlay} onPress={onDone} onLayout={onLayout}>
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

      <View
        style={[
          styles.dealHandFan,
          {
            height: HAND_FAN_CONTAINER_HEIGHT,
            bottom: compact ? HAND_FAN_BOTTOM_COMPACT : HAND_FAN_BOTTOM,
          },
        ]}
      >
        {humanDealt.map((c, i) => {
          const arc = fanCardArc(i, totalHumanCards);
          return (
            <View
              key={c.id}
              style={{
                position: 'absolute',
                left: fanStartX + i * stride,
                // Top-anchored at the exact same inset HandRow's DraggableCard
                // rests at, inside a container of the exact same height --
                // see components/table/HandRow.tsx. This is what makes the
                // deal-to-play switch move nothing.
                top: HAND_FAN_CARD_TOP,
                transform: [{ translateY: arc.translateY }, { rotate: `${arc.rotateDeg}deg` }],
              }}
            >
              <PlayingCard card={c} />
            </View>
          );
        })}
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
  // The accumulating full-size human hand. height/bottom are set inline to
  // HAND_FAN_CONTAINER_HEIGHT / HAND_FAN_BOTTOM(_COMPACT) -- the exact same
  // container geometry the live HandRow uses (components/table/HandRow.tsx,
  // components/table/layout.ts) -- so the fan sits at the precise spot the
  // real hand fan will occupy once play begins, and nothing shifts.
  dealHandFan: {
    position: 'absolute',
    left: 0, right: 0,
  },
});
