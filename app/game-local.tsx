// Bot game screen. Renders the table with full Bicycle-style cards.
//
// Features:
//   - Dealing animation overlay (shuffle + deal). Human's card shows face-up
//     as it arrives.
//   - Opponent seats with stacked face-down card counts
//   - Center trick pile showing the last played combo as real cards
//   - Human hand: tap to select, drag to reorder (no long-press needed).
//     Selection persists across reorder.
//   - "Sort" button — cycles rank / suit / hands (playable-combo grouping)
//   - Playable-card highlighting: on your turn, cards that can't be part of
//     any legal play are dimmed. Selection-aware: once you select cards, only
//     cards that complete a legal play with them stay lit.
//   - Auto-pass: if nothing in hand can beat the lead, a banner shows and
//     the turn passes automatically.
//   - Live combo feedback: the toolbar names the selected combo and whether
//     it beats the lead; Play is only enabled for a legal play.
//   - Play / Pass actions centered as a single row directly below the hand
//   - Bot mode: no turn timer
//   - Round-complete screen with finish order

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DealingAnimation } from '../components/DealingAnimation';
import { OpponentCardStack, PlayingCard, CARD_WIDTH } from '../components/PlayingCard';
import { canPlay, detectCombo } from '../lib/pusoy/combo';
import { findLegalPlays } from '../lib/pusoy/bot';
import {
  createLocalGame,
  findHumanSeat,
  humanAct,
  reorderHumanHand,
  sortHumanHand,
  startGame,
  subscribe,
  type LocalGame,
  type SortMode,
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

function comboName(c: PlayedCombo): string {
  if (c.fiveType) {
    return c.fiveType === 'fourOfAKind' ? 'Four of a kind'
      : c.fiveType === 'fullHouse' ? 'Full house'
      : c.fiveType === 'flush' ? 'Flush'
      : c.fiveType === 'straightFlush' ? 'Straight flush'
      : 'Straight';
  }
  if (c.type === 'single') return 'Single';
  if (c.type === 'pair') return 'Pair';
  return 'Three of a kind';
}

function comboLabel(c: PlayedCombo): string {
  return `${comboName(c)} — ${c.cards.map(cardLabel).join(' ')}`;
}

const SORT_LABEL: Record<SortMode, string> = {
  rank: 'Rank',
  suit: 'Suit',
  hands: 'Hands',
};

const NEXT_SORT: Record<SortMode, SortMode> = {
  rank: 'suit',
  suit: 'hands',
  hands: 'rank',
};

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
  const [sortMode, setSortMode] = useState<SortMode | null>(null);
  const [autoPassing, setAutoPassing] = useState(false);

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

  // Auto-pass: on the human's turn, if nothing in hand can beat the lead,
  // show a banner briefly and pass automatically. Never fires when leading
  // (lead === null means anything is playable).
  useEffect(() => {
    if (!game || game.phase !== 'playing') return;
    const seat = findHumanSeat(game);
    if (game.handState.currentPlayerIndex !== seat) return;
    const leadCombo = game.handState.leadCombo;
    if (!leadCombo) return;
    if (findLegalPlays(game.hands[seat], leadCombo).length > 0) return;
    setAutoPassing(true);
    const t = setTimeout(() => {
      setAutoPassing(false);
      try {
        humanAct(game, { kind: 'pass' });
      } catch {
        // turn state changed under us; nothing to do
      }
    }, 1400);
    return () => {
      clearTimeout(t);
      setAutoPassing(false);
    };
  }, [game, tick]);

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

  // Legal plays for highlighting (my turn only). ~C(13,5) enumeration; cheap.
  const legalPlays = isMyTurn ? findLegalPlays(myHand, lead) : null;
  // Cards that can be part of a legal play. Selection-aware: once cards are
  // selected, only plays that CONTAIN the whole selection keep cards lit —
  // so selecting one 9 lights up exactly what combos with it.
  let playableIds: Set<string> | null = null;
  if (legalPlays) {
    const pool = selected.length
      ? legalPlays.filter((p) => selected.every((s) => p.cards.some((c) => c.id === s.id)))
      : legalPlays;
    playableIds = new Set<string>();
    for (const p of pool) for (const c of p.cards) playableIds.add(c.id);
  }

  const selCombo = selected.length ? detectCombo(selected) : null;
  const selLegal = !!selCombo && canPlay(selCombo, lead);
  const selFeedback = selected.length === 0
    ? `${myHand.length} cards`
    : !selCombo ? 'Not a combo'
    : !selLegal ? `${comboName(selCombo)}: doesn't beat lead`
    : `${comboName(selCombo)} ✓`;

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

  // Cycle sort mode: rank → suit → hands. Selection persists (card ids
  // don't change, only positions).
  const onOrganize = () => {
    const next = sortMode === null ? 'rank' : NEXT_SORT[sortMode];
    setSortMode(next);
    sortHumanHand(game, next);
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
        {autoPassing && (
          <Text style={styles.autoPass}>No playable hand, passing…</Text>
        )}
        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      {/* Bottom: hand + actions. Hand in the lower-center; Play/Pass centered directly under it. */}
      <View style={styles.bottom}>
        <View style={styles.handToolbar}>
          <Pressable style={styles.btnSmall} onPress={onOrganize}>
            <Text style={styles.btnSmallText}>
              {sortMode === null ? 'Sort' : `Sort: ${SORT_LABEL[sortMode]}`}
            </Text>
          </Pressable>
          <Text
            style={[
              styles.selLabel,
              selected.length > 0 && (selLegal ? styles.selOk : styles.selBad),
            ]}
          >
            {selFeedback}
          </Text>
        </View>

        <HandRow
          hand={myHand}
          selected={selected}
          playableIds={playableIds}
          onTap={toggleCard}
          onReorder={(from, to) => {
            reorderHumanHand(game, from, to);
            // selection persists: the card ids in `selected` are still in the hand
          }}
        />

        <View style={styles.actionsRow}>
          <View style={styles.actionsInner}>
            <Pressable
              style={[styles.btn, (!isMyTurn || !selLegal) && styles.btnDisabled]}
              disabled={!isMyTurn || !selLegal}
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

// HandRow: all 13 cards fanned across the screen width, centered. Each
// card is tappable to select. Cards are also draggable (no long-press) to
// reorder. The fan uses computed offsets so the entire hand is visible
// regardless of card count.
function HandRow({
  hand,
  selected,
  playableIds,
  onTap,
  onReorder,
}: {
  hand: Card[];
  selected: Card[];
  // Cards eligible for a legal play right now; null = no dimming (not my turn).
  playableIds: Set<string> | null;
  onTap: (c: Card) => void;
  onReorder: (from: number, to: number) => void;
}) {
  // Reactive: reflows the fan when the browser window resizes / device rotates.
  const { width } = useWindowDimensions();
  const SIDE_MARGIN = 12;
  // Total fan width: card width + (n-1) * stride. We pick a stride so the
  // fan fills the screen minus side margins.
  const available = width - SIDE_MARGIN * 2;
  const stride = hand.length > 1 ? Math.min(CARD_WIDTH, (available - CARD_WIDTH) / (hand.length - 1)) : 0;
  const totalWidth = CARD_WIDTH + stride * (hand.length - 1);
  // Center the fan horizontally inside the screen.
  const startX = (width - totalWidth) / 2;
  return (
    <View style={[styles.handFan, { height: CARD_WIDTH + 24 }]}>
      {hand.map((c, i) => (
        <DraggableCard
          key={c.id}
          card={c}
          isSelected={!!selected.find((s) => s.id === c.id)}
          isDimmed={playableIds !== null && !playableIds.has(c.id)}
          index={i}
          onTap={() => onTap(c)}
          onReorder={onReorder}
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
  total: number;
  startX: number;
  stride: number;
}) {
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [dragging, setDragging] = useState(false);
  // The "rest" position for this card in the fan.
  const restX = startX + index * stride;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) => {
          return Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8;
        },
        onPanResponderGrant: () => {
          setDragging(true);
        },
        onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
        onPanResponderRelease: (_, g) => {
          setDragging(false);
          const target = Math.max(0, Math.min(total - 1, index + Math.round(g.dx / Math.max(1, stride))));
          if (target !== index) onReorder(index, target);
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        },
        onPanResponderTerminate: () => {
          setDragging(false);
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        },
      }),
    [index, total, onReorder, pan, stride],
  );

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: restX,
        top: 12,
        transform: [{ translateX: pan.x }, { translateY: pan.y }],
        zIndex: dragging ? 100 : index,
      }}
      {...responder.panHandlers}
    >
      <Pressable onPress={onTap}>
        <PlayingCard card={card} selected={isSelected} dimmed={isDimmed && !isSelected} />
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
  autoPass: { color: '#f1c40f', marginTop: 10, fontWeight: '600' },

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
  selOk: { color: '#7bed9f', fontWeight: '700' },
  selBad: { color: '#ff8f8f', fontWeight: '600' },
  handFan: {
    // The hand is a fan of absolutely-positioned cards centered horizontally
    // on the screen. Height is set by the parent (HandRow) to match card
    // height + a bit of vertical padding for the lift animation.
    width: '100%',
    position: 'relative',
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
