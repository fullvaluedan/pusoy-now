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
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Image,
  ImageBackground,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { DealingAnimation } from '../components/DealingAnimation';
import { OpponentCardStack, PlayingCard, CARD_WIDTH } from '../components/PlayingCard';
import { canPlay, detectCombo } from '../lib/pusoy/combo';
import { findLegalPlays } from '../lib/pusoy/bot';
import { parseLevel } from '../lib/pusoy/level';
import { colors, radii, spacing, typography, withAlpha } from '../lib/theme';
import { useAuth } from '../lib/auth';
import {
  createLocalGame,
  findHumanSeat,
  humanAct,
  reorderHumanHand,
  skipToEnd,
  sortHumanHand,
  startGame,
  subscribe,
  type LocalGame,
  type SortMode,
} from '../lib/pusoy/localGame';
import type { BotLevel, Card, FiveCardType, PlayedCombo } from '../lib/pusoy/types';

const FELT_IMG = require('../assets/art/felt.png');
const BOT_AVATAR_IMG = require('../assets/art/bot-avatar.png');
const TABLE_INLAY_IMG = require('../assets/art/table-inlay.png');
const TURN_GLOW_IMG = require('../assets/art/turn-glow.png');

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

const FIVE_TYPE_LABEL: Record<FiveCardType, string> = {
  straight: 'Straight',
  flush: 'Flush',
  fullHouse: 'Full house',
  fourOfAKind: 'Four of a kind',
  straightFlush: 'Straight flush',
};

function comboName(c: PlayedCombo): string {
  if (c.fiveType) return FIVE_TYPE_LABEL[c.fiveType];
  if (c.type === 'single') return 'Single';
  if (c.type === 'pair') return 'Pair';
  return 'Three of a kind';
}

// The bullet marks whose turn it is; the check marks a player who is out.
function seatStatusSuffix(isCurrent: boolean, finished: boolean, passed: boolean): string {
  const turn = isCurrent && !finished ? ' •' : '';
  const state = finished ? ' ✓' : passed ? ' (pass)' : '';
  return turn + state;
}

