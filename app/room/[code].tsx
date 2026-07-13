// One room, both as a lobby (seat list + invite link + host start) and as the
// live table once play begins, and finally the finish-order screen. Backed by
// the server-authoritative WebSocket (lib/onlineGame.useOnlineRoom) -- this
// screen only ever renders the room's redacted view; it never has another
// seat's cards. headerShown:false in app/_layout.tsx (see there) because this
// becomes a full felt table once play starts, so the header here is drawn
// in-line instead of the native Stack header.
//
// The PLAYING phase renders on the shared table kit (components/table/*), the
// exact same felt/gold/seat/pool/hand surface the bot table (app/game-local.tsx)
// uses, so the online table matches it by construction. Only multiplayer
// specifics stay local here: the turn countdown, the LEFT TABLE state, and the
// server-authoritative play/pass sends. The lobby and finished phases keep the
// design-system card layout.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Button, Card, Header, ScreenContainer } from '../../components/ui';
import { Avatar } from '../../components/Avatar';
import { DealingAnimation } from '../../components/DealingAnimation';
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
} from '../../components/table';
import { canPlay, detectCombo } from '../../lib/pusoy/combo';
import { findLegalPlays } from '../../lib/pusoy/bot';
import { SUIT_VALUE } from '../../lib/pusoy/deck';
import { sortHand, type SortMode } from '../../lib/pusoy/localGame';
import { shouldAutoPass, autoPassTurnKey } from '../../lib/onlineAutoPass';
import { isFreshStart } from '../../lib/onlineDeal';
import { formatTime } from '../../lib/stats';
import { colors, layout, radii, spacing, typography, withAlpha } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { useOnlineRoom, type OnlineRoomView } from '../../lib/onlineGame';
import { opponentSeats } from '../../lib/onlineSeats';
import type { Card as CardT, FiveCardType, PlayedCombo } from '../../lib/pusoy/types';

const BOT_AVATAR_IMG = require('../../assets/art/bot-avatar.png');
const TURN_GLOW_IMG = require('../../assets/art/turn-glow.png');

const RANK_DISPLAY: Record<CardT['rank'], string> = {
  '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  '10': '10', J: 'J', Q: 'Q', K: 'K', A: 'A', '2': '2',
};
const SUIT_GLYPH: Record<CardT['suit'], string> = { C: '♣', D: '♦', H: '♥', S: '♠' };

function cardLabel(c: CardT): string {
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

function comboLabel(c: PlayedCombo): string {
  return `${comboName(c)} - ${c.cards.map(cardLabel).join(' ')}`;
}

const SORT_LABEL: Record<SortMode, string> = { rank: 'Rank', suit: 'Suit', hands: 'Hands' };
const NEXT_SORT: Record<SortMode, SortMode> = { rank: 'suit', suit: 'hands', hands: 'rank' };
const LEVEL_LABEL: Record<OnlineRoomView['botLevel'], string> = {
  easy: 'Easy',
  normal: 'Normal',
  expert: 'Expert',
};

// Web falls back to this app's own /join/[code] route on its own origin;
// native falls back to the prends:// deep link. Both are overridden by the
// server-provided `link`/`deepLink` route params when play-online passed them
// through (see app/play-online.tsx).
function deriveJoinLink(code: string): string {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' ? `${window.location.origin}/join/${code}` : `/join/${code}`;
  }
  return `prends://join/${code}`;
}

function playerLabel(view: OnlineRoomView, seat: number): string {
  const p = view.players.find((pl) => pl.seat === seat);
  if (!p) return `Seat ${seat + 1}`;
  if (p.username) return p.username;
  return p.kind === 'bot' ? `Bot ${seat + 1}` : 'Player';
}

