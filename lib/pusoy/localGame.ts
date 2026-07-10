// Local game state container. Used for bot mode (and will be reused for the
// Bluetooth mode in the next round). No network, no Supabase — everything
// lives in memory and drives the UI directly.

import { buildDeck, dealFour, shuffle, RANK_VALUE } from './deck';
import { detectCombo, detectFiveCard, compareCombos, canPlay } from './combo';
import { applyAction, applyTimeout, handFinishOrder, isHandOver, newHand } from './engine';
import { botChoose } from './bot';
import type {
  BotLevel,
  Card,
  HandState,
  PlayedCombo,
  PublicGameView,
  RoundAction,
} from './types';

const BOT_MIN_DELAY_MS = 900;
const BOT_MAX_DELAY_MS = 2_400;

export type LocalPlayer = 'human' | 'bot';

export interface DealStep {
  // One card from the deal sequence. `seat` is the player who receives the
  // card; `cardIndex` is its position in the deck (0..51). The dealing
  // animation iterates this in order.
  seat: number;
  cardIndex: number;
}

export type Phase = 'dealing' | 'playing' | 'finished';

export interface LocalGame {
  id: string;
  playerIds: string[]; // 4 player ids, seat 0..3
  playerKinds: LocalPlayer[]; // parallel
  // The unshuffled 52-card deck BEFORE the deal — used by the dealing
  // animation to fly each card from the center to its seat.
  deck: Card[];
  // dealOrder[i] = the i-th card dealt, with the seat it went to.
  dealOrder: DealStep[];
  hands: Card[][]; // 4 hands in seat order
  handState: HandState;
  // Difficulty of every bot at the table.
  level: BotLevel;
  // Every card played face-up so far, in play order. The expert bot counts
  // these to work out when one of its cards has become the live maximum.
  playedCards: Card[];
  phase: Phase;
  startedAt: number;
  finishedAt: number | null;
  finishOrder: number[];
  // history of lead-combo plays (most recent first). Used for the center
  // "trick pile" rendering.
  trickHistory: { playerIndex: number; combo: PlayedCombo }[];
  listeners: Set<() => void>;
  botTimers: ReturnType<typeof setTimeout>[];
  // Stats (in-memory only; bot mode is for fun)
  stats: Record<string, { wins: number; losses: number }>;
}

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

// Build a deal sequence so the animation can show each card leaving the
// deck and arriving at a seat. We deal 13 cards per seat, going p0, p1, p2,
// p3, p0, p1, p2, p3, ... — the same order as `dealFour` so the resulting
// hands are identical to a direct call.
function buildDealOrder(): DealStep[] {
  const out: DealStep[] = [];
  for (let cardIndex = 0; cardIndex < 52; cardIndex++) {
    out.push({ seat: cardIndex % 4, cardIndex });
  }
  return out;
}

export function createLocalGame(
  botCount: number,
  displayName: string,
  level: BotLevel = 'normal',
): LocalGame {
  if (botCount < 1 || botCount > 3) {
    throw new Error('botCount must be 1, 2, or 3');
  }
  const playerIds = [uid('p')];
  const playerKinds: LocalPlayer[] = ['human'];
  for (let i = 0; i < botCount; i++) {
    playerIds.push(uid('b'));
    playerKinds.push('bot');
  }
  while (playerIds.length < 4) {
    playerIds.push(uid('b'));
    playerKinds.push('bot');
  }
  // Shuffle seats so the human isn't always at index 0.
  const seats = [0, 1, 2, 3];
  for (let i = seats.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [seats[i], seats[j]] = [seats[j], seats[i]];
  }
  const orderedIds = seats.map((s) => playerIds[s]);
  const orderedKinds = seats.map((s) => playerKinds[s]);

  const deck = shuffle(buildDeck());
  const hands = dealFour(deck);

  // Bot mode has no turn timer.
  const handState = newHand('g-' + Date.now(), orderedIds, hands, 1, 'h-' + Date.now(), {
    turnMs: null,
  });

  return {
    id: 'g-' + Date.now(),
    playerIds: orderedIds,
    playerKinds: orderedKinds,
    deck,
    dealOrder: buildDealOrder(),
    hands,
    handState,
    level,
    playedCards: [],
    phase: 'dealing',
    startedAt: Date.now(),
    finishedAt: null,
    finishOrder: [],
    trickHistory: [],
    listeners: new Set(),
    botTimers: [],
    stats: {
      [displayName]: { wins: 0, losses: 0 },
    },
  };
}

// Caller invokes this once the dealing animation has finished.
export function startGame(game: LocalGame): void {
  if (game.phase !== 'dealing') return;
  game.phase = 'playing';
  scheduleBots(game);
  emit(game);
}