function comboLabel(c: PlayedCombo): string {
  return `${comboName(c)} - ${c.cards.map(cardLabel).join(' ')}`;
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

const LEVEL_LABEL: Record<BotLevel, string> = {
  easy: 'Easy',
  normal: 'Normal',
  expert: 'Expert',
};

// The only place a seat is named. Bots carry their difficulty so the level the
// player picked stays visible for the whole game.
function seatName(game: LocalGame, seat: number, displayName: string): string {
  if (game.playerKinds[seat] === 'human') return displayName;
  return `Bot ${seat + 1} - ${LEVEL_LABEL[game.level]}`;
}

// Felt table backdrop shared by every phase of this screen (loading,
// dealing, in-progress, finished) so the game always sits on the same
// surface. The felt is a resolution-independent surface, not a stretched
// photo: a solid color base fills the root edge to edge (behind notches),
// the fixed-size photo lays over it at low opacity as a texture hint only
// (resizeMode="cover" always fully covers, so there's no crop gap, and low
// opacity hides the upscale pixelation at wide viewports), and a stacked
// border vignette darkens the edges like a real table under center
// lighting. The SafeAreaView nests inside all of that so content still
// clears the safe-area insets while the felt itself ignores them.
function TableBackground({ children }: { children: ReactNode }) {
  return (
    <View style={styles.tableBackground}>
      <ImageBackground
        source={FELT_IMG}
        style={styles.tableTexture}
        imageStyle={styles.tableTextureImage}
        resizeMode="cover"
      >
        <View style={styles.tableVignetteOuter} pointerEvents="none" />
        <View style={styles.tableVignetteMid} pointerEvents="none" />
        <View style={styles.tableVignetteInner} pointerEvents="none" />
        {/* Decorative gold table inlay, framing the play area. resizeMode
            "contain" cannot distort at any viewport; inset from the edges so it
            reads as a border; pointerEvents none so it never blocks a tap; low
            opacity so cards and text stay legible on top. */}
        <Image
          source={TABLE_INLAY_IMG}
          style={styles.tableInlay}
          resizeMode="contain"
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <SafeAreaView style={styles.container}>{children}</SafeAreaView>
      </ImageBackground>
    </View>
  );
}

// One seat in the top row. The human's plate omits the face-down stack, since
// they are already looking at those cards in their hand.
function SeatPlate({
  name,
  avatarUrl = null,
  avatarSource,
  isCurrent,
  finished,
  passed,
  count,
  showStack,
}: {
  name: string;
  avatarUrl?: string | null;
  avatarSource?: ImageSourcePropType;
  isCurrent: boolean;
  finished: boolean;
  passed: boolean;
  count: number;
  showStack: boolean;
}) {
  return (
    <View style={[styles.oppBox, isCurrent && styles.oppBoxActive, finished && styles.oppBoxDone]}>
      <Avatar
        name={name}
        url={avatarUrl}
        localSource={avatarSource}
        size={28}
        framed
        active={isCurrent && !finished}
        style={styles.oppAvatarMargin}
      />
      <Text style={styles.oppName} numberOfLines={1}>
        {name}
        {seatStatusSuffix(isCurrent, finished, passed)}
      </Text>
      <View style={styles.oppStackRow}>
        {showStack ? <OpponentCardStack count={count} small /> : null}
        <Text style={styles.oppCount}>{count}</Text>
      </View>
    </View>
  );
}

export default function LocalGameScreen() {
  const params = useLocalSearchParams<{ bots: string; level: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const botCount = Math.max(1, Math.min(3, Number(params.bots) || 3));
  const level = parseLevel(params.level);
  // A signed-in player sits at their own name; a guest is just "You".
  const humanDisplayName = profile?.displayName ?? 'You';

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
    const g = createLocalGame(botCount, 'You', level);
    setGame(g);
    const unsub = subscribe(g, () => setTick((t) => t + 1));
    return () => {
      unsub();
    };
  }, [botCount, level]);

  // Every legal play available to the human right now, or null when it is not
  // their turn. Leading enumerates all C(13,5) five-card subsets, so this is
  // memoized on the game state rather than recomputed on every tap: selecting a
  // card re-renders the screen but does not change what is legal.
  const legalPlays = useMemo(() => {
    if (!game || game.phase !== 'playing') return null;
    const seat = findHumanSeat(game);
    if (game.handState.currentPlayerIndex !== seat) return null;
    return findLegalPlays(game.hands[seat], game.handState.leadCombo);
    // `game` is mutated in place, so `tick` is what marks it dirty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, tick]);

  // Stable identity: every DraggableCard rebuilds its PanResponder whenever this
  // changes, so an inline arrow here would rebuild all 13 on every game tick.
  const handleReorder = useCallback(
    (from: number, to: number) => {
      if (!game) return;
      reorderHumanHand(game, from, to);
      // Selection persists: the card ids in `selected` are still in the hand.
    },
    [game],
  );

  // Auto-pass: on the human's turn, if nothing in hand can beat the lead,
  // show a banner briefly and pass automatically. Never fires when leading
  // (lead === null means anything is playable).
  useEffect(() => {
    if (!game || game.phase !== 'playing') return;
    if (!game.handState.leadCombo) return;
    if (legalPlays === null || legalPlays.length > 0) return;
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
  }, [game, tick, legalPlays]);

  // Auto-skip: once the human has emptied their hand, don't make them watch the
  // bots grind out the rest. Jump straight to the ranking. Fires once, since
  // skipToEnd flips the phase to 'finished'. A short delay lets the player see
  // their winning card land first.
  useEffect(() => {
    if (!game || game.phase !== 'playing') return;
    const seat = findHumanSeat(game);
    if (!game.handState.finishedOrder.includes(seat)) return;
    const t = setTimeout(() => {
      try {
        skipToEnd(game);
      } catch {
        // hand already finished under us; nothing to do
      }
    }, 700);
    return () => clearTimeout(t);
  }, [game, tick]);

  if (!game) {
    return (
      <TableBackground>
        <Text style={styles.loadingText}>Loading…</Text>
      </TableBackground>
    );
  }

  const humanSeat = findHumanSeat(game);
  const myHand = game.hands[humanSeat];

  // 1) Dealing animation overlay
  if (game.phase === 'dealing') {
    const playerNames = [0, 1, 2, 3].map((s) => seatName(game, s, humanDisplayName));
    return (
      <TableBackground>
        <DealingAnimation
          dealOrder={game.dealOrder}
          deck={game.deck}
          playerKinds={game.playerKinds}
          playerNames={playerNames}
          onDone={() => startGame(game)}
        />
      </TableBackground>
    );
  }

  // 2) Round-complete screen
  if (game.phase === 'finished' && game.finishedAt) {
    const youWon = game.finishOrder[0] === humanSeat;
    const youLast = game.finishOrder[game.finishOrder.length - 1] === humanSeat;
    return (
      <TableBackground>
        <View style={styles.finishCard}>
          <Text style={styles.finishHeadline}>
            {youWon ? 'You won!' : youLast ? 'You lost' : 'Hand over'}
          </Text>
          <Text style={styles.finishSub}>Finish order</Text>
          {game.finishOrder.map((s, i) => {
            const isHuman = s === humanSeat;
            const name = seatName(game, s, humanDisplayName);
            return (
              <View key={i} style={styles.finishRow}>
                <Text style={styles.finishPlace}>{i + 1}.</Text>
                <Avatar
                  name={name}
                  url={isHuman ? profile?.avatarUrl ?? null : null}
                  localSource={isHuman ? undefined : BOT_AVATAR_IMG}
                  size={24}
                  style={styles.finishAvatar}
                />
                <Text style={styles.finishName} numberOfLines={1}>
                  {name}
                </Text>
              </View>
            );
          })}
          <View style={styles.finishActions}>
            <Pressable
              style={styles.btn}
              onPress={() =>
                router.replace({ pathname: '/game-local', params: { bots: botCount, level } })
              }
            >
              <Text style={styles.btnText}>Play again</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnGhost]}
              onPress={() => router.replace('/')}
            >
              <Text style={[styles.btnText, styles.btnGhostText]}>Home</Text>
            </Pressable>
          </View>
        </View>
      </TableBackground>
    );
  }

  // 3) Game in progress
  const currentSeat = game.handState.currentPlayerIndex;
  const isMyTurn = currentSeat === humanSeat;
  const lead = game.handState.leadCombo;
  const lastPlay = game.trickHistory[0];

  // `legalPlays` (memoized above) is non-null exactly when it is our turn.
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

  // End the hand now. The human's remaining cards are played out by the AI, so
  // the ranking is a real finish order, not a forfeit.
  const onSkip = () => {
    setError(null);
    try {
      skipToEnd(game);
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
    <TableBackground>
      {/* Top: seat row, the human on the left and the opponents beside them */}
      <View style={styles.oppRow}>
        <SeatPlate
          name={humanDisplayName}
          avatarUrl={profile?.avatarUrl ?? null}
          isCurrent={currentSeat === humanSeat}
          finished={game.handState.finishedOrder.includes(humanSeat)}
          passed={game.handState.passed.includes(humanSeat)}
          count={game.hands[humanSeat].length}
          // No face-down stack: the player already sees these cards fanned out
          // in their hand. Just the count, for parity with the opponents.
          showStack={false}
        />

        {opponentOrder.map((seat) => (
          <SeatPlate
            key={seat}
            name={seatName(game, seat, humanDisplayName)}
            avatarSource={BOT_AVATAR_IMG}
            isCurrent={currentSeat === seat}
            finished={game.handState.finishedOrder.includes(seat)}
            passed={game.handState.passed.includes(seat)}
            count={game.hands[seat].length}
            showStack
          />
        ))}
      </View>

      {/* Center: trick pile */}
      <View style={styles.center}>
        {lastPlay ? (
          <View style={styles.trickBox}>
            <Text style={styles.trickLabel}>
              {seatName(game, lastPlay.playerIndex, humanDisplayName)} played
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
                ? 'Your turn - lead with a play'
                : `${seatName(game, currentSeat, humanDisplayName)} to lead`}
            </Text>
          </View>
        )}
        {autoPassing && (
          <Text style={styles.autoPass}>No playable hand, passing…</Text>
        )}
        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      {/* Bottom: hand + actions. Hand in the lower-center; Play/Pass centered directly under it. */}
      <View style={[styles.bottom, isMyTurn && styles.bottomActive]}>
        {/* Soft gold glow behind the hand while it is the player's turn. First
            child so it paints behind the toolbar/hand/actions; contain so it
            never distorts; pointerEvents none so it never blocks a tap. */}
        {isMyTurn && (
          <Image
            source={TURN_GLOW_IMG}
            style={styles.turnGlow}
            resizeMode="cover"
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        )}
        {isMyTurn && (
          <View style={styles.turnBanner} pointerEvents="none">
            <Text style={styles.turnBannerText}>Your turn</Text>
          </View>
        )}
        <View style={styles.handToolbar}>
          <View style={styles.handToolbarLeft}>
            <Pressable style={styles.btnSmall} onPress={onOrganize}>
              <Text style={styles.btnSmallText}>
                {sortMode === null ? 'Sort' : `Sort: ${SORT_LABEL[sortMode]}`}
              </Text>
            </Pressable>
            <Pressable style={styles.btnSmall} onPress={onSkip}>
              <Text style={styles.btnSmallText}>Skip to end</Text>
            </Pressable>
          </View>
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
          onReorder={handleReorder}
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
    </TableBackground>
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
  // Solid felt color base, filling the root so any moment the photo isn't
  // painted yet (or a viewport ratio the crop doesn't fully agree with)
  // still reads as felt rather than blank space.
  tableBackground: { flex: 1, backgroundColor: colors.felt },
  tableTexture: { flex: 1 },
  // Decorative gold inlay frame over the felt, behind the play content. Inset
  // from every edge so it reads as a table border; low opacity so it stays
  // subtle under the cards and text. resizeMode="contain" (set on the Image)
  // guarantees no distortion at any viewport.
  tableInlay: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    bottom: 8,
    width: undefined,
    height: undefined,
    opacity: 0.22,
    pointerEvents: 'none',
  },
  // Kept faint on purpose: this is a texture hint layered on the color
  // base, not the surface itself, so upscaling the single fixed-size photo
  // to a wide desktop viewport never reads as pixelated.
  tableTextureImage: { opacity: 0.3 },
  // Three concentric low-alpha frames stand in for a radial gradient (no
  // gradient lib in this project); alpha rises toward the outer band so the
  // edges darken gradually. The alpha steps stay under ~0.06 apart and the
  // bands wide, because a larger step reads as a stacked frame rather than
  // a vignette.
  tableVignetteOuter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 14,
    borderColor: withAlpha(colors.black, 0.16),
  },
  tableVignetteMid: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    bottom: 14,
    borderWidth: 24,
    borderColor: withAlpha(colors.black, 0.1),
  },
  tableVignetteInner: {
    position: 'absolute',
    top: 38,
    left: 38,
    right: 38,
    bottom: 38,
    borderWidth: 34,
    borderColor: withAlpha(colors.black, 0.04),
  },
  container: { flex: 1, backgroundColor: 'transparent' },
  loadingText: { color: colors.textOnFelt, textAlign: 'center', marginTop: spacing.xxl },

  // Opponents — each is a seat plate: avatar slot, name, count, state.
  oppRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  oppBox: {
    backgroundColor: withAlpha(colors.ink, 0.25),
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    alignItems: 'center',
    minWidth: 92,
  },
  oppBoxActive: {
    backgroundColor: withAlpha(colors.gold, 0.25),
    borderWidth: 1,
    borderColor: colors.gold,
  },
  oppBoxDone: { opacity: 0.55 },
  oppAvatarMargin: { marginBottom: spacing.xs },
  oppName: { color: colors.textOnFelt, fontSize: typography.tiny.fontSize, fontWeight: '600', marginBottom: spacing.xs },
  oppStackRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  oppCount: { color: colors.textOnFelt, fontSize: 18, fontWeight: '700' },

  // Center trick pile — a subtle inset "well" on the felt.
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.md },
  trickBox: {
    backgroundColor: withAlpha(colors.black, 0.3),
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: withAlpha(colors.black, 0.4),
    alignItems: 'center',
    minWidth: 240,
    maxWidth: 340,
  },
  trickLabel: { color: colors.textOnFeltMuted, fontSize: typography.tiny.fontSize, marginBottom: spacing.xs + 2 },
  trickCards: { flexDirection: 'row', justifyContent: 'center', marginBottom: spacing.xs + 2 },
  trickName: { color: colors.textOnFelt, fontSize: typography.label.fontSize, fontWeight: '600' },
  trickEmpty: { color: withAlpha(colors.white, 0.8), fontSize: typography.body.fontSize, paddingVertical: 30 },
  error: { color: colors.danger, marginTop: spacing.sm + 2, fontWeight: '600' },
  autoPass: { color: colors.gold, marginTop: spacing.sm + 2, fontWeight: '600' },

  // Bottom — hand in the lower-center, actions centered directly below
  bottom: {
    paddingBottom: spacing.md - 2,
    paddingTop: spacing.sm,
    borderTopWidth: 2,
    borderTopColor: 'transparent',
  },
  // Active-turn highlight on the whole hand area: a gold top edge plus a faint
  // gold wash, matching the seat-plate active state so the two read as one system.
  bottomActive: {
    borderTopColor: colors.gold,
    backgroundColor: withAlpha(colors.gold, 0.08),
  },
  // Radial gold glow art behind the hand on the player's turn. Fills the hand
  // area; low opacity so it reads as ambient light, not a solid block.
  turnGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: undefined,
    height: undefined,
    opacity: 0.5,
    pointerEvents: 'none',
  },
  turnBanner: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    backgroundColor: colors.gold,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
    borderRadius: 999,
    zIndex: 20,
  },
  turnBannerText: {
    color: colors.felt,
    fontSize: typography.tiny.fontSize,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  handToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg - 4,
    marginBottom: spacing.xs + 2,
  },
  handToolbarLeft: { flexDirection: 'row', gap: spacing.sm },
  selLabel: { color: colors.textOnFeltMuted, fontSize: typography.caption.fontSize },
  selOk: { color: colors.success, fontWeight: '700' },
  selBad: { color: colors.dangerLight, fontWeight: '600' },
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
    paddingHorizontal: spacing.lg - 4,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: withAlpha(colors.white, 0.1),
  },
  actionsInner: { flexDirection: 'row', gap: spacing.md - 2 },
  btn: {
    backgroundColor: colors.feltLight,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.xxl,
    borderRadius: radii.md,
  },
  btnPass: { backgroundColor: colors.neutral },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: colors.textOnFelt, fontWeight: '700', fontSize: 16 },
  btnSmall: {
    backgroundColor: withAlpha(colors.white, 0.15),
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm - 2,
    borderWidth: 1,
    borderColor: withAlpha(colors.white, 0.3),
  },
  btnSmallText: { color: colors.textOnFelt, fontWeight: '600', fontSize: typography.caption.fontSize },
  // The only ghost button sits on the cream finish card, not on the felt, so it
  // takes the dark ink. White-on-cream was effectively invisible.
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.felt },
  btnGhostText: { color: colors.felt },

  // Finish screen
  finishCard: {
    flex: 1,
    margin: spacing.lg - 4,
    backgroundColor: colors.cream,
    borderRadius: radii.lg,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishHeadline: { fontSize: 32, fontWeight: '800', color: colors.felt, marginBottom: spacing.sm },
  finishSub: { fontSize: typography.label.fontSize, color: colors.textMuted, marginBottom: spacing.lg - 4 },
  finishRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  finishPlace: { color: colors.felt, fontSize: 22, fontWeight: '700', width: 40 },
  finishAvatar: { marginRight: spacing.sm },
  finishName: { color: colors.textPrimary, fontSize: typography.subheading.fontSize - 2, flex: 1 },
  finishActions: { flexDirection: 'row', gap: spacing.md - 2, marginTop: spacing.xxl - 8 },
});
