// Local game state container. Used for bot mode (and will be reused for the
// Bluetooth mode in the next round). No network, no Supabase — everything
// lives in memory and drives the UI directly.

import { buildDeck, dealFour, shuffle } from './deck';
import { detectCombo, canPlay } from './combo';
import { applyAction, applyTimeout, handFinishOrder, isHandOver, newHand } from './engine';
import { botChoose } from './bot';
import type {
  Card,
  GameState,
  HandState,
  PlayedCombo,
  PlayerPublicStats,
  PublicGameView,
  RoundAction,
} from './types';

const HAND_MS = 15_000;
const BOT_MIN_DELAY_MS = 800;
const BOT_MAX_DELAY_MS = 2_500;

export type LocalPlayer = 'human' | 'bot';

export interface LocalGame {
  id: string;
  playerIds: string[]; // ['p0', 'p1', 'p2', 'p3'] — human is index 0 in bot mode
  playerKinds: LocalPlayer[]; // parallel to playerIds
  hands: Card[][]; // 4 hands
  handState: HandState;
  startedAt: number;
  finishedAt: number | null;
  finishOrder: number[]; // seat indexes in order of emptying
  listeners: Set<() => void>;
  botTimers: ReturnType<typeof setTimeout>[];
  // Stats (in-memory only; bot mode is for fun, not persisted to a server)
  stats: Record<string, { wins: number; losses: number }>;
}

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createLocalGame(
  botCount: number,
  displayName: string,
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
  // Shuffle seats so the human doesn't always go first.
  const seats = [0, 1, 2, 3];
  for (let i = seats.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [seats[i], seats[j]] = [seats[j], seats[i]];
  }
  const orderedIds = seats.map((s) => playerIds[s]);
  const orderedKinds = seats.map((s) => playerKinds[s]);

  const deck = shuffle(buildDeck());
  const hands = dealFour(deck);
  // For bot mode we want the human's hand to be playable. The 13-card hand
  // is whatever the deal gave them. We could re-shuffle if it's truly awful
  // (e.g. all high cards, no straights) but for the vertical slice, accept
  // the deal.

  const handState = newHand(
    'g-' + Date.now(),
    orderedIds,
    hands,
    1,
    Math.floor(Math.random() * 4),
    'h-' + Date.now(),
  );

  return {
    id: 'g-' + Date.now(),
    playerIds: orderedIds,
    playerKinds: orderedKinds,
    hands,
    handState,
    startedAt: Date.now(),
    finishedAt: null,
    finishOrder: [],
    listeners: new Set(),
    botTimers: [],
    stats: {
      [displayName]: { wins: 0, losses: 0 },
    },
  };
}

function emit(game: LocalGame) {
  for (const l of game.listeners) l();
}

export function subscribe(game: LocalGame, fn: () => void): () => void {
  game.listeners.add(fn);
  return () => game.listeners.delete(fn);
}

export function isHumanTurn(game: LocalGame, humanSeat: number): boolean {
  return (
    game.handState.currentPlayerIndex === humanSeat &&
    !game.handState.finishedOrder.includes(humanSeat)
  );
}

export function findHumanSeat(game: LocalGame): number {
  return game.playerKinds.findIndex((k) => k === 'human');
}

// Play or pass for the human. Returns the new state or throws.
export function humanAct(
  game: LocalGame,
  action: RoundAction,
  cards?: Card[],
): void {
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
  // remove played cards from hand
  if (action.kind === 'play' && cards) {
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

function finalizeHand(game: LocalGame) {
  const order = handFinishOrder(game.handState);
  game.finishOrder = order;
  game.finishedAt = Date.now();
  // clear any pending bot timers
  for (const t of game.botTimers) clearTimeout(t);
  game.botTimers = [];
}

export function publicView(game: LocalGame, viewingSeat: number): PublicGameView {
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

  // If it's the human's turn, do nothing. Otherwise, schedule bot moves.
  for (let seat = 0; seat < 4; seat++) {
    if (game.playerKinds[seat] !== 'bot') continue;
    if (game.handState.finishedOrder.includes(seat)) continue;
    // If this seat is the current player, schedule a play.
    if (game.handState.currentPlayerIndex === seat) {
      const delay =
        BOT_MIN_DELAY_MS +
        Math.random() * (BOT_MAX_DELAY_MS - BOT_MIN_DELAY_MS);
      const t = setTimeout(() => {
        const hand = game.hands[seat];
        const lead = game.handState.leadCombo;
        const choice = botChoose(hand, lead);
        try {
          if (choice) {
            const next = applyAction(
              game.handState,
              seat,
              hand,
              { kind: 'play', combo: choice },
            );
            game.handState = next;
            game.hands[seat] = hand.filter(
              (c) => !choice.cards.find((pc) => pc.id === c.id),
            );
          } else {
            // pass
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
          // If the bot throws (e.g. timeout already passed), treat as pass.
          console.warn('bot act failed', e);
        }
      }, delay);
      game.botTimers.push(t);
      break; // one bot per tick; the rest will re-schedule
    }
  }
}

// Auto-progress: if the human's turn has timed out, simulate an auto-pass.
export function checkTimeout(game: LocalGame) {
  if (!game.handState.turnDeadline) return;
  if (Date.now() < game.handState.turnDeadline) return;
  const seat = game.handState.currentPlayerIndex;
  if (game.playerKinds[seat] === 'bot') {
    // bot should be moving on its own timer; if it timed out, force a pass.
    const next = applyTimeout(game.handState, seat);
    game.handState = next;
    if (isHandOver(game.handState)) finalizeHand(game);
    else scheduleBots(game);
    emit(game);
    return;
  }
  // human timeout: treat as pass (engine rejects pass on opening; in that
  // case the engine leaves the state alone, so the player is still on the
  // hook until they act or the next human timeout check fires).
  if (game.handState.leadCombo !== null) {
    const next = applyTimeout(game.handState, seat);
    game.handState = next;
    if (isHandOver(game.handState)) finalizeHand(game);
    else scheduleBots(game);
    emit(game);
  }
}

// Time helpers
export const TURN_DURATION_MS = HAND_MS;
