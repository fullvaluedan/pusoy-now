// Bot game screen. Renders the table with full Bicycle-style cards.
//
// Features:
//   - Dealing animation overlay (shuffle + deal). Human's card shows face-up
//     as it arrives.
//   - Opponent seats with stacked face-down card counts
//   - Center trick pile showing the last played combo as real cards
//   - Human hand: tap to select, drag to reorder (no long-press needed).
//     Selection persists across reorder.
//   - "Organize" button — auto-sort by rank/suit
//   - Play / Pass actions centered as a single row directly below the hand
//   - Bot mode: no turn timer
//   - Round-complete screen with finish order

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DealingAnimation } from '../components/DealingAnimation';
import { OpponentCardStack, PlayingCard } from '../components/PlayingCard';
import { canPlay, detectCombo } from '../lib/pusoy/combo';
import {
  createLocalGame,
  findHumanSeat,
  humanAct,
  reorderHumanHand,
  sortHumanHand,
  startGame,
  subscribe,
  type LocalGame,
} from '../lib/pusoy/localGame';
import type { Card, PlayedCombo } from '../lib/pusoy/types';

const RANK_DISPLAY: Record<Card['rank'], string> = {
  '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  '10': '10', J: 'J', Q: 'Q', K: 'K', A: 'A', '2': '2',
};
const SUIT_GLYPH: Record<Card['suit'], string> = {
  C: '♣', D: '♦', H: '♥', S: '♠',
};

function cardLabel(c: Card): string {
  return `${RANK_DISPLAY[c.rank]}${SUIT_GLYPH[c.suit]}`;
}

function comboLabel(c: PlayedCombo): string {
  if (c.fiveType) {
    const t = c.fiveType === 'fourOfAKind' ? 'Four of a kind'
      : c.fiveType === 'fullHouse' ? 'Full house'
      : c.fiveType === 'flush' ? 'Flush'
      : c.fiveType === 'straightFlush' ? 'Straight flush'
      : 'Straight';
    return `${t} — ${c.cards.map(cardLabel).join(' ')}`;
  }
  if (c.type === 'single') return `Single — ${c.cards.map(cardLabel).join(' ')}`;
  if (c.type === 'pair') return `Pair — ${c.cards.map(cardLabel).join(' ')}`;
  return `Three of a kind — ${c.cards.map(cardLabel).join(' ')}`;
}

function seatName(game: LocalGame, seat: number, displayName: string): string {
  if (game.playerKinds[seat] === 'human') return displayName;
  return `Bot ${seat + 1}`;
}