function emit(game: LocalGame) {
  for (const l of game.listeners) l();
}

export function subscribe(game: LocalGame, fn: () => void): () => void {
  game.listeners.add(fn);
  return () => game.listeners.delete(fn);
}

export function findHumanSeat(game: LocalGame): number {
  return game.playerKinds.findIndex((k) => k === 'human');
}

// Play or pass for the human. Throws on illegal action.
export function humanAct(
  game: LocalGame,
  action: RoundAction,
  cards?: Card[],
): void {
  if (game.phase !== 'playing') {
    throw new Error('game not in play phase');
  }
  const humanSeat = findHumanSeat(game);
  if (game.handState.currentPlayerIndex !== humanSeat) {
    throw new Error('not your turn');
  }
  if (action.kind === 'play') {
    if (!cards) throw new Error('play action requires cards');
    const combo = detectCombo(cards);
    if (!combo) throw new Error('illegal combo');
    if (!canPlay(combo, game.handState.leadCombo)) {
      throw new Error('combo does not beat lead');
    }
  }
  const hand = game.hands[humanSeat];
  const next = applyAction(game.handState, humanSeat, hand, action);
  game.handState = next;
  if (action.kind === 'play' && cards) {
    game.trickHistory = [{ playerIndex: humanSeat, combo: action.combo }, ...game.trickHistory].slice(0, 8);
    game.playedCards.push(...action.combo.cards);
    game.hands[humanSeat] = hand.filter(
      (c) => !cards.find((pc) => pc.id === c.id),
    );
  }
  if (isHandOver(game.handState)) {
    finalizeHand(game);
  } else {
    scheduleBots(game);
  }
  emit(game);
}

// Reorder the human's hand. UI calls this when the user drags a card.
export function reorderHumanHand(game: LocalGame, fromIndex: number, toIndex: number): void {
  const seat = findHumanSeat(game);
  const hand = game.hands[seat];
  if (fromIndex < 0 || fromIndex >= hand.length) return;
  if (toIndex < 0 || toIndex > hand.length) return;
  const next = hand.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex > fromIndex ? toIndex - 1 : toIndex, 0, moved);
  game.hands[seat] = next;
  emit(game);
}

export type SortMode = 'rank' | 'suit' | 'hands';

// Display order for grouping suits in the hand (not strength order).
const SUIT_DISPLAY: Record<Card['suit'], number> = { C: 1, D: 2, H: 3, S: 4 };

// Auto-sort the human's hand.
//   rank  — rank ascending, suit tiebreak
//   suit  — group by suit, rank ascending within each
//   hands — group into playable combos: singles, pairs, trips, 5-card hands
export function sortHumanHand(game: LocalGame, mode: SortMode = 'rank'): void {
  const seat = findHumanSeat(game);
  const hand = game.hands[seat];
  if (mode === 'hands') {
    game.hands[seat] = arrangeByCombos(hand);
  } else if (mode === 'suit') {
    game.hands[seat] = hand.slice().sort((a, b) => {
      const s = SUIT_DISPLAY[a.suit] - SUIT_DISPLAY[b.suit];
      if (s !== 0) return s;
      return RANK_VALUE[a.rank] - RANK_VALUE[b.rank];
    });
  } else {
    game.hands[seat] = hand.slice().sort((a, b) => {
      const r = RANK_VALUE[a.rank] - RANK_VALUE[b.rank];
      if (r !== 0) return r;
      return SUIT_DISPLAY[a.suit] - SUIT_DISPLAY[b.suit];
    });
  }
  emit(game);
}

