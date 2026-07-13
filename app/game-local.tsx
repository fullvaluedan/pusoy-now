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
//   - Play / Pass centered around the played pool: Pass above, Play below
//   - Bot mode: elapsed game clock in the top bar; records the player's
//     fastest winning time per level (shown on the finish screen)
//   - Round-complete screen with finish order

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Avatar } from '../components/Avatar';
import { DealingAnimation } from '../components/DealingAnimation';
import {
  BannerStrip,
  CENTER_ACTION_HIT_SLOP,
  COMPACT_PANEL_HEIGHT,
  HandRow,
  PoolRegion,
  SeatChip,
  SeatPlate,
  TablePanel,
  TopBar,
  usablePanelHeight,
} from '../components/table';
import { canPlay, detectCombo } from '../lib/pusoy/combo';
import { SUIT_VALUE } from '../lib/pusoy/deck';
import { findLegalPlays } from '../lib/pusoy/bot';
import { parseLevel } from '../lib/pusoy/level';
import { formatTime, loadStats, pushStatsSync, recordGame, recordWinTime } from '../lib/stats';
import { incrementGameCounter } from '../lib/gameCounter';
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

// Interstitial hook stub: called once a hand finishes. Deliberately a no-op
// today -- the real interstitial (and its frequency-capping/premium-skip
// rules) lands with the ad SDK milestone. Wiring the call site in now means
// that milestone is a drop-in, not another pass over this screen.
function maybeShowInterstitial(): void {
  // no-op (dark-launched)
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

export default function LocalGameScreen() {
  const params = useLocalSearchParams<{ bots: string; level: string }>();
  const router = useRouter();
  const { profile, session } = useAuth();
  // The table switches to its compact layout on short viewports (real phones,
  // where the browser chrome/safe-area eats into the height). Derived from the
  // same usable-panel budget TablePanel draws at, so the flag flips exactly
  // when the roomy layout would stop fitting.
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const compact = usablePanelHeight(winHeight, winWidth > layout.maxTableWidth) < COMPACT_PANEL_HEIGHT;
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
  // Game clock: startedAtRef is stamped the moment the deal finishes and play
  // begins; nowTs ticks once a second so the live timer re-renders. The best
  // winning time for this level is loaded once the game finishes.
  const startedAtRef = useRef<number | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [bestWinMs, setBestWinMs] = useState<number | null>(null);
  // Tick the clock once a second, but only while actually playing -- no need to
  // re-render during the dealing animation or the finished screen (where the
  // time is frozen at game.finishedAt anyway).
  const phase = game?.phase;
  useEffect(() => {
    if (phase !== 'playing') return;
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase]);

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
  // through, or auto-skipped after emptying the hand) counts. The local
  // free-game counter increments under the exact same condition, so a bailed-
  // out game is not counted there either.
  const recordedRef = useRef(false);
  useEffect(() => {
    if (!game || game.phase !== 'finished' || recordedRef.current) return;
    recordedRef.current = true;
    maybeShowInterstitial();
    if (game.abandonedByUser) return;
    const seat = findHumanSeat(game);
    const rank = game.finishOrder.indexOf(seat) + 1;
    if (rank >= 1 && rank <= 4) {
      // Record locally first, then (for signed-in players) sync the updated
      // cumulative totals to D1 so they count toward the friends ranking.
      // Guests stay local-only. See lib/stats.pushStatsSync.
      void recordGame(game.level, rank).then(() => {
        if (session) void pushStatsSync();
      });
      void incrementGameCounter(game.level);
    }
    // A win (1st place) logs its time toward the level's best. Either way, load
    // the current best for this level so the finish screen can show it.
    const elapsed = startedAtRef.current != null && game.finishedAt
      ? game.finishedAt - startedAtRef.current
      : null;
    const level = game.level;
    const after = rank === 1 && elapsed != null ? recordWinTime(level, elapsed) : Promise.resolve();
    void after.then(() => loadStats()).then((s) => setBestWinMs(s[level].bestWinMs));
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

  // 1) Dealing animation. Rendered as a TRANSPARENT overlay ON TOP OF the real
  // table composition (the same TopBar + SeatPlate arc the `playing` branch
  // renders below), so the felt panel, gold border, and opponent seats are all
  // present and in their FINAL positions from the very first frame. Nothing
  // jumps or restyles when the deal ends and the live table takes over: the
  // seats are already the live seats. The overlay's own accumulating hand fan
  // stands in for the live HandRow (which is not rendered during the deal).
  if (game.phase === 'dealing') {
    const playerNames = [0, 1, 2, 3].map((s) => seatName(game, s, humanDisplayName));
    // Same opponent order + raised-middle arc the live `playing` branch uses.
    const dealOpponentOrder = [1, 2, 3].map((o) => (humanSeat + o) % 4);
    return (
      <TablePanel>
        <View style={styles.tableColumn}>
          {/* Identical TopBar to the playing branch (same height-determining
              props: turnLabel + timer + onSkip) so the seat arc below sits at
              the exact same Y before and after the deal. The Skip button is
              visually present but unreachable -- the transparent overlay's
              tap-anywhere Pressable sits on top and intercepts every tap. */}
          <TopBar
            title={`${LEVEL_LABEL[game.level]} table`}
            turnLabel="Dealing…"
            timer={formatTime(0)}
            onBack={() => router.replace('/')}
            onSkip={() => {}}
            compact={compact}
          />

          {/* The identical SeatPlate arc: same wrapper, same per-seat props as
              the live table, but in the static pre-game state (13 cards each,
              nobody's turn, nobody passed or finished). Because the markup and
              props match, each plate lands at the pixel-identical position it
              will hold once play begins. */}
          <View style={[styles.oppRow, compact && styles.oppRowCompact]}>
            {dealOpponentOrder.map((seat, i) => (
              <SeatPlate
                key={seat}
                name={seatName(game, seat, humanDisplayName)}
                avatarSource={BOT_AVATAR_IMG}
                isCurrent={false}
                place={null}
                passed={false}
                count={game.hands[seat].length}
                raised={i === 1}
                compact={compact}
              />
            ))}
          </View>

          {/* Filler so the column occupies the full panel height, matching the
              live layout's flex fill. The pool/hand chrome is deliberately
              omitted -- the deal overlay's own accumulating fan represents the
              hand -- but it sits BELOW the seat arc, so it can never shift the
              seats. */}
          <View style={styles.dealFiller} />
        </View>

        <DealingAnimation
          dealOrder={game.dealOrder}
          deck={game.deck}
          playerKinds={game.playerKinds}
          playerNames={playerNames}
          onDone={() => {
            startedAtRef.current = Date.now();
            startGame(game);
          }}
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
          compact={compact}
        />
        <View style={styles.finishCard}>
          <Text style={styles.finishHeadline}>
            {youWon ? 'You won!' : youLast ? 'You lost' : 'Hand over'}
          </Text>
          {startedAtRef.current != null && game.finishedAt ? (
            <Text style={styles.finishTime}>
              Time {formatTime(game.finishedAt - startedAtRef.current)}
              {bestWinMs != null ? `  ·  Best ${formatTime(bestWinMs)}` : ''}
            </Text>
          ) : null}
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
              style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.btnPressed]}
              onPress={() =>
                router.replace({ pathname: '/game-local', params: { bots: botCount, level } })
              }
            >
              <Text style={[styles.btnText, styles.btnPrimaryText]}>Play again</Text>
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

  // Cycle sort mode: rank → suit → hands. Sorting clears the current selection
  // -- after a re-sort the picked cards are scattered and rarely still the play
  // the user wanted, so a clean slate is less error-prone than a stale one.
  const onOrganize = () => {
    const next = sortMode === null ? 'rank' : NEXT_SORT[sortMode];
    setSortMode(next);
    sortHumanHand(game, next);
    setSelected([]);
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

  // Dragging a card into the center plays a hand automatically. When leading
  // (no lead yet): if a legal combo is already selected the drag plays it, an
  // illegal in-progress selection is left alone, and otherwise the dragged card
  // leads as a single — so after a five-card hand where everyone passes you can
  // just fling one card out to lead it. With a lead established: a single-lead
  // drag plays that single; a pair-lead drag plays the matching pair (lowest
  // suits); a 5-card-lead drag plays the current five-card selection if legal.
  // A drag that would not be a legal play is ignored.
  const playByDrag = (c: Card) => {
    if (!isMyTurn) return;
    let cards: Card[] | null = null;
    if (!lead) {
      if (selected.length > 0) {
        if (!selLegal) return; // building an illegal combo; don't fire a play
        cards = selected;
      } else {
        cards = [c];
      }
    } else if (lead.length === 1) {
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
  // Compact, persistent top-center status: whose turn it is right now. The
  // gold "Your turn" banner over the hand only appears on the human's own
  // turn; this chip is always visible so the table never feels ambiguous.
  const turnLabel = isMyTurn
    ? 'Your turn'
    : `${seatName(game, currentSeat, humanDisplayName)}'s turn`;
  // Live game clock: time since the deal finished. Freezes at the final time
  // once the hand ends (game.finishedAt), otherwise tracks the 1s ticker.
  const elapsedMs = startedAtRef.current == null
    ? 0
    : (game.finishedAt ?? nowTs) - startedAtRef.current;

  return (
    <TablePanel>
      <View style={styles.tableColumn}>
        <TopBar
          title={`${LEVEL_LABEL[game.level]} table`}
          turnLabel={turnLabel}
          timer={formatTime(elapsedMs)}
          onBack={() => router.replace('/')}
          onSkip={onSkip}
          compact={compact}
        />

        {/* Opponents arc around the top of the table; the human sits at the
            bottom with their hand. */}
        <View style={[styles.oppRow, compact && styles.oppRowCompact]}>
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
              compact={compact}
            />
          ))}
        </View>

        {/* Center: the played pool is the hero, with the two actions centered
            around it -- Pass above, Play below -- so both sit in the middle of
            the table, equally reachable and never mis-tapped for each other.
            The center is the flex:1 region that absorbs leftover height, but
            the POOL inside it never shrinks: trickWrap holds a protected
            full-size minHeight. On short viewports the controls (compact 36px)
            and the surrounding chrome give up height instead. */}
        {/* Center: the played pool is the hero, with PASS above and PLAY below,
            positioned by the shared PoolRegion. The pool region reserves a
            protected full-size height (POOL_MIN_HEIGHT) so the played combo
            never shrinks or clips; on short viewports the surrounding chrome
            (controls, seats, margins) gives up height instead. The PASS/PLAY
            controls are passed as slots so this screen keeps its own button
            wiring while the kit fixes their layout -- U2's online table reuses
            the same region with its own slots. */}
        <PoolRegion
          lastPlay={
            lastPlay
              ? {
                  cards: lastPlay.combo.cards,
                  playerName: seatName(game, lastPlay.playerIndex, humanDisplayName),
                  label: comboLabel(lastPlay.combo),
                }
              : null
          }
          prevPlay={prevPlay ? { cards: prevPlay.combo.cards } : null}
          emptyText={
            isMyTurn
              ? 'Your turn, lead with any hand'
              : `${seatName(game, currentSeat, humanDisplayName)} to lead`
          }
          compact={compact}
          passSlot={
            <Pressable
              style={({ pressed }) => [styles.btn, styles.btnPass, styles.centerActionBtn, compact && styles.centerActionBtnCompact, pressed && !(!isMyTurn || lead === null) && styles.btnPressed, (!isMyTurn || lead === null) && styles.btnDisabled]}
              hitSlop={compact ? CENTER_ACTION_HIT_SLOP : undefined}
              disabled={!isMyTurn || lead === null}
              onPress={onPass}
            >
              <Text style={styles.btnText}>Pass</Text>
            </Pressable>
          }
          playSlot={
            <Pressable
              style={({ pressed }) => [styles.btn, styles.btnPrimary, styles.centerActionBtn, compact && styles.centerActionBtnCompact, pressed && !(!isMyTurn || !selLegal) && styles.btnPressed, (!isMyTurn || !selLegal) && styles.btnDisabled]}
              hitSlop={compact ? CENTER_ACTION_HIT_SLOP : undefined}
              disabled={!isMyTurn || !selLegal}
              onPress={onPlay}
            >
              <Text style={[styles.btnText, styles.btnPrimaryText]}>Play</Text>
            </Pressable>
          }
        />

      {/* Bottom: the human's seat + hand. */}
      <View style={[styles.bottom, compact && styles.bottomCompact, isMyTurn && styles.bottomActive]}>
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
        {/* Reserved headroom strip above the toolbar. The gold "Your turn"
            banner, the auto-pass notice, and play errors all render inside it
            (centered, one at a time) instead of mounting their own row, so
            nothing below ever shifts -- the strip is always present during
            play. */}
        <BannerStrip autoPassing={autoPassing} error={error} isMyTurn={isMyTurn} compact={compact} />
        <View style={[styles.handToolbar, compact && styles.handToolbarCompact]}>
          <View style={styles.handToolbarLeft}>
            <Avatar
              name={humanDisplayName}
              url={profile?.avatarUrl ?? null}
              size={24}
              framed
              active={isMyTurn}
            />
            <Text style={styles.youName} numberOfLines={1} ellipsizeMode="tail">{humanDisplayName}</Text>
            <SeatChip passed={humanPassed} place={placeOf(humanSeat)} />
            <Pressable style={({ pressed }) => [styles.btnSmall, pressed && styles.btnSmallPressed]} onPress={onOrganize}>
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
          dropEnabled={isMyTurn}
        />

      </View>
      </View>
    </TablePanel>
  );
}

const styles = StyleSheet.create({
  loadingText: { color: colors.textOnFelt, textAlign: 'center', marginTop: spacing.xxl },

  // Table content fills the panel, which already caps its own width to a
  // phone-ish column on wide viewports, so no further width handling is needed
  // here.
  tableColumn: {
    flex: 1,
    width: '100%',
  },

  // Fills the panel below the seat arc during the deal so the column occupies
  // the full height (matching the live layout's flex fill). Content-free: the
  // deal overlay paints the hand fan on top.
  dealFiller: { flex: 1 },

  // Opponents — the row wrapper around the three shared SeatPlates.
  oppRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  // Short-viewport: trim the row's own vertical padding on top of the smaller
  // seat plates, reclaiming height for the pool + hand.
  oppRowCompact: {
    paddingVertical: 2,
  },

  // Bottom — hand in the lower-center, actions centered directly below
  bottom: {
    paddingBottom: spacing.md - 2,
    paddingTop: spacing.sm,
    borderTopWidth: 2,
    borderTopColor: 'transparent',
  },
  // Short-viewport: trim the bottom section's own padding so the center flex
  // region keeps more room for the pool + controls (the hand fan itself keeps
  // its intrinsic height -- only chrome shrinks).
  bottomCompact: {
    paddingTop: 2,
    paddingBottom: spacing.xs,
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
  // Reserved headroom strip above the toolbar: always present during play so
  // the toolbar/Sort row never jumps between turns. The banner sits inside it
  // (in normal flow, no absolute overlap).
  bannerStrip: {
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Short-viewport: a slimmer headroom strip above the toolbar. The gold "Your
  // turn" banner still centers in it; a couple px reclaimed for the pool.
  bannerStripCompact: { height: 14 },
  turnBanner: {
    backgroundColor: colors.gold,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
    borderRadius: 999,
  },
  turnBannerText: {
    color: colors.felt,
    fontSize: typography.tiny.fontSize,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  errorBanner: { backgroundColor: colors.danger },
  errorBannerText: { color: colors.white },
  handToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg - 4,
    marginBottom: spacing.xs + 2,
  },
  // Short-viewport: pull the hand fan up nearer the Sort/name toolbar.
  handToolbarCompact: { marginBottom: 2 },
  handToolbarLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  youName: { color: colors.textOnFelt, fontSize: typography.caption.fontSize, fontWeight: '700', flex: 1, minWidth: 0 },
  selLabel: { color: colors.textOnFeltMuted, fontSize: typography.caption.fontSize },
  selOk: { color: colors.success, fontWeight: '700' },
  selBad: { color: colors.dangerLight, fontWeight: '600' },
  // Play / Pass centered in the middle of the table, sandwiching the played
  // pool (Pass above, Play below). Fixed width so the two read as a matched
  // pair, and vertical margin so neither crowds the cards between them.
  centerActionBtn: {
    minWidth: 150,
    marginVertical: spacing.md,
  },
  // Short-viewport: the pool stays full size, so PASS/PLAY give up the height
  // instead. Visual height drops to 36 (from 44) with tighter padding and a
  // narrower min width; the buttons keep their bold caps. The tap target is
  // kept at >=44 via hitSlop on the Pressable (see centerActionHitSlop), so the
  // control only looks smaller -- it is still as easy to hit.
  centerActionBtnCompact: {
    minHeight: 36,
    paddingVertical: 6,
    minWidth: 96,
    marginVertical: 3,
  },
  // Play / Pass / Sort share one height family so they read as one button
  // set; Sort stays visually secondary via smaller padding/font.
  // v3: chunky Duolingo-style buttons -- a rounded-rect with a darker 3px
  // bottom edge (borderBottomWidth) that reads as the button's 3D side.
  // Pressing swallows the edge and nudges the button down by the same amount
  // (btnPressed) so it visually presses into the felt. The base fill is the
  // lighter felt; its darker edge is the felt green itself.
  btn: {
    backgroundColor: colors.feltLight,
    minHeight: 44,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xxl,
    borderRadius: radii.xl,
    borderBottomWidth: 4,
    borderBottomColor: colors.felt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Shared pressed state for the chunky buttons: drop the 3D edge and slide
  // down by its thickness so the control appears to press into the surface.
  btnPressed: { borderBottomWidth: 0, transform: [{ translateY: 4 }] },
  // Play is the primary action when enabled: gold fill + darker gold edge,
  // dark ink text so it reads as the one thing to press. btnDisabled dims it
  // uniformly with Pass.
  btnPrimary: { backgroundColor: colors.gold, borderBottomColor: colors.goldEdge },
  btnPrimaryText: { color: colors.ink },
  // Pass is the bright-red action, deliberately loud so it reads at a glance.
  btnPass: { backgroundColor: colors.dangerBright, borderBottomColor: colors.dangerEdge },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: colors.textOnFelt, fontWeight: '800', fontSize: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  // Sort / Skip: the felt-light secondary chunky button, smaller than Play/Pass.
  btnSmall: {
    backgroundColor: colors.feltLight,
    minHeight: 40,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    borderBottomWidth: 4,
    borderBottomColor: colors.felt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSmallPressed: { borderBottomWidth: 0, transform: [{ translateY: 4 }] },
  btnSmallText: { color: colors.textOnFelt, fontWeight: '800', fontSize: typography.caption.fontSize, textTransform: 'uppercase', letterSpacing: 0.3 },
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
  finishTime: { fontSize: typography.label.fontSize, color: colors.felt, fontWeight: '700', marginBottom: spacing.sm },
  finishSub: { fontSize: typography.label.fontSize, color: colors.textMuted, marginBottom: spacing.lg - 4 },
  finishRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  finishPlace: { color: colors.felt, fontSize: 22, fontWeight: '700', width: 40 },
  finishAvatar: { marginRight: spacing.sm },
  finishName: { color: colors.textPrimary, fontSize: typography.subheading.fontSize - 2, flex: 1 },
  finishActions: { flexDirection: 'row', gap: spacing.md - 2, marginTop: spacing.xxl - 8 },
});