// Reconcile the local hand display order with the server hand: keep the local
// order for cards still held (so a drag-reorder or Sort survives the next,
// unrelated state update), drop cards that were played, append anything new.
function reconcileHand(prev: CardT[], server: CardT[]): CardT[] {
  const byId = new Map(server.map((c) => [c.id, c]));
  const kept: CardT[] = [];
  const keptIds = new Set<string>();
  for (const c of prev) {
    const fresh = byId.get(c.id);
    if (fresh) {
      kept.push(fresh);
      keptIds.add(c.id);
    }
  }
  for (const c of server) if (!keptIds.has(c.id)) kept.push(c);
  return kept;
}

export default function RoomScreen() {
  const params = useLocalSearchParams<{ code: string; link?: string; deepLink?: string }>();
  const code = params.code ?? '';
  const router = useRouter();
  const { view, status, error, playCards, pass, start, clearError } = useOnlineRoom(code || null);
  const { profile } = useAuth();

  const [copied, setCopied] = useState(false);

  const joinLink =
    params.link ??
    (Platform.OS === 'web' ? deriveJoinLink(code) : params.deepLink ?? deriveJoinLink(code));

  async function onShare() {
    if (Platform.OS === 'web') {
      try {
        await navigator.clipboard.writeText(joinLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // clipboard permission denied; nothing more to do
      }
    } else {
      try {
        await Share.share({ message: joinLink });
      } catch {
        // user dismissed the share sheet
      }
    }
  }

  if (!view) {
    return (
      <ScreenContainer>
        <Header title={code ? `Room ${code}` : 'Room'} onBack={() => router.replace('/')} />
        <ActivityIndicator size="large" color={colors.felt} style={styles.loader} />
      </ScreenContainer>
    );
  }

  // Live play renders on the shared felt table, full-bleed, with its own
  // in-table top bar (no ScreenContainer / native header).
  if (view.phase === 'playing') {
    return (
      <LiveTable
        view={view}
        status={status}
        error={error}
        clearError={clearError}
        onPlay={playCards}
        onPass={pass}
        profile={profile}
        onExit={() => router.replace('/')}
      />
    );
  }

  // Lobby + finished stay on the design-system card layout.
  return (
    <ScreenContainer scroll>
      <Header title={`Room ${view.code}`} onBack={() => router.replace('/')} />

      {status === 'reconnecting' ? (
        <View style={styles.reconnectBanner}>
          <Text style={styles.reconnectText}>Reconnecting...</Text>
        </View>
      ) : null}

      {error ? (
        <Pressable style={styles.errorBanner} onPress={clearError}>
          <Text style={styles.errorBannerText}>{error} (tap to dismiss)</Text>
        </Pressable>
      ) : null}

      {view.phase === 'lobby' ? (
        <LobbySection
          view={view}
          joinLink={joinLink}
          isHost={view.yourSeat === 0}
          copied={copied}
          onStart={start}
          onShare={() => void onShare()}
        />
      ) : null}

      {view.phase === 'finished' ? (
        <FinishedSection view={view} profile={profile} onHome={() => router.replace('/')} />
      ) : null}
    </ScreenContainer>
  );
}

// --- Live table (shared kit) --------------------------------------------------

function LiveTable({
  view,
  status,
  error,
  clearError,
  onPlay,
  onPass,
  profile,
  onExit,
}: {
  view: OnlineRoomView;
  status: string;
  error: string | null;
  clearError: () => void;
  onPlay: (combo: PlayedCombo) => void;
  onPass: () => void;
  profile: { displayName: string; avatarUrl: string | null } | null;
  onExit: () => void;
}) {
  // Same compact budget the bot table derives, so the two flip to the compact
  // layout at the exact same viewport.
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const compact = usablePanelHeight(winHeight, winWidth > layout.maxTableWidth) < COMPACT_PANEL_HEIGHT;

  const hs = view.handState;
  const yourSeat = view.yourSeat;
  const currentSeat = hs?.currentPlayerIndex ?? null;
  const isMyTurn = hs != null && yourSeat != null && currentSeat === yourSeat;
  const lead = hs?.leadCombo ?? null;

  const [selected, setSelected] = useState<CardT[]>([]);
  const [sortMode, setSortMode] = useState<SortMode | null>(null);
  const [handOrder, setHandOrder] = useState<CardT[]>(() => view.yourHand ?? []);
  // Instant local play-validation feedback ("Pick cards to play", etc.), shown
  // in the same red pill the server errors use. The server stays authoritative;
  // this is a client-only nicety mirroring the bot table.
  const [localError, setLocalError] = useState<string | null>(null);
  // Auto-pass banner ("No playable hand, passing…"), driven by the effect below.
  const [autoPassing, setAutoPassing] = useState(false);

  // Keep the local hand order reconciled against the server's authoritative
  // hand every state update.
  const serverHand = view.yourHand;
  useEffect(() => {
    setHandOrder((prev) => reconcileHand(prev, serverHand ?? []));
  }, [serverHand]);

  // Turn countdown deadline (server-set fresh every turn). The 250ms ticker no
  // longer lives here: it was re-rendering the whole LiveTable 4x/sec all game.
  // The countdown now ticks INSIDE the two leaf components that actually show it
  // -- BannerStrip (your-turn pill) and TopBar (another seat's turn label) --
  // each running its own interval only while it is on screen, so a tick repaints
  // just that pill, not the felt/hand/pool.
  const turnDeadline = view.turnDeadline;

  // Selection (and any stale error, local or server) reset once the turn moves
  // on -- either your play landed or the turn passed while you were deciding.
  useEffect(() => {
    setSelected([]);
    setLocalError(null);
    clearError();
    // clearError identity changes each render; only the turn index should
    // trigger this reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSeat]);

  // Elapsed game clock, shown in the TopBar like the bot table. Start counting
  // when this client first mounts into the playing phase (LiveTable is only
  // rendered while phase === 'playing'). On a mid-game reconnect the component
  // may remount and restart this from zero -- acceptable, since the client has
  // no server-provided game start time to anchor to.
  const playStartRef = useRef<number>(Date.now());
  const [clockNow, setClockNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setClockNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsedMs = clockNow - playStartRef.current;

  // Deal animation on a FRESH game start. The online client never receives the
  // deck (redacted), so it synthesizes the deal from its own hand + seat counts.
  // isFreshStart tolerates the opening bot having already led (a slow join can
  // deliver a first snapshot after the server's paced opener), while a true
  // mid-game reconnect never deals. Decided ONCE via the state initializer, at
  // this component's first playing render, so later snapshots during/after the
  // deal can never re-trigger it (and the first frame is already the overlay,
  // no table flash).
  const [dealing, setDealing] = useState(() =>
    isFreshStart({
      playing: hs != null,
      yourHandLength: view.yourHand?.length ?? null,
      trickHistoryLength: view.trickHistory.length,
    }),
  );

  // Every legal play available right now, or null when it is not our turn.
  // Computed from the server hand (same set as handOrder, canonical order).
  const legalPlays = useMemo(() => {
    if (!isMyTurn || !serverHand) return null;
    return findLegalPlays(serverHand, lead);
  }, [isMyTurn, serverHand, lead]);

  // Cards that can be part of a legal play. Selection-aware: once cards are
  // selected, only plays that CONTAIN the whole selection keep cards lit.
  let playableIds: Set<string> | null = null;
  if (legalPlays) {
    const pool = selected.length
      ? legalPlays.filter((p) => selected.every((s) => p.cards.some((c) => c.id === s.id)))
      : legalPlays;
    playableIds = new Set<string>();
    for (const p of pool) for (const c of p.cards) playableIds.add(c.id);
  }

  // Selection-independent eligibility: every card in any legal play right now.
  let eligibleIds: Set<string> | null = null;
  if (legalPlays) {
    eligibleIds = new Set<string>();
    for (const p of legalPlays) for (const c of p.cards) eligibleIds.add(c.id);
  }

  // Auto-pass (the headline multiplayer fix). When it is your turn, a lead is on
  // the table, and nothing in your hand can beat it, show a brief banner and
  // pass automatically -- the same courtesy the bot table gives. Never fires
  // while leading (lead null), and never while the socket is down.
  const connected = status !== 'reconnecting' && status !== 'closed';
  const wantAutoPass = shouldAutoPass({
    isMyTurn,
    lead,
    legalPlayCount: legalPlays ? legalPlays.length : null,
    connected,
  });
  // Turn identity: the auto-pass fires at most once per turn instance, so a slow
  // server ack (which re-renders with the same view) cannot double-send. Keyed
  // on the server's turnDeadline (unique per turn), NOT trickHistory length,
  // which the server caps at 8 -- past that a length-based key collides across
  // later turns and wedges the latch so no further forced pass fires.
  const turnKey = autoPassTurnKey(currentSeat, turnDeadline);
  const autoPassFiredRef = useRef<string | null>(null);
  // `onPass` is a fresh closure each render; keep it in a ref so the effect's
  // deps stay [wantAutoPass, turnKey] and an unrelated re-render never clears
  // the pending 1400ms timer.
  const onPassRef = useRef(onPass);
  onPassRef.current = onPass;
  useEffect(() => {
    if (!wantAutoPass) {
      setAutoPassing(false);
      return;
    }
    if (autoPassFiredRef.current === turnKey) return; // already passed this turn
    setAutoPassing(true);
    const t = setTimeout(() => {
      // Latch ONLY at the instant we actually send. Setting it when the timer
      // STARTS meant a socket blip that cancelled the timer (cleanup below) left
      // the turn permanently latched, silently suppressing the pass. Latching at
      // send time means a cancelled-before-fire timer leaves the turn un-latched,
      // so the effect re-schedules and still passes after the blip clears.
      autoPassFiredRef.current = turnKey;
      setAutoPassing(false);
      onPassRef.current();
    }, 1400);
    return () => {
      // Nothing to unlatch here: if we get here before the timeout fired, the
      // latch was never set, so the next scheduling re-arms the pass.
      clearTimeout(t);
      setAutoPassing(false);
    };
  }, [wantAutoPass, turnKey]);

  const selCombo = selected.length ? detectCombo(selected) : null;
  const selLegal = !!selCombo && canPlay(selCombo, lead);
  const handCount = handOrder.length;
  const selFeedback =
    selected.length === 0
      ? `${handCount} cards`
      : !selCombo
        ? 'Not a combo'
        : !selLegal
          ? `${comboName(selCombo)}: doesn't beat lead`
          : `${comboName(selCombo)} ✓`;

  const placeOf = (seat: number): number | null => {
    const idx = hs?.finishedOrder.indexOf(seat) ?? -1;
    return idx === -1 ? null : idx + 1;
  };
  const passedOf = (seat: number): boolean => hs?.passed.includes(seat) ?? false;

  const doPlay = (cards: CardT[]) => {
    const combo = detectCombo(cards);
    if (!combo || !canPlay(combo, lead)) return;
    onPlay({ ...combo, cards } as PlayedCombo);
    setSelected([]);
  };

  // Instant local validation feedback before the play ever reaches the server,
  // mirroring the bot table's messages (app/game-local.tsx). The server stays
  // authoritative; these only surface the obvious client-side mistakes early.
  const onPlayPress = () => {
    setLocalError(null);
    if (selected.length === 0) {
      setLocalError('Pick cards to play');
      return;
    }
    const combo = detectCombo(selected);
    if (!combo) {
      setLocalError('Not a legal combo');
      return;
    }
    if (!canPlay(combo, lead)) {
      setLocalError('That combo does not beat the lead');
      return;
    }
    onPlay({ ...combo, cards: selected } as PlayedCombo);
    setSelected([]);
  };

  const onPassPress = () => {
    if (!isMyTurn || lead === null) return;
    setLocalError(null);
    onPass();
  };

  // Cycle sort mode rank -> suit -> hands, ordering the local hand copy. Clears
  // the selection (after a re-sort the picked cards are scattered).
  const onOrganize = () => {
    const next = sortMode === null ? 'rank' : NEXT_SORT[sortMode];
    setSortMode(next);
    setHandOrder((prev) => sortHand(prev, next));
    setSelected([]);
  };

  // Stable identity so the 13 DraggableCards don't each rebuild their
  // PanResponder on every re-render.
  const handleReorder = useCallback((from: number, to: number) => {
    setHandOrder((prev) => {
      if (from < 0 || from >= prev.length) return prev;
      const clamped = Math.max(0, Math.min(prev.length - 1, to));
      if (clamped === from) return prev;
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      next.splice(clamped, 0, moved);
      return next;
    });
  }, []);

  // Tap-select, lead-aware, mirroring the bot table so an illegal or
  // wrong-shaped play can't be built:
  //   not our turn / ineligible: ignored
  //   leading: free multi-select
  //   single lead: one card, tapping another replaces it
  //   pair lead: auto-picks the whole legal pair of that rank (lowest suits)
  //   5-card lead: manual multi-select, capped at five
  const toggleCard = (c: CardT) => {
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
        pairs.sort(
          (a, b) =>
            Math.max(SUIT_VALUE[a.cards[0].suit], SUIT_VALUE[a.cards[1].suit]) -
            Math.max(SUIT_VALUE[b.cards[0].suit], SUIT_VALUE[b.cards[1].suit]),
        );
        return pairs[0].cards;
      });
      return;
    }
    setSelected((sel) => {
      if (sel.find((s) => s.id === c.id)) return sel.filter((s) => s.id !== c.id);
      if (sel.length >= 5) return sel;
      return [...sel, c];
    });
  };

  // Flick a card up into the center to auto-play an established hand, matching
  // the bot table's drag-to-play rules.
  const playByDrag = (c: CardT) => {
    if (!isMyTurn) return;
    let cards: CardT[] | null = null;
    if (!lead) {
      if (selected.length > 0) {
        if (!selLegal) return;
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
    doPlay(cards);
  };

  const slots = yourSeat != null ? opponentSeats(yourSeat, view.seats) : [];
  const singleOpponent = slots.length === 1;

  const lastPlay = view.trickHistory[0];
  const prevPlay = view.trickHistory[1];

  const humanName =
    (yourSeat != null ? view.players.find((p) => p.seat === yourSeat)?.username : null) ??
    profile?.displayName ??
    'You';
  const humanPassed = yourSeat != null ? passedOf(yourSeat) : false;
  const humanPlace = yourSeat != null ? placeOf(yourSeat) : null;

  // Everyone's turn shows the shared 30s countdown: yours lives in the banner
  // pill (BannerStrip), another seat's in the top-bar label (TopBar). Both leaves
  // append the live "- Ns" internally from the deadline we hand them, so this
  // label stays static and the countdown never re-renders the whole table.
  const turnLabel =
    status === 'reconnecting'
      ? 'Reconnecting...'
      : isMyTurn
        ? 'Your turn'
        : currentSeat != null
          ? `${playerLabel(view, currentSeat)}'s turn`
          : '';
  // Only the top bar (another seat's turn) gets the deadline; on your own turn
  // the countdown lives in the banner pill instead, and reconnecting shows no
  // countdown at all.
  const topBarDeadline =
    status !== 'reconnecting' && !isMyTurn && currentSeat != null ? turnDeadline : null;

  const canPass = isMyTurn && lead !== null;

  // Fresh-start deal overlay. Rendered ALONE inside the panel (the live table is
  // hidden underneath, exactly as the bot table hides its table during dealing),
  // synthesizing the deal from the viewer's own hand + per-seat counts. Tap to
  // skip; onDone reveals the live table. All hooks above have already run, so
  // this early return never trips the rules of hooks.
  if (dealing && yourSeat != null) {
    const seatCounts = Array.from({ length: view.seats }, (_, s) =>
      s === yourSeat
        ? view.yourHand?.length ?? 13
        : view.players.find((p) => p.seat === s)?.handCount ?? 13,
    );
    const dealNames = Array.from({ length: view.seats }, (_, s) => playerLabel(view, s));
    return (
      <TablePanel>
        <DealingAnimation
          mode="online"
          yourSeat={yourSeat}
          yourCards={view.yourHand ?? []}
          seatCounts={seatCounts}
          playerNames={dealNames}
          onDone={() => setDealing(false)}
        />
      </TablePanel>
    );
  }

  return (
    <TablePanel>
      <View style={styles.tableColumn}>
        <TopBar
          title={`${LEVEL_LABEL[view.botLevel]} online`}
          turnLabel={turnLabel}
          turnDeadline={topBarDeadline}
          timer={formatTime(elapsedMs)}
          onBack={onExit}
          compact={compact}
        />

        {/* Opponents arc around the top; the viewer sits at the bottom with
            their hand. A single opponent (2-player room) centers; two or three
            spread across the row. */}
        <View
          style={[
            styles.oppRow,
            compact && styles.oppRowCompact,
            singleOpponent && styles.oppRowSingle,
          ]}
        >
          {slots.map((slot) => {
            const p = view.players.find((pl) => pl.seat === slot.seat);
            if (!p) return null;
            const disconnected = p.kind === 'human' && !p.connected;
            return (
              <SeatPlate
                key={slot.seat}
                name={p.username ?? (p.kind === 'bot' ? `Bot ${slot.seat + 1}` : 'Player')}
                avatarSource={p.kind === 'bot' ? BOT_AVATAR_IMG : undefined}
                isCurrent={currentSeat === slot.seat}
                place={placeOf(slot.seat)}
                passed={passedOf(slot.seat)}
                count={p.handCount}
                raised={slot.raised}
                compact={compact}
                disconnected={disconnected}
              />
            );
          })}
        </View>

        {/* Center: the played pool is the hero, PASS above / PLAY below in the
            same slots the bot table uses. */}
        <PoolRegion
          lastPlay={
            lastPlay
              ? {
                  cards: lastPlay.combo.cards,
                  playerName: playerLabel(view, lastPlay.playerIndex),
                  label: comboLabel(lastPlay.combo),
                }
              : null
          }
          prevPlay={prevPlay ? { cards: prevPlay.combo.cards } : null}
          emptyText={
            isMyTurn
              ? 'Your turn, lead with any hand'
              : currentSeat != null
                ? `${playerLabel(view, currentSeat)} to lead`
                : 'Waiting...'
          }
          compact={compact}
          passSlot={
            <Pressable
              style={({ pressed }) => [styles.btn, styles.btnPass, styles.centerActionBtn, compact && styles.centerActionBtnCompact, pressed && canPass && styles.btnPressed, !canPass && styles.btnDisabled]}
              hitSlop={compact ? CENTER_ACTION_HIT_SLOP : undefined}
              disabled={!canPass}
              onPress={onPassPress}
            >
              <Text style={styles.btnText}>Pass</Text>
            </Pressable>
          }
          playSlot={
            <Pressable
              style={({ pressed }) => [styles.btn, styles.btnPrimary, styles.centerActionBtn, compact && styles.centerActionBtnCompact, pressed && isMyTurn && selLegal && styles.btnPressed, (!isMyTurn || !selLegal) && styles.btnDisabled]}
              hitSlop={compact ? CENTER_ACTION_HIT_SLOP : undefined}
              disabled={!isMyTurn || !selLegal}
              onPress={onPlayPress}
            >
              <Text style={[styles.btnText, styles.btnPrimaryText]}>Play</Text>
            </Pressable>
          }
        />

        {/* Bottom: the viewer's seat + hand. */}
        <View style={[styles.bottom, compact && styles.bottomCompact, isMyTurn && styles.bottomActive]}>
          {isMyTurn && (
            <Image
              source={TURN_GLOW_IMG}
              style={styles.turnGlow}
              resizeMode="contain"
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          )}
          {/* Fixed-height headroom strip: the "Your turn - Ns" pill, and server
              errors, render INSIDE it so nothing below ever shifts as the
              countdown ticks or a message appears. */}
          <BannerStrip
            autoPassing={autoPassing}
            error={localError ?? error}
            isMyTurn={isMyTurn}
            compact={compact}
            deadline={isMyTurn ? turnDeadline : null}
            reconnecting={status === 'reconnecting'}
          />
          <View style={[styles.handToolbar, compact && styles.handToolbarCompact]}>
            <View style={styles.handToolbarLeft}>
              <Avatar name={humanName} url={profile?.avatarUrl ?? null} size={24} framed active={isMyTurn} />
              <Text style={styles.youName} numberOfLines={1} ellipsizeMode="tail">{humanName}</Text>
              <SeatChip passed={humanPassed} place={humanPlace} />
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
            hand={handOrder}
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

// --- Lobby -------------------------------------------------------------------

function LobbySection({
  view,
  joinLink,
  isHost,
  copied,
  onStart,
  onShare,
}: {
  view: OnlineRoomView;
  joinLink: string;
  isHost: boolean;
  copied: boolean;
  onStart: () => void;
  onShare: () => void;
}) {
  const emptySeats = Math.max(0, view.seats - view.players.length);

  return (
    <>
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Players</Text>
        {view.players.map((p) => (
          <View key={p.seat} style={styles.playerRow}>
            <Text style={styles.playerName} numberOfLines={1} ellipsizeMode="tail">
              {p.username ?? 'Player'}
            </Text>
            <Text style={styles.playerStatus}>{p.connected ? 'Connected' : 'Waiting'}</Text>
          </View>
        ))}
        {Array.from({ length: emptySeats }).map((_, i) => (
          <View key={`empty-${i}`} style={styles.playerRow}>
            <Text style={styles.playerNameEmpty}>Open seat</Text>
            <Text style={styles.playerStatusEmpty}>Bot if unfilled</Text>
          </View>
        ))}
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Invite</Text>
        <Text style={styles.roomCode}>{view.code}</Text>
        <Text style={styles.roomLink} numberOfLines={1}>
          {joinLink}
        </Text>
        <Button title={copied ? 'Copied' : 'Share link'} variant="secondary" onPress={onShare} style={styles.shareBtn} />
      </Card>

      {isHost ? (
        <Button title="Start game" onPress={onStart} />
      ) : (
        <Text style={styles.waitingHost}>Waiting for the host to start.</Text>
      )}
    </>
  );
}

// --- Finished ------------------------------------------------------------------

function FinishedSection({
  view,
  profile,
  onHome,
}: {
  view: OnlineRoomView;
  profile: { displayName: string; avatarUrl: string | null } | null;
  onHome: () => void;
}) {
  // Headline based on the viewer's placement, mirroring the bot table: 1st is a
  // win, dead last is a loss, anything in between is a neutral "Hand over".
  const yourSeat = view.yourSeat;
  const order = view.finishOrder;
  const youWon = yourSeat != null && order[0] === yourSeat;
  const youLast = yourSeat != null && order[order.length - 1] === yourSeat;
  const headline = youWon ? 'You won!' : youLast ? 'You lost' : 'Hand over';

  return (
    <>
      <Card style={styles.section}>
        <Text style={styles.finishHeadline}>{headline}</Text>
        <Text style={styles.sectionTitle}>Finish order</Text>
        {order.map((seat, i) => {
          const p = view.players.find((pl) => pl.seat === seat);
          const isYou = yourSeat != null && seat === yourSeat;
          const isBot = p?.kind === 'bot';
          const name = playerLabel(view, seat);
          return (
            <View key={seat} style={styles.finishRow}>
              <Text style={styles.finishPlace}>{i + 1}.</Text>
              <Avatar
                name={name}
                url={isYou ? profile?.avatarUrl ?? null : null}
                localSource={isBot ? BOT_AVATAR_IMG : undefined}
                size={24}
                style={styles.finishAvatar}
              />
              <Text style={styles.playerName} numberOfLines={1} ellipsizeMode="tail">
                {name}
              </Text>
            </View>
          );
        })}
      </Card>
      <Button title="Back to home" onPress={onHome} />
    </>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: spacing.xl },
  reconnectBanner: {
    backgroundColor: withAlpha(colors.gold, 0.18),
    borderRadius: radii.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  reconnectText: { color: colors.felt, fontWeight: '700', fontSize: typography.caption.fontSize, textAlign: 'center' },
  errorBanner: {
    backgroundColor: colors.dangerSoftBg,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.dangerSoftBorder,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  errorBannerText: { color: colors.dangerSoftText, fontSize: typography.caption.fontSize, textAlign: 'center' },

  section: { marginBottom: spacing.md },
  sectionTitle: { ...typography.label, color: colors.felt, fontWeight: '700', marginBottom: spacing.sm },
  playerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs + 2,
  },
  playerName: { ...typography.bodyBold, color: colors.textPrimary, flex: 1, minWidth: 0, marginRight: spacing.sm },
  playerStatus: { ...typography.caption, color: colors.textMuted },
  playerNameEmpty: { ...typography.body, color: colors.textFaint, flex: 1, marginRight: spacing.sm },
  playerStatusEmpty: { ...typography.caption, color: colors.textFaint },
  roomCode: { fontSize: 28, fontWeight: '800', color: colors.felt, letterSpacing: 4, marginBottom: spacing.xs },
  roomLink: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.md },
  shareBtn: { alignSelf: 'stretch' },
  waitingHost: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.md },

  finishHeadline: { ...typography.heading, color: colors.felt, marginBottom: spacing.sm },
  finishRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs + 2 },
  finishAvatar: { marginHorizontal: spacing.sm },
  finishPlace: { ...typography.subheading, color: colors.felt, width: 32 },

  // --- Live table (mirrors app/game-local.tsx's playing layout) ---------------
  tableColumn: { flex: 1, width: '100%' },

  oppRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  oppRowCompact: { paddingVertical: 2 },
  // A single opponent (2-player room) centers instead of pinning to the far
  // left, so it reads as sitting opposite the viewer.
  oppRowSingle: { justifyContent: 'center' },

  bottom: {
    paddingBottom: spacing.md - 2,
    paddingTop: spacing.sm,
    borderTopWidth: 2,
    borderTopColor: 'transparent',
  },
  bottomCompact: { paddingTop: 2, paddingBottom: spacing.xs },
  bottomActive: {
    borderTopColor: colors.gold,
    backgroundColor: withAlpha(colors.gold, 0.05),
  },
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
  handToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg - 4,
    marginBottom: spacing.xs + 2,
  },
  handToolbarCompact: { marginBottom: 2 },
  handToolbarLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  youName: { color: colors.textOnFelt, fontSize: typography.caption.fontSize, fontWeight: '700', flex: 1, minWidth: 0 },
  selLabel: { color: colors.textOnFeltMuted, fontSize: typography.caption.fontSize },
  selOk: { color: colors.success, fontWeight: '700' },
  selBad: { color: colors.dangerLight, fontWeight: '600' },

  // Play / Pass centered around the pool, sized identically to the bot table.
  centerActionBtn: { minWidth: 150, marginVertical: spacing.md },
  centerActionBtnCompact: { minHeight: 36, paddingVertical: 6, minWidth: 96, marginVertical: 3 },
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
  btnPressed: { borderBottomWidth: 0, transform: [{ translateY: 4 }] },
  btnPrimary: { backgroundColor: colors.gold, borderBottomColor: colors.goldEdge },
  btnPrimaryText: { color: colors.ink },
  btnPass: { backgroundColor: colors.dangerBright, borderBottomColor: colors.dangerEdge },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: colors.textOnFelt, fontWeight: '800', fontSize: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
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
});