// Arrange a hand into playable groups, junk on the left, big hands on the
// right: singles, then pairs, then trips, then 5-card combos. Greedy: the
// strongest 5-card combo is extracted first so a straight flush isn't broken
// up to form a plain flush.
function arrangeByCombos(hand: Card[]): Card[] {
  let remaining = hand.slice();
  const fives: PlayedCombo[] = [];
  while (remaining.length >= 5) {
    let best: PlayedCombo | null = null;
    const n = remaining.length;
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++)
        for (let c = b + 1; c < n; c++)
          for (let d = c + 1; d < n; d++)
            for (let e = d + 1; e < n; e++) {
              const combo = detectFiveCard([
                remaining[a], remaining[b], remaining[c], remaining[d], remaining[e],
              ]);
              if (combo && (!best || compareCombos(combo, best) > 0)) best = combo;
            }
    if (!best) break;
    fives.push(best);
    const ids = new Set(best.cards.map((c) => c.id));
    remaining = remaining.filter((c) => !ids.has(c.id));
  }
  fives.sort((a, b) => compareCombos(a, b));

  const byRank = new Map<Card['rank'], Card[]>();
  for (const c of remaining) {
    const list = byRank.get(c.rank) ?? [];
    list.push(c);
    byRank.set(c.rank, list);
  }
  const trips: Card[][] = [];
  const pairs: Card[][] = [];
  const singles: Card[] = [];
  for (const cards of byRank.values()) {
    cards.sort((a, b) => SUIT_DISPLAY[a.suit] - SUIT_DISPLAY[b.suit]);
    if (cards.length >= 3) {
      trips.push(cards.slice(0, 3));
      singles.push(...cards.slice(3));
    } else if (cards.length === 2) {
      pairs.push(cards);
    } else {
      singles.push(...cards);
    }
  }
  const byGroupRank = (a: Card[], b: Card[]) => RANK_VALUE[a[0].rank] - RANK_VALUE[b[0].rank];
  trips.sort(byGroupRank);
  pairs.sort(byGroupRank);
  singles.sort((a, b) => {
    const r = RANK_VALUE[a.rank] - RANK_VALUE[b.rank];
    if (r !== 0) return r;
    return SUIT_DISPLAY[a.suit] - SUIT_DISPLAY[b.suit];
  });

  return [
    ...singles,
    ...pairs.flat(),
    ...trips.flat(),
    ...fives.flatMap((f) => f.cards),
  ];
}

function finalizeHand(game: LocalGame) {
  const order = handFinishOrder(game.handState);
  game.finishOrder = order;
  game.finishedAt = Date.now();
  game.phase = 'finished';
  for (const t of game.botTimers) clearTimeout(game.botTimers.pop() as any);
  game.botTimers = [];
  // Tally stats
  for (let i = 0; i < order.length - 1; i++) {
    // order[0] won, order[last] lost
  }
  // The "first to empty" is the winner; the last is the loser. Everyone in
  // between tied on position. We record wins/losses against the player who
  // came last (the "loser of the hand").
  const winnerSeat = order[0];
  const loserSeat = order[order.length - 1];
  if (winnerSeat === findHumanSeat(game)) {
    const s = game.stats['You'] || (game.stats['You'] = { wins: 0, losses: 0 });
    s.wins += 1;
  } else if (loserSeat === findHumanSeat(game)) {
    const s = game.stats['You'] || (game.stats['You'] = { wins: 0, losses: 0 });
    s.losses += 1;
  }
}

export function publicView(game: LocalGame, _viewingSeat: number): PublicGameView {
  return {
    gameId: game.id,
    playerIds: game.playerIds,
    handState: game.handState,
    handSizes: game.hands.map((h) => h.length),
    finishOrder: game.finishOrder,
    finishedAt: game.finishedAt,
    startedAt: game.startedAt,
  };
}

function scheduleBots(game: LocalGame) {
  for (const t of game.botTimers) clearTimeout(t);
  game.botTimers = [];

  for (let seat = 0; seat < 4; seat++) {
    if (game.playerKinds[seat] !== 'bot') continue;
    if (game.handState.finishedOrder.includes(seat)) continue;
    if (game.handState.currentPlayerIndex === seat) {
      const delay =
        BOT_MIN_DELAY_MS +
        Math.random() * (BOT_MAX_DELAY_MS - BOT_MIN_DELAY_MS);
      const t = setTimeout(() => {
        const hand = game.hands[seat];
        const lead = game.handState.leadCombo;
        const choice = botChoose(hand, lead, {
          level: game.level,
          context: {
            seat,
            playedCards: game.playedCards,
            handSizes: game.hands.map((h) => h.length),
          },
        });
        try {
          if (choice) {
            const next = applyAction(
              game.handState,
              seat,
              hand,
              { kind: 'play', combo: choice },
            );
            game.handState = next;
            game.trickHistory = [{ playerIndex: seat, combo: choice }, ...game.trickHistory].slice(0, 8);
            game.playedCards.push(...choice.cards);
            game.hands[seat] = hand.filter(
              (c) => !choice.cards.find((pc) => pc.id === c.id),
            );
          } else {
            const next = applyAction(
              game.handState,
              seat,
              hand,
              { kind: 'pass' },
            );
            game.handState = next;
          }
          if (isHandOver(game.handState)) {
            finalizeHand(game);
          } else {
            scheduleBots(game);
          }
          emit(game);
        } catch (e) {
          console.warn('bot act failed', e);
        }
      }, delay);
      game.botTimers.push(t);
      break;
    }
  }
}

// For bot mode there is no turn deadline, so this is a no-op. Kept for API
// parity with the future online implementation.
export function checkTimeout(_game: LocalGame) {
  // no-op
}