export default function LocalGameScreen() {
  const params = useLocalSearchParams<{ bots: string }>();
  const router = useRouter();
  const botCount = Math.max(1, Math.min(3, Number(params.bots) || 3));

  const [game, setGame] = useState<LocalGame | null>(null);
  // Re-render trigger on game state changes.
  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState<Card[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Create a new game when this screen mounts. The screen is re-mounted by
  // router.replace on "Play again", so this fires fresh each time and we
  // don't need to manually clean up the previous game.
  useEffect(() => {
    const g = createLocalGame(botCount, 'You');
    setGame(g);
    const unsub = subscribe(g, () => setTick((t) => t + 1));
    return () => {
      unsub();
    };
  }, [botCount]);

  if (!game) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loadingText}>Loading…</Text>
      </SafeAreaView>
    );
  }

  const humanSeat = findHumanSeat(game);
  const myHand = game.hands[humanSeat];

  // 1) Dealing animation overlay
  if (game.phase === 'dealing') {
    const playerNames = [0, 1, 2, 3].map((s) =>
      s === humanSeat ? 'You' : `Bot ${s + 1}`,
    );
    return (
      <SafeAreaView style={styles.container}>
        <DealingAnimation
          dealOrder={game.dealOrder}
          deck={game.deck}
          playerKinds={game.playerKinds}
          playerNames={playerNames}
          onDone={() => startGame(game)}
        />
      </SafeAreaView>
    );
  }

  // 2) Round-complete screen
  if (game.phase === 'finished' && game.finishedAt) {
    const youWon = game.finishOrder[0] === humanSeat;
    const youLast = game.finishOrder[game.finishOrder.length - 1] === humanSeat;
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.finishCard}>
          <Text style={styles.finishHeadline}>
            {youWon ? 'You won!' : youLast ? 'You lost' : 'Hand over'}
          </Text>
          <Text style={styles.finishSub}>Finish order</Text>
          {game.finishOrder.map((s, i) => (
            <View key={i} style={styles.finishRow}>
              <Text style={styles.finishPlace}>{i + 1}.</Text>
              <Text style={styles.finishName}>
                {s === humanSeat ? 'You' : `Bot ${s + 1}`}
              </Text>
            </View>
          ))}
          <View style={styles.finishActions}>
            <Pressable
              style={styles.btn}
              onPress={() =>
                router.replace({ pathname: '/game-local', params: { bots: botCount } })
              }
            >
              <Text style={styles.btnText}>Play again</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnGhost]}
              onPress={() => router.replace('/')}
            >
              <Text style={styles.btnText}>Home</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // 3) Game in progress
  const currentSeat = game.handState.currentPlayerIndex;
  const isMyTurn = currentSeat === humanSeat;
  const lead = game.handState.leadCombo;
  const lastPlay = game.trickHistory[0];

  const onPlay = () => {
    setError(null);
    if (selected.length === 0) {
      setError('Pick cards to play');
      return;
    }
    const combo = detectCombo(selected);
    if (!combo) {
      setError('Not a legal combo');
      return;
    }
    if (!canPlay(combo, lead)) {
      setError('That combo does not beat the lead');
      return;
    }
    try {
      humanAct(game, { kind: 'play', combo: { ...combo, cards: selected } as PlayedCombo }, selected);
      setSelected([]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onPass = () => {
    setError(null);
    try {
      humanAct(game, { kind: 'pass' });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onOrganize = () => {
    sortHumanHand(game);
    setSelected([]);
  };

  const toggleCard = (c: Card) => {
    setSelected((sel) => {
      if (sel.find((s) => s.id === c.id)) {
        return sel.filter((s) => s.id !== c.id);
      }
      return [...sel, c];
    });
  };

  // Compute opponent order: 0,1,2,3 starting at humanSeat+1
  const opponentOrder = [1, 2, 3].map((o) => (humanSeat + o) % 4);

  return (
    <SafeAreaView style={styles.container}>
      {/* Top: opponents row */}
      <View style={styles.oppRow}>
        {opponentOrder.map((seat) => {
          const isCurrent = currentSeat === seat;
          const finished = game.handState.finishedOrder.includes(seat);
          const passed = game.handState.passed.includes(seat);
          return (
            <View
              key={seat}
              style={[
                styles.oppBox,
                isCurrent && styles.oppBoxActive,
                finished && styles.oppBoxDone,
              ]}
            >
              <Text style={styles.oppName}>
                {seatName(game, seat, 'You')}
                {isCurrent && !finished ? ' •' : ''}
                {finished ? ' ✓' : passed ? ' (pass)' : ''}
              </Text>
              <View style={styles.oppStackRow}>
                <OpponentCardStack count={game.hands[seat].length} small />
                <Text style={styles.oppCount}>{game.hands[seat].length}</Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Center: trick pile */}
      <View style={styles.center}>
        {lastPlay ? (
          <View style={styles.trickBox}>
            <Text style={styles.trickLabel}>
              {seatName(game, lastPlay.playerIndex, 'You')} played
            </Text>
            <View style={styles.trickCards}>
              {lastPlay.combo.cards.map((c, i) => (
                <View key={c.id} style={{ marginLeft: i === 0 ? 0 : -28, zIndex: 10 + i }}>
                  <PlayingCard card={c} />
                </View>
              ))}
            </View>
            <Text style={styles.trickName}>{comboLabel(lastPlay.combo)}</Text>
          </View>
        ) : (
          <View style={styles.trickBox}>
            <Text style={styles.trickEmpty}>
              {isMyTurn
                ? 'Your turn — lead with a play'
                : `${seatName(game, currentSeat, 'You')} to lead`}
            </Text>
          </View>
        )}
        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      {/* Bottom: hand + actions. Hand in the lower-center; Play/Pass centered directly under it. */}
      <View style={styles.bottom}>
        <View style={styles.handToolbar}>
          <Pressable style={styles.btnSmall} onPress={onOrganize}>
            <Text style={styles.btnSmallText}>Organize</Text>
          </Pressable>
          <Text style={styles.selLabel}>
            {selected.length === 0
              ? `${myHand.length} cards`
              : `${selected.length} selected`}
          </Text>
        </View>

        <HandRow
          hand={myHand}
          selected={selected}
          onTap={toggleCard}
          onReorder={(from, to) => {
            reorderHumanHand(game, from, to);
            // selection persists: the card ids in `selected` are still in the hand
          }}
        />

        <View style={styles.actionsRow}>
          <View style={styles.actionsInner}>
            <Pressable
              style={[styles.btn, !isMyTurn && styles.btnDisabled]}
              disabled={!isMyTurn}
              onPress={onPlay}
            >
              <Text style={styles.btnText}>Play</Text>
            </Pressable>
            <Pressable
              style={[
                styles.btn,
                styles.btnPass,
                (!isMyTurn || lead === null) && styles.btnDisabled,
              ]}
              disabled={!isMyTurn || lead === null}
              onPress={onPass}
            >
              <Text style={styles.btnText}>Pass</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

// HandRow: a horizontally scrollable row of cards. Each card is tappable to
// select. Cards are also draggable (no long-press — engage on any movement
// past 8px) to reorder.
function HandRow({
  hand,
  selected,
  onTap,
  onReorder,
}: {
  hand: Card[];
  selected: Card[];
  onTap: (c: Card) => void;
  onReorder: (from: number, to: number) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.handScroll}
    >
      {hand.map((c, i) => (
        <DraggableCard
          key={c.id}
          card={c}
          isSelected={!!selected.find((s) => s.id === c.id)}
          index={i}
          onTap={() => onTap(c)}
          onReorder={onReorder}
          total={hand.length}
        />
      ))}
    </ScrollView>
  );
}

function DraggableCard({
  card,
  isSelected,
  index,
  onTap,
  onReorder,
  total,
}: {
  card: Card;
  isSelected: boolean;
  index: number;
  onTap: () => void;
  onReorder: (from: number, to: number) => void;
  total: number;
}) {
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [dragging, setDragging] = useState(false);

  // SLOT is the visual width of each card slot (the card itself is 64px
  // wide but the ScrollView places them with a -28px margin overlap, so the
  // effective stride is 36px). Tuned to feel right when dragging.
  const SLOT = 36;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) => {
          // engage drag on any movement past 8px (no long-press needed)
          return Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8;
        },
        onPanResponderGrant: () => {
          setDragging(true);
        },
        onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
        onPanResponderRelease: (_, g) => {
          setDragging(false);
          const target = Math.max(0, Math.min(total - 1, index + Math.round(g.dx / SLOT)));
          if (target !== index) onReorder(index, target);
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        },
        onPanResponderTerminate: () => {
          setDragging(false);
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        },
      }),
    [index, total, onReorder, pan, SLOT],
  );

  return (
    <Animated.View
      style={{
        transform: [{ translateX: pan.x }, { translateY: pan.y }],
        zIndex: dragging ? 100 : 1,
      }}
      {...responder.panHandlers}
    >
      <Pressable onPress={onTap}>
        <View style={{ marginRight: -28 }}>
          <PlayingCard card={card} selected={isSelected} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0e4a3a' },
  loadingText: { color: '#fff', textAlign: 'center', marginTop: 40 },

  // Opponents
  oppRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  oppBox: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    minWidth: 90,
  },
  oppBoxActive: {
    backgroundColor: 'rgba(241,196,15,0.25)',
    borderWidth: 1,
    borderColor: '#f1c40f',
  },
  oppBoxDone: { opacity: 0.55 },
  oppName: { color: '#fff', fontSize: 12, fontWeight: '600', marginBottom: 4 },
  oppStackRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  oppCount: { color: '#fff', fontSize: 18, fontWeight: '700' },

  // Center trick pile
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12 },
  trickBox: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    minWidth: 240,
    maxWidth: 340,
  },
  trickLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginBottom: 6 },
  trickCards: { flexDirection: 'row', justifyContent: 'center', marginBottom: 6 },
  trickName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  trickEmpty: { color: 'rgba(255,255,255,0.8)', fontSize: 16, paddingVertical: 30 },
  error: { color: '#ff6b6b', marginTop: 10, fontWeight: '600' },

  // Bottom — hand in the lower-center, actions centered directly below
  bottom: { paddingBottom: 12 },
  handToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  selLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  handScroll: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  actionsInner: { flexDirection: 'row', gap: 12 },
  btn: {
    backgroundColor: '#1c7a5d',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 10,
  },
  btnPass: { backgroundColor: '#7f8c8d' },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnSmall: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  btnSmallText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#fff' },

  // Finish screen
  finishCard: {
    flex: 1,
    margin: 16,
    backgroundColor: '#f4f1e8',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishHeadline: { fontSize: 32, fontWeight: '800', color: '#0e4a3a', marginBottom: 8 },
  finishSub: { fontSize: 14, color: '#666', marginBottom: 16 },
  finishRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  finishPlace: { color: '#0e4a3a', fontSize: 22, fontWeight: '700', width: 40 },
  finishName: { color: '#222', fontSize: 18 },
  finishActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
});
