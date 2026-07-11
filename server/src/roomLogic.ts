// Pure room logic for the GameRoom Durable Object: seat assignment, start,
// server-authoritative action application, bot turns, timeouts, and per-viewer
// redaction. It imports the SAME engine the app's bot mode uses (lib/pusoy),
// so there is one rules implementation and no client/server drift.
//
// Everything here is pure over a RoomState value (deterministic given an rng),
// so the security-critical pieces - out-of-turn rejection, hand redaction, the
// finish/timeout paths - are unit-testable in node with no Workers runtime. The
// DO (room.ts) is a thin shell that persists this state and wires WebSockets,
// alarms, and the D1 auto-friend / stats writes around it.

import type { BotLevel, Card, HandState, PlayedCombo, RoundAction, Rng } from '../../lib/pusoy/types';
import { buildDeck, dealN, shuffle } from '../../lib/pusoy/deck';
import {
  applyAction,
  applyTimeout,
  handFinishOrder,
  isHandOver,
  newHand,
} from '../../lib/pusoy/engine';
import { botChoose } from '../../lib/pusoy/bot';
import { canPlay, detectCombo } from '../../lib/pusoy/combo';

// Online turns are 30 seconds (R12). Bot mode is untimed; this is the online
// value threaded into the shared engine's per-hand turnMs.
export const ONLINE_TURN_MS = 30_000;

// Unambiguous room-code alphabet: no 0/O/1/I/L so a shared link is easy to read
// and retype.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateRoomCode(rng: Rng = Math.random, length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  }
  return out;
}

export interface SeatPlayer {
  seat: number;
  userId: string | null; // null for a bot seat
  username: string | null;
  kind: 'human' | 'bot';
  connected: boolean;
}

export type RoomPhase = 'lobby' | 'playing' | 'finished';

export interface RoomState {
  code: string;
  seats: number; // 2-4
  hostUserId: string;
  botLevel: BotLevel;
  phase: RoomPhase;
  // During lobby: the seated humans, seat = join order. At start, bot seats are
  // appended so players.length === seats.
  players: SeatPlayer[];
  hands: Card[][] | null; // per-seat hands (private); present once playing
  handState: HandState | null;
  playedCards: Card[];
  trickHistory: { playerIndex: number; combo: PlayedCombo }[];
  finishOrder: number[];
  statsRecorded: boolean;
  createdAt: number;
  // Matchmade rooms only (U3). lobbyDeadline is the wall-clock time the room
  // auto-starts by; expectedUserIds is the set of matched humans whose arrival
  // starts the game early. Both null for invite rooms, which start host-only.
  lobbyDeadline: number | null;
  expectedUserIds: string[] | null;
}

export function createRoomState(
  code: string,
  seats: number,
  hostUserId: string,
  botLevel: BotLevel,
  now: number,
): RoomState {
  return {
    code,
    seats,
    hostUserId,
    botLevel,
    phase: 'lobby',
    players: [],
    hands: null,
    handState: null,
    playedCards: [],
    trickHistory: [],
    finishOrder: [],
    statsRecorded: false,
    createdAt: now,
    lobbyDeadline: null,
    expectedUserIds: null,
  };
}

// The user ids of the seated humans (for auto-friend and stats).
export function humanUserIds(state: RoomState): string[] {
  return state.players.filter((p) => p.kind === 'human' && p.userId).map((p) => p.userId as string);
}

// All unordered pairs of seated human user ids - the pairwise auto-friend set.
export function humanPairs(state: RoomState): [string, string][] {
  const ids = humanUserIds(state);
  const pairs: [string, string][] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) pairs.push([ids[i], ids[j]]);
  }
  return pairs;
}

export type JoinResult =
  | { status: 'joined'; seat: number; rejoined: boolean }
  | { status: 'full' }
  | { status: 'in-progress' };

