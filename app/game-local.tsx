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
import { OpponentCardStack, PlayingCard, CARD_WIDTH, CARD_HEIGHT } from '../components/PlayingCard';
import { canPlay, detectCombo } from '../lib/pusoy/combo';
import { SUIT_VALUE } from '../lib/pusoy/deck';
import { findLegalPlays } from '../lib/pusoy/bot';
import { parseLevel } from '../lib/pusoy/level';
import { recordGame } from '../lib/stats';
import { colors, layout, radii, spacing, typography, withAlpha } from '../lib/theme';
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

const FELT_IMG = require('../assets/art/felt-tile.png');
const BOT_AVATAR_IMG = require('../assets/art/bot-avatar.png');
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

const PLACE_LABEL = ['1st', '2nd', '3rd', '4th'];

// Small status chip on a seat: PASS while sitting out the trick, or the
// finishing place once out of cards. Turn state is carried by the gold ring
// and plate glow, not text.
function SeatChip({ passed, place }: { passed: boolean; place: number | null }) {
  if (place !== null) {
    return (
      <View style={[styles.seatChip, styles.seatChipPlace]}>
        <Text style={styles.seatChipPlaceText}>{PLACE_LABEL[place - 1]}</Text>
      </View>
    );
  }
  if (passed) {
    return (
      <View style={[styles.seatChip, styles.seatChipPass]}>
        <Text style={styles.seatChipPassText}>PASS</Text>
      </View>
    );
  }
  return null;
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

// The only place a seat is named. Names stay short; the table's difficulty
// lives once in the top bar instead of repeating on every plate.
function seatName(game: LocalGame, seat: number, displayName: string): string {
  if (game.playerKinds[seat] === 'human') return displayName;
  return `Bot ${seat + 1}`;
}

// Bounded table panel shared by every phase of this screen (loading,
// dealing, in-progress, finished) so the game always sits on the same
// surface. A flat dark backdrop fills the window; inside it a centered panel
// (capped to maxTableWidth, inset by panelMargin on desktop, rounded, framed
// with a code-drawn double gold border, and drop-shadowed) clips its
// children. The felt tile and vignette live inside the panel so decoration
// and content share one box and compose at every window size. On narrow
// viewports the panel goes full-bleed (margin and corners collapse). The
// SafeAreaView nests inside so content clears the safe-area insets while the
// felt itself fills the panel edge to edge.
function TablePanel({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  const isWide = width > layout.maxTableWidth;
  const vMargin = isWide ? layout.panelMargin : 0;
  const radius = isWide ? layout.panelRadius : 0;
  // Cap the panel height so it does not stretch to fill a tall window; the
  // backdrop centers it vertically, giving equal breathing room above and
  // below. On short/narrow windows this resolves to the full available height
  // (effectively full-screen).
  const panelHeight = Math.min(height - vMargin * 2, layout.maxTableHeight);
  return (
    <View style={styles.backdrop}>
      <View
        style={[
          styles.panelShadow,
          { height: panelHeight, borderRadius: radius },
        ]}
      >
        <View style={[styles.panel, { borderRadius: radius }]}>
          <ImageBackground
            source={FELT_IMG}
            style={styles.panelFelt}
            imageStyle={styles.panelFeltImage}
            resizeMode="repeat"
          >
            <View style={styles.tableVignetteOuter} pointerEvents="none" />
            <View style={styles.tableVignetteMid} pointerEvents="none" />
            <View style={styles.tableVignetteInner} pointerEvents="none" />
            {/* Inner gold hairline, inset from the panel's outer gold edge, so
                the frame reads as a classic double-line table border. Drawn in
                code (not the fixed-aspect inlay PNG) so it hugs the panel at
                any size. pointerEvents none so it never blocks a tap. */}
            <View
              style={[styles.panelInnerFrame, { borderRadius: Math.max(0, radius - 6) }]}
              pointerEvents="none"
            />
            <SafeAreaView style={styles.container}>{children}</SafeAreaView>
          </ImageBackground>
        </View>
      </View>
    </View>
  );
}

// One opponent seat around the top arc of the table. The human has no plate
// here; their seat is merged into the hand area at the bottom.
function SeatPlate({
  name,
  avatarUrl = null,
  avatarSource,
  isCurrent,
  place,
  passed,
  count,
  raised,
}: {
  name: string;
  avatarUrl?: string | null;
  avatarSource?: ImageSourcePropType;
  isCurrent: boolean;
  // 1-based finishing place once out of cards, else null.
  place: number | null;
  passed: boolean;
  count: number;
  // The middle seat sits higher than the two flanking it, arcing the seats
  // around the table instead of lining them up.
  raised: boolean;
}) {
  const finished = place !== null;
  return (
    <View
      style={[
        styles.oppBox,
        raised ? styles.oppBoxRaised : null,
        isCurrent && styles.oppBoxActive,
        finished && styles.oppBoxDone,
      ]}
    >
      <Avatar
        name={name}
        url={avatarUrl}
        localSource={avatarSource}
        size={48}
        framed
        active={isCurrent && !finished}
        style={styles.oppAvatarMargin}
      />
      <View style={styles.oppNameRow}>
        <Text style={styles.oppName} numberOfLines={1}>{name}</Text>
        <SeatChip passed={passed} place={place} />
      </View>
      <View style={styles.oppStackRow}>
        <OpponentCardStack count={count} small />
        <Text style={styles.oppCount}>{count}</Text>
      </View>
    </View>
  );
}

// Slim in-table top bar: back, the table's difficulty, and (during play) the
// skip control. Replaces the stock navigation header, which clashed with the
// felt and wasted a full bar of vertical space.
function TopBar({
  title,
  onBack,
  onSkip,
}: {
  title: string;
  onBack: () => void;
  onSkip?: () => void;
}) {
  return (
    <View style={styles.topBar}>
      <Pressable onPress={onBack} hitSlop={12} style={styles.topBarSide}>
        <Text style={styles.topBarBack}>{'←'}</Text>
      </Pressable>
      <Text style={styles.topBarTitle}>{title}</Text>
      <View style={[styles.topBarSide, styles.topBarRight]}>
        {onSkip ? (
          <Pressable style={styles.btnSmall} onPress={onSkip}>
            <Text style={styles.btnSmallText} numberOfLines={1}>Skip to end</Text>
          </Pressable>
        ) : null}
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

  // Record the finished game on the scoreboard exactly once, unless the player
  // bailed out with the manual Skip to end button. A legitimate finish (played
  // through, or auto-skipped after emptying the hand) counts.
  const recordedRef = useRef(false);
  useEffect(() => {
    if (!game || game.phase !== 'finished' || recordedRef.current) return;
    recordedRef.current = true;
    if (game.abandonedByUser) return;
    const seat = findHumanSeat(game);
    const rank = game.finishOrder.indexOf(seat) + 1;
    if (rank >= 1 && rank <= 4) void recordGame(game.level, rank);
  }, [game, tick]);

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
      <TablePanel>
        <Text style={styles.loadingText}>Loading…</Text>
      </TablePanel>
    );
  }

  const humanSeat = findHumanSeat(game);
  const myHand = game.hands[humanSeat];

  // 1) Dealing animation overlay
  if (game.phase === 'dealing') {
    const playerNames = [0, 1, 2, 3].map((s) => seatName(game, s, humanDisplayName));
    return (
      <TablePanel>
        <DealingAnimation
          dealOrder={game.dealOrder}
          deck={game.deck}
          playerKinds={game.playerKinds}
          playerNames={playerNames}
          onDone={() => startGame(game)}
        />
      </TablePanel>
    );
  }

  // 2) Round-complete screen
  if (game.phase === 'finished' && game.finishedAt) {
    const youWon = game.finishOrder[0] === humanSeat;
    const youLast = game.finishOrder[game.finishOrder.length - 1] === humanSeat;
    return (
      <TablePanel>
        <View style={styles.tableColumn}>
        <TopBar
          title={`${LEVEL_LABEL[game.level]} table`}
          onBack={() => router.replace('/')}
        />
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
        </View>
      </TablePanel>
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

  // Selection-independent eligibility: every card that appears in any legal
  // play right now. Used to gate taps — when a hand type is established you can
  // only pick cards that could actually beat it.
  let eligibleIds: Set<string> | null = null;
  if (legalPlays) {
    eligibleIds = new Set<string>();
    for (const p of legalPlays) for (const c of p.cards) eligibleIds.add(c.id);
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
  // the ranking is a real finish order, not a forfeit. Pressing this while still
  // holding cards is a bail-out and must not count on the scoreboard.
  const onSkip = () => {
    setError(null);
    try {
      if (!game.handState.finishedOrder.includes(humanSeat)) {
        game.abandonedByUser = true;
      }
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

  // Tapping a card selects it, with behavior that depends on the established
  // hand type so the player can't build an illegal or wrong-shaped play:
  //   - not our turn / ineligible card: ignored
  //   - leading (no lead yet): free multi-select to build any combo
  //   - single lead: one card, tapping another replaces it
  //   - pair lead: auto-picks the whole pair of that rank (lowest suits first)
  //   - 5-card lead: manual multi-select, capped at five
  const toggleCard = (c: Card) => {
    if (eligibleIds && !eligibleIds.has(c.id)) return;

    if (!lead) {
      setSelected((sel) =>
        sel.find((s) => s.id === c.id) ? sel.filter((s) => s.id !== c.id) : [...sel, c],
      );
      return;
    }
    if (lead.length === 1) {
      setSelected((sel) => (sel.length === 1 && sel[0].id === c.id ? [] : [c]));
      return;
    }
    if (lead.length === 2) {
      setSelected((sel) => {
        if (sel.length === 2 && sel[0].rank === c.rank) return [];
        const pairs = (legalPlays ?? []).filter(
          (p) => p.length === 2 && p.cards[0].rank === c.rank,
        );
        if (pairs.length === 0) return sel;
        // Lowest-suit priority: shed the weakest legal pair of this rank first.
        pairs.sort(
          (a, b) =>
            Math.max(SUIT_VALUE[a.cards[0].suit], SUIT_VALUE[a.cards[1].suit]) -
            Math.max(SUIT_VALUE[b.cards[0].suit], SUIT_VALUE[b.cards[1].suit]),
        );
        return pairs[0].cards;
      });
      return;
    }
    // 5-card lead: manual multi-select, capped at five.
    setSelected((sel) => {
      if (sel.find((s) => s.id === c.id)) return sel.filter((s) => s.id !== c.id);
      if (sel.length >= 5) return sel;
      return [...sel, c];
    });
  };

  // Dragging a card into the center plays a hand automatically, but only when a
  // hand type is already established (there is a lead). A single-lead drag plays
  // that single; a pair-lead drag plays the matching pair (lowest suits); a
  // 5-card-lead drag plays the current five-card selection if it is legal. When
  // leading (no lead yet) a drag never auto-plays — the player builds the combo
  // and presses Play. A drag that would not be a legal play is ignored.
  const playByDrag = (c: Card) => {
    if (!isMyTurn || !lead) return;
    let cards: Card[] | null = null;
    if (lead.length === 1) {
      const single = detectCombo([c]);
      if (single && canPlay(single, lead)) cards = [c];
    } else if (lead.length === 2) {
      const pairs = (legalPlays ?? []).filter(
        (p) => p.length === 2 && p.cards[0].rank === c.rank,
      );
      if (pairs.length) {
        pairs.sort(
          (a, b) =>
            Math.max(SUIT_VALUE[a.cards[0].suit], SUIT_VALUE[a.cards[1].suit]) -
            Math.max(SUIT_VALUE[b.cards[0].suit], SUIT_VALUE[b.cards[1].suit]),
        );
        cards = pairs[0].cards;
      }
    } else if (selected.length === 5 && selLegal) {
      cards = selected;
    }
    if (!cards) return;
    const combo = detectCombo(cards);
    if (!combo || !canPlay(combo, lead)) return;
    setError(null);
    try {
      humanAct(game, { kind: 'play', combo: { ...combo, cards } as PlayedCombo }, cards);
      setSelected([]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // Compute opponent order: 0,1,2,3 starting at humanSeat+1
  const opponentOrder = [1, 2, 3].map((o) => (humanSeat + o) % 4);
  const placeOf = (seat: number): number | null => {
    const idx = game.handState.finishedOrder.indexOf(seat);
    return idx === -1 ? null : idx + 1;
  };
  const humanPassed = game.handState.passed.includes(humanSeat);
  // The play immediately before the current one, ghosted under the pool for a
  // sense of the discards piling up.
  const prevPlay = game.trickHistory[1];

  return (
    <TablePanel>
      <View style={styles.tableColumn}>
        <TopBar
          title={`${LEVEL_LABEL[game.level]} table`}
          onBack={() => router.replace('/')}
          onSkip={onSkip}
        />

        {/* Opponents arc around the top of the table; the human sits at the
            bottom with their hand. */}
        <View style={styles.oppRow}>
          {opponentOrder.map((seat, i) => (
            <SeatPlate
              key={seat}
              name={seatName(game, seat, humanDisplayName)}
              avatarSource={BOT_AVATAR_IMG}
              isCurrent={currentSeat === seat}
              place={placeOf(seat)}
              passed={game.handState.passed.includes(seat)}
              count={game.hands[seat].length}
              raised={i === 1}
            />
          ))}
        </View>

        {/* Center: the pool is the hero — the current play sits big and bare
            on the felt, the previous play ghosted beneath it. */}
        <View style={styles.center}>
          {lastPlay ? (
            <View style={styles.trickArea}>
              {prevPlay && (
                <View style={styles.trickGhost} pointerEvents="none">
                  {prevPlay.combo.cards.map((c, i) => (
                    <View key={c.id} style={{ marginLeft: i === 0 ? 0 : -34 }}>
                      <PlayingCard card={c} />
                    </View>
                  ))}
                </View>
              )}
              <Text style={styles.trickCaption}>
                {seatName(game, lastPlay.playerIndex, humanDisplayName).toUpperCase()} PLAYED
              </Text>
              <View style={styles.trickCards}>
                {lastPlay.combo.cards.map((c, i) => (
                  <View key={c.id} style={{ marginLeft: i === 0 ? 0 : -22, zIndex: 10 + i }}>
                    <PlayingCard card={c} />
                  </View>
                ))}
              </View>
              <Text style={styles.trickName}>{comboLabel(lastPlay.combo)}</Text>
            </View>
          ) : (
            <View style={styles.trickArea}>
              <Text style={styles.trickEmpty}>
                {isMyTurn
                  ? 'Your turn, lead with any hand'
                  : `${seatName(game, currentSeat, humanDisplayName)} to lead`}
              </Text>
            </View>
          )}
          {/* Play / Pass sit directly under the pool. Pass is the bright red
              action; Play is to its left. */}
          <View style={styles.centerActions}>
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
          {autoPassing && (
            <Text style={styles.autoPass}>No playable hand, passing…</Text>
          )}
          {error && <Text style={styles.error}>{error}</Text>}
        </View>

      {/* Bottom: the human's seat + hand. */}
      <View style={[styles.bottom, isMyTurn && styles.bottomActive]}>
        {/* Soft gold glow behind the hand while it is the player's turn. First
            child so it paints behind the toolbar/hand/actions; contain so it
            never distorts; pointerEvents none so it never blocks a tap. */}
        {isMyTurn && (
          <Image
            source={TURN_GLOW_IMG}
            style={styles.turnGlow}
            resizeMode="contain"
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
            <Avatar
              name={humanDisplayName}
              url={profile?.avatarUrl ?? null}
              size={24}
              framed
              active={isMyTurn}
            />
            <Text style={styles.youName} numberOfLines={1}>{humanDisplayName}</Text>
            <SeatChip passed={humanPassed} place={placeOf(humanSeat)} />
            <Pressable style={styles.btnSmall} onPress={onOrganize}>
              <Text style={styles.btnSmallText}>
                {sortMode === null ? 'Sort' : `Sort: ${SORT_LABEL[sortMode]}`}
              </Text>
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
          onDropToCenter={playByDrag}
          dropEnabled={isMyTurn && lead !== null}
        />
      </View>
      </View>
    </TablePanel>
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
  onDropToCenter,
  dropEnabled,
}: {
  hand: Card[];
  selected: Card[];
  // Cards eligible for a legal play right now; null = no dimming (not my turn).
  playableIds: Set<string> | null;
  onTap: (c: Card) => void;
  onReorder: (from: number, to: number) => void;
  // Called when a card is flicked up into the center to auto-play it.
  onDropToCenter: (c: Card) => void;
  // Whether an upward flick should attempt a play (true only with a lead).
  dropEnabled: boolean;
}) {
  // Reactive: reflows the fan when the browser window resizes / device rotates.
  // Capped to the table column so the fan stays composed on wide viewports.
  const { width: windowWidth } = useWindowDimensions();
  const width = Math.min(windowWidth, layout.maxTableWidth);
  const SIDE_MARGIN = 12;
  // Total fan width: card width + (n-1) * stride. We pick a stride so the
  // fan fills the screen minus side margins.
  const available = width - SIDE_MARGIN * 2;
  const stride = hand.length > 1 ? Math.min(CARD_WIDTH, (available - CARD_WIDTH) / (hand.length - 1)) : 0;
  const totalWidth = CARD_WIDTH + stride * (hand.length - 1);
  // Center the fan horizontally inside the screen.
  const startX = (width - totalWidth) / 2;
  // Fan container height must derive from card HEIGHT, not width: each card
  // sits at `top: 12` (DraggableCard) so a resting card's bottom edge is at
  // 12 + CARD_HEIGHT; the +24 leaves headroom below for the card's shadow and
  // for a selected card's -16px lift, so nothing in the fan is ever clipped.
  return (
    <View style={[styles.handFan, { height: CARD_HEIGHT + 24 }]}>
      {hand.map((c, i) => (
        <DraggableCard
          key={c.id}
          card={c}
          isSelected={!!selected.find((s) => s.id === c.id)}
          isDimmed={playableIds !== null && !playableIds.has(c.id)}
          index={i}
          onTap={() => onTap(c)}
          onReorder={onReorder}
          onDropToCenter={onDropToCenter}
          dropEnabled={dropEnabled}
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
  onDropToCenter,
  dropEnabled,
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
  onDropToCenter: (c: Card) => void;
  dropEnabled: boolean;
  total: number;
  startX: number;
  stride: number;
}) {
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [dragging, setDragging] = useState(false);
  // The "rest" position for this card in the fan.
  const restX = startX + index * stride;

  // Claim the gesture on touch-start (not via a child Pressable) so a drag
  // works on the very first press, even on a card that isn't selected yet. On
  // web a wrapping Pressable would swallow the mousedown and the PanResponder
  // would never see the drag until a prior click had "primed" the card. Tap vs
  // drag is decided on release by how far the pointer moved.
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_, g) => {
          if (Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6) setDragging(true);
          pan.x.setValue(g.dx);
          pan.y.setValue(g.dy);
        },
        onPanResponderRelease: (_, g) => {
          setDragging(false);
          const moved = Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8;
          if (!moved) {
            onTap();
          } else {
            // An upward flick into the center plays an established hand; a
            // mostly-horizontal drag reorders. Vertical must dominate so a
            // normal reorder never fires a play.
            const isUpwardFlick = dropEnabled && g.dy < -70 && Math.abs(g.dy) > Math.abs(g.dx);
            if (isUpwardFlick) {
              onDropToCenter(card);
            } else {
              const target = Math.max(0, Math.min(total - 1, index + Math.round(g.dx / Math.max(1, stride))));
              if (target !== index) onReorder(index, target);
            }
          }
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        },
        onPanResponderTerminate: () => {
          setDragging(false);
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        },
      }),
    [index, total, onReorder, onTap, onDropToCenter, dropEnabled, card, pan, stride],
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
      <PlayingCard card={card} selected={isSelected} dimmed={isDimmed && !isSelected} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Flat dark backdrop filling the window behind the bounded table panel.
  // alignItems centers the width-capped panel horizontally and justifyContent
  // centers it vertically once its height is capped below the window height.
  backdrop: {
    flex: 1,
    backgroundColor: colors.backdrop,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Shadow host for the panel. Kept separate from the clipping panel because
  // the panel sets overflow:'hidden' (to round the felt into its corners),
  // which would otherwise clip its own drop shadow. Width-capped so the panel
  // never grows past a phone-ish column on wide viewports; height is set
  // inline (capped and centered by the backdrop).
  panelShadow: {
    width: '100%',
    maxWidth: layout.maxTableWidth,
    shadowColor: colors.black,
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  // The visible table: felt-filled, gold-framed, rounded, clipping its
  // children so the felt and content share one box. Solid felt color base
  // shows through while the tile image loads.
  panel: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.felt,
    borderWidth: 3,
    borderColor: colors.gold,
  },
  // The felt tile fills the panel; ImageBackground with resizeMode="repeat"
  // tiles a seamless weave so there is no single-image seam at any size.
  panelFelt: { flex: 1 },
  // Kept semi-faint over the solid felt color base so the weave reads as
  // texture, not noise.
  panelFeltImage: { opacity: 0.55 },
  // Inner gold hairline of the double-line frame, inset from the panel's
  // outer gold border. Lower alpha so the two lines read as a frame, not a
  // solid band.
  panelInnerFrame: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: 5,
    bottom: 5,
    borderWidth: 1,
    borderColor: withAlpha(colors.gold, 0.55),
  },
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

  // Table content fills the panel, which already caps its own width to a
  // phone-ish column on wide viewports, so no further width handling is needed
  // here.
  tableColumn: {
    flex: 1,
    width: '100%',
  },

  // Slim in-table top bar replacing the stock navigation header.
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  // Wide enough that "Skip to end" fits on one line without wrapping; kept
  // equal on both sides so the centered title stays centered.
  topBarSide: { width: 116, justifyContent: 'center' },
  topBarRight: { alignItems: 'flex-end' },
  topBarBack: { color: colors.textOnFelt, fontSize: 22, fontWeight: '700' },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.textOnFeltMuted,
    fontSize: typography.caption.fontSize,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Opponents — three seat plates arcing around the top of the table.
  oppRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  oppBox: {
    backgroundColor: withAlpha(colors.ink, 0.25),
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    borderRadius: radii.md,
    alignItems: 'center',
    minWidth: 120,
    marginTop: spacing.lg,
  },
  // The middle seat sits higher, arcing the row around the table's far edge.
  oppBoxRaised: { marginTop: 0 },
  oppBoxActive: {
    backgroundColor: withAlpha(colors.gold, 0.25),
    borderWidth: 1,
    borderColor: colors.gold,
  },
  oppBoxDone: { opacity: 0.55 },
  oppAvatarMargin: { marginBottom: spacing.sm },
  oppNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  oppName: { color: colors.textOnFelt, fontSize: 15, fontWeight: '700' },
  oppStackRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  oppCount: { color: colors.textOnFelt, fontSize: 24, fontWeight: '700' },

  // Seat status chips: PASS while sitting out, place medal once out of cards.
  seatChip: {
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1,
    borderRadius: 999,
  },
  seatChipPass: { backgroundColor: withAlpha(colors.cardRed, 0.9) },
  seatChipPassText: { color: colors.white, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  seatChipPlace: { backgroundColor: colors.gold },
  seatChipPlaceText: { color: colors.felt, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },

  // Center pool — the current play is the hero, sitting bare on the felt.
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.md },
  trickArea: { alignItems: 'center', justifyContent: 'center' },
  trickCaption: {
    color: colors.textOnFeltMuted,
    fontSize: typography.tiny.fontSize,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
  },
  // The previous play, ghosted beneath the current one like a discard pile.
  trickGhost: {
    position: 'absolute',
    flexDirection: 'row',
    opacity: 0.25,
    transform: [{ rotate: '-5deg' }, { translateY: -10 }],
  },
  trickCards: { flexDirection: 'row', justifyContent: 'center', marginBottom: spacing.sm },
  trickName: { color: colors.gold, fontSize: typography.label.fontSize, fontWeight: '700' },
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
  // Active-turn highlight on the whole hand area: a gold top edge plus a very
  // faint gold wash, matching the seat-plate active state so the two read as
  // one system. Kept low so it reads as an edge cue, not a lit rectangle.
  bottomActive: {
    borderTopColor: colors.gold,
    backgroundColor: withAlpha(colors.gold, 0.05),
  },
  // Radial gold glow art behind the hand on the player's turn. resizeMode
  // "contain" (set on the Image) keeps it a soft centered oval instead of a
  // stretched full-width rectangle, and the low opacity keeps it reading as
  // ambient light rather than a solid lighter band.
  turnGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: undefined,
    height: undefined,
    opacity: 0.25,
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
  handToolbarLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  youName: { color: colors.textOnFelt, fontSize: typography.caption.fontSize, fontWeight: '700', maxWidth: 110 },
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
  // Play / Pass under the center pool.
  centerActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  btn: {
    backgroundColor: colors.feltLight,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.xxl,
    borderRadius: radii.md,
  },
  // Pass is the bright-red action, deliberately loud so it reads at a glance.
  btnPass: { backgroundColor: '#e53935' },
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
