// Dealing animation overlay. Renders a brief scene of cards flying from the
// center of the screen out to each player's seat. Pure RN Animated — no
// native deps.
//
// Sequence: for each dealt card, animate a face-down card from (0.5, 0.5) to
// the seat's position. Each step takes ~50ms.
//
// Two modes share one animation machine:
//   - bot mode (default): driven by a real dealOrder + full deck. The human's
//     card shows face-up as it arrives; the rest fly face-down. UNCHANGED from
//     the original single-mode component.
//   - online mode (mode="online"): the client never has the full deck (the
//     server redacts it), so the sequence is SYNTHESIZED from the viewer's own
//     cards + per-seat counts (lib/onlineDeal). The viewer's real cards arrive
//     face-up; every opponent card is an unknown face-down placeholder. The
//     accumulating face-up hand still uses the exact shared fan geometry, so the
//     deal-to-live-table switch moves nothing.

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
import { buildOnlineDealOrder } from '../lib/onlineDeal';
import type { Card } from '../lib/pusoy/types';
import type { DealStep, LocalPlayer } from '../lib/pusoy/localGame';

const CARD_BACK_IMG = require('../assets/art/card-back.png');

const STEP_MS = 50;

interface Props {
  // Shared.
  playerNames: string[];
  onDone: () => void;
  // Bot mode (the default). The full deck + deal order + seat kinds.
  dealOrder?: DealStep[];
  deck?: Card[];
  playerKinds?: LocalPlayer[];
  // Online mode. Set mode="online" and supply the viewer's own cards + the
  // per-seat card counts; the deal sequence is synthesized from them.
  mode?: 'online';
  yourSeat?: number;
  yourCards?: Card[];
  seatCounts?: number[];
}

// One normalized deal step, mode-agnostic: the seat it goes to, and the real
// card to show (non-null only for the viewer's own face-up cards).
interface NormStep {
  seat: number;
  card: Card | null;
}

// Seat positions as fractions of the screen (0..1, 0..1). These match the
// positions the game table uses:
//   - top-left, top-right: 2 opponents
//   - bottom-center: human
function seatFraction(seat: number, humanSeat: number, total: number): { x: number; y: number } {
  // Layout: human at bottom center. Other seats fan above (left, top, right).
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

export function DealingAnimation({
  playerNames,
  onDone,
  dealOrder,
  deck,
  playerKinds,
  mode,
  yourSeat,
  yourCards,
  seatCounts,
}: Props) {
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

  // Freeze the deal sequence, human seat, and seat total ONCE at mount. In
  // online mode the source props (view.yourHand etc.) can get a fresh identity
  // on any server state update; freezing here keeps the animation from
  // restarting under it. Bot-mode inputs are already stable, so this is a no-op
  // for them.
  const isOnline = mode === 'online';
  const frozen = useRef<{ steps: NormStep[]; humanSeat: number; seatTotal: number } | null>(null);
  if (frozen.current === null) {
    if (isOnline) {
      const humanSeat = yourSeat ?? 0;
      const seatTotal = seatCounts?.length ?? 4;
      const steps = buildOnlineDealOrder(humanSeat, yourCards ?? [], seatCounts ?? []).map(
        (s): NormStep => ({ seat: s.seat, card: s.card }),
      );
      frozen.current = { steps, humanSeat, seatTotal };
    } else {
      const d = dealOrder ?? [];
      const dk = deck ?? [];
      const steps = d.map((step): NormStep => ({ seat: step.seat, card: dk[step.cardIndex] ?? null }));
      const humanSeat = (playerKinds ?? []).findIndex((k) => k === 'human');
      frozen.current = { steps, humanSeat, seatTotal: 4 };
    }
  }
  const { steps, humanSeat, seatTotal } = frozen.current;
  const totalSteps = steps.length;

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

  // Dealing phase. Waits for the panel box to be measured so the flight
  // geometry is relative to the panel, not the window.
  useEffect(() => {
    if (showShuffle || !box) return;
    if (step >= totalSteps) {
      const t = setTimeout(onDone, 350);
      return () => clearTimeout(t);
    }
    if (step === 0) {
      // Anchor the first card at the panel center before it flies out.
      x.setValue(box.w * 0.5 - CARD_WIDTH / 2);
      y.setValue(box.h * 0.5 - CARD_HEIGHT / 2);
    }
    const next = steps[step];
    const target = seatFraction(next.seat, humanSeat, seatTotal);
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
  }, [step, showShuffle, box, steps, humanSeat, seatTotal, totalSteps, x, y, opacity, onDone]);

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

  // Opponent seats to render a face-down stack for: every seat except the human.
  const oppSeats: number[] = [];
  for (let s = 0; s < seatTotal; s++) if (s !== humanSeat) oppSeats.push(s);

  // Cards dealt to a seat so far (up to but not including the in-flight step).
  // Bot mode keeps the original 4-seat round-robin approximation so its visuals
  // are byte-identical; online mode counts exactly (seat counts can be uneven).
  const dealtCountForSeat = (seat: number): number => {
    if (!isOnline) return Math.min(13, Math.floor((step + 3) / 4));
    let n = 0;
    for (let i = 0; i < step && i < steps.length; i++) if (steps[i].seat === seat) n++;
    return n;
  };

  const currentStep = steps[step];
  const currentCard = currentStep ? currentStep.card : null;
  const isHumanCard = currentStep?.seat === humanSeat;

  // The human's cards that have already landed (steps before the one now in
  // flight). They accumulate face-up, full size, in the same fanned layout the
  // real hand uses, so the player watches their actual playing hand fill and
  // the cards stay put when the deal ends and the live hand takes over.
  const humanDealt: Card[] = [];
  for (let s = 0; s < step && s < steps.length; s++) {
    if (steps[s].seat === humanSeat && steps[s].card) humanDealt.push(steps[s].card as Card);
  }
  // Fan math is the exact same shared helper HandRow uses (see
  // components/PlayingCard.tsx: fanRowLayout/fanCardArc) so each dealt card
  // lands in the final position -- and arc lift/tilt -- the live hand will
  // render it in, rather than shifting or flattening out when play begins.
  const totalHumanCards = steps.reduce((n, s) => (s.seat === humanSeat ? n + 1 : n), 0);
  const fanWidth = Math.min(windowWidth, layout.maxTableWidth);
  const { stride, startX: fanStartX } = fanRowLayout(totalHumanCards, fanWidth);

  return (
    <Pressable style={styles.overlay} onPress={onDone} onLayout={onLayout}>
      <View style={styles.oppRow}>
        {oppSeats.map((s) => (
          <View key={s} style={styles.oppSlot}>
            <Text style={styles.oppName}>{playerNames[s]}</Text>
            <OpponentCardStack count={dealtCountForSeat(s)} />
          </View>
        ))}
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