// Seat a user. A user already in the room reconnects to their existing seat
// (so a mid-game reconnect resumes the same hand). Otherwise a lobby seat is
// assigned in join order; a full lobby, or a join to an already-started game by
// a newcomer, is rejected.
export function joinRoom(state: RoomState, userId: string, username: string | null): JoinResult {
  const existing = state.players.find((p) => p.userId === userId);
  if (existing) {
    existing.connected = true;
    if (username && !existing.username) existing.username = username;
    return { status: 'joined', seat: existing.seat, rejoined: true };
  }
  if (state.phase !== 'lobby') return { status: 'in-progress' };
  const humanCount = state.players.filter((p) => p.kind === 'human').length;
  if (humanCount >= state.seats) return { status: 'full' };
  const seat = state.players.length;
  state.players.push({ seat, userId, username, kind: 'human', connected: true });
  return { status: 'joined', seat, rejoined: false };
}

export function setConnected(state: RoomState, userId: string, connected: boolean): void {
  const p = state.players.find((x) => x.userId === userId);
  if (p) p.connected = connected;
}

export function seatOf(state: RoomState, userId: string): number | null {
  return state.players.find((p) => p.userId === userId)?.seat ?? null;
}

export type StartCheck = 'ok' | 'not-host' | 'not-lobby' | 'need-2';

// Only the host may start, only from the lobby, only with at least 2 humans
// seated (R10).
export function canStart(state: RoomState, byUserId: string): StartCheck {
  if (byUserId !== state.hostUserId) return 'not-host';
  if (state.phase !== 'lobby') return 'not-lobby';
  if (state.players.filter((p) => p.kind === 'human').length < 2) return 'need-2';
  return 'ok';
}

// Whether a matchmade room should auto-start now (U3, R7). Distinct from the
// host-only canStart: no host is involved. True only in a lobby that carries a
// lobbyDeadline, once at least one human is connected AND either the deadline
// has passed or every expected matched human is seated + connected. A lobby with
// zero connected humans never auto-starts (the alarm discards it instead).
export function canAutoStart(state: RoomState, now: number): boolean {
  if (state.phase !== 'lobby') return false;
  if (state.lobbyDeadline == null) return false;
  const connectedHumans = state.players.filter((p) => p.kind === 'human' && p.connected).length;
  if (connectedHumans < 1) return false;
  if (now >= state.lobbyDeadline) return true;
  const expected = state.expectedUserIds;
  if (expected && expected.length > 0) {
    const allArrived = expected.every((uid) =>
      state.players.some((p) => p.kind === 'human' && p.userId === uid && p.connected),
    );
    if (allArrived) return true;
  }
  return false;
}

// Deal and begin. Unfilled seats become bots at the host's difficulty (R10).
// Assumes canStart returned 'ok'.
export function startGame(state: RoomState, rng: Rng = Math.random): void {
  const humanCount = state.players.length;
  for (let seat = humanCount; seat < state.seats; seat++) {
    state.players.push({ seat, userId: null, username: `Bot ${seat + 1}`, kind: 'bot', connected: true });
  }
  const hands = dealN(shuffle(buildDeck(), rng), state.seats);
  const playerIds = state.players.map((p) => p.userId ?? `bot-${p.seat}`);
  state.hands = hands;
  state.handState = newHand(state.code, playerIds, hands, 1, `${state.code}-h1`, { turnMs: ONLINE_TURN_MS });
  state.playedCards = [];
  state.trickHistory = [];
  state.finishOrder = [];
  state.phase = 'playing';
}

export type ActionResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }
  | { status: 'finished'; order: number[] };

// Apply a play/pass for a specific seat. The DO passes the seat derived from the
// authenticated socket, so a client can never act as another seat; here we also
// reject out-of-turn and illegal plays via the shared engine (authoritative).
export function applySeatAction(state: RoomState, seat: number, action: RoundAction): ActionResult {
  if (state.phase !== 'playing' || !state.handState || !state.hands) {
    return { status: 'error', message: 'not playing' };
  }
  if (state.handState.currentPlayerIndex !== seat) {
    return { status: 'error', message: 'not your turn' };
  }
  const hand = state.hands[seat];
  try {
    if (action.kind === 'play') {
      const combo = detectCombo(action.combo.cards);
      if (!combo) return { status: 'error', message: 'illegal combo' };
      if (!canPlay(combo, state.handState.leadCombo)) {
        return { status: 'error', message: 'combo does not beat lead' };
      }
      state.handState = applyAction(state.handState, seat, hand, action);
      state.trickHistory = [{ playerIndex: seat, combo: action.combo }, ...state.trickHistory].slice(0, 8);
      state.playedCards.push(...action.combo.cards);
      state.hands[seat] = hand.filter((c) => !action.combo.cards.find((pc) => pc.id === c.id));
    } else {
      state.handState = applyAction(state.handState, seat, hand, { kind: 'pass' });
    }
  } catch (e) {
    return { status: 'error', message: (e as Error).message };
  }
  return maybeFinish(state);
}

// Advance every consecutive auto-played turn until it is a connected human's
// turn or the hand ends. Two seats play automatically: bots (they act instantly
// server-side, R11) and disconnected humans (someone who left the table keeps
// auto-passing so the game never stalls waiting on them; they resume the moment
// they reconnect). Called after start, after each human action, and on a
// disconnect. A connected human's turn breaks the loop.
export function advanceBots(state: RoomState, rng: Rng = Math.random): ActionResult {
  let guard = 0;
  while (state.phase === 'playing' && state.handState && guard++ < 2000) {
    const seat = state.handState.currentPlayerIndex;
    const player = state.players[seat];
    if (!player) break;
    if (player.kind === 'bot') {
      const hand = state.hands![seat];
      const choice = botChoose(hand, state.handState.leadCombo, {
        level: state.botLevel,
        rng,
        context: { seat, playedCards: state.playedCards, handSizes: state.hands!.map((h) => h.length) },
      });
      const res = applySeatAction(state, seat, choice ? { kind: 'play', combo: choice } : { kind: 'pass' });
      if (res.status !== 'ok') return res;
    } else if (!player.connected) {
      // Disconnected human: force a pass (or the minimal forced move when they
      // are stuck leading) via the shared timeout path, then move on.
      const res = timeoutCurrent(state);
      if (res.status !== 'ok') return res;
    } else {
      break; // a connected human's turn: wait for their action
    }
  }
  return { status: 'ok' };
}

// Auto-pass the current player on turn timeout (R12), via the engine's existing
// timeout path. Used by the DO's turn alarm.
export function timeoutCurrent(state: RoomState): ActionResult {
  if (state.phase !== 'playing' || !state.handState) return { status: 'error', message: 'not playing' };
  const seat = state.handState.currentPlayerIndex;
  state.handState = applyTimeout(state.handState, seat);
  return maybeFinish(state);
}

function maybeFinish(state: RoomState): ActionResult {
  if (state.handState && isHandOver(state.handState)) {
    state.finishOrder = handFinishOrder(state.handState);
    state.phase = 'finished';
    return { status: 'finished', order: state.finishOrder };
  }
  return { status: 'ok' };
}

// --- Per-viewer redaction --------------------------------------------------

export interface PlayerView {
  seat: number;
  username: string | null;
  kind: 'human' | 'bot';
  connected: boolean;
  handCount: number;
}

// What one client receives. The only private field is `yourHand` (that
// viewer's own cards). Everyone else appears as a count; handState carries no
// hands, only indexes/combos/deadlines, so opponents' cards never leave the DO.
export interface RoomView {
  code: string;
  seats: number;
  phase: RoomPhase;
  hostUserId: string;
  botLevel: BotLevel;
  players: PlayerView[];
  yourSeat: number | null;
  yourHand: Card[] | null;
  handState: HandState | null;
  trickHistory: { playerIndex: number; combo: PlayedCombo }[];
  finishOrder: number[];
  turnDeadline: number | null;
}

export function redactStateFor(state: RoomState, viewerSeat: number | null): RoomView {
  const players: PlayerView[] = state.players.map((p) => ({
    seat: p.seat,
    username: p.username,
    kind: p.kind,
    connected: p.connected,
    handCount: state.hands ? state.hands[p.seat].length : 0,
  }));
  return {
    code: state.code,
    seats: state.seats,
    phase: state.phase,
    hostUserId: state.hostUserId,
    botLevel: state.botLevel,
    players,
    yourSeat: viewerSeat,
    yourHand: viewerSeat != null && state.hands ? state.hands[viewerSeat] : null,
    handState: state.handState,
    trickHistory: state.trickHistory,
    finishOrder: state.finishOrder,
    turnDeadline: state.handState?.turnDeadline ?? null,
  };
}

// The finishing place (1-based) of a seat, or 0 if not in the finish order.
export function placeOfSeat(state: RoomState, seat: number): number {
  return state.finishOrder.indexOf(seat) + 1;
}
