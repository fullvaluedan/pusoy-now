// Engine: turn loop for a single hand of Pusoy Dos.

import type {
  Card,
  GameState,
  HandState,
  PlayedCombo,
  PlayerStatus,
  RoundAction,
} from './types';
import { canPlay, detectCombo } from './combo';
import { lowestCardHolder, lowestCardId } from './deck';

export const TURN_MS = 15_000;
// Sentinel: when a HandState is created with turnMs=null, the UI should not
// show a timer (used for bot mode).
export type TurnDuration = number | null;

export function newHand(
  gameId: string,
  playerIds: string[],
  hands: Card[][],
  roundNumber: number,
  handId: string,
  opts: { turnMs?: number | null; openerIndex?: number } = {},
): HandState {
  const n = playerIds.length;
  if (n < 2 || n > 4) {
    throw new Error('Pusoy Dos is 2 to 4 players');
  }
  if (hands.length !== n) {
    throw new Error(`need ${n} hands`);
  }
  // Determine the opener. If caller supplied openerIndex use that; otherwise
  // find the player who holds the 3 of clubs (the mandatory opener in the
  // canonical Filipino rules). Short-handed the 3 of clubs can land in the
  // dead pile — when no one holds it, the holder of the lowest dealt card
  // opens instead.
  let opener = opts.openerIndex;
  if (opener === undefined) {
    opener = hands.findIndex((h) =>
      h.some((c) => c.rank === '3' && c.suit === 'C'),
    );
    if (opener < 0) {
      opener = lowestCardHolder(hands);
    }
  }
  const openingCardId = hands[opener].some((c) => c.id === lowestCardId(hands)) ? lowestCardId(hands) : undefined;
  const turnMs = opts.turnMs === undefined ? TURN_MS : opts.turnMs;
  const now = Date.now();
  return {
    handId,
    roundNumber,
    playerCount: n,
    currentPlayerIndex: opener,
    leadPlayerIndex: opener,
    leadCombo: null,
    ...(openingCardId ? { openingCardId } : {}),
    lastPlay: null,
    passed: [],
    finishedOrder: [],
    turnMs,
    turnDeadline: turnMs === null ? null : now + turnMs,
    turnStartedAt: now,
  };
}

export function playerStatusFor(gs: GameState, index: number): PlayerStatus {
  if (gs.handState.finishedOrder.includes(index)) return 'finished';
  if (gs.handState.passed.includes(index)) return 'passed';
  return 'playing';
}

// Returns the new HandState after a play. Throws on illegal play.
export function applyAction(
  state: HandState,
  playerIndex: number,
  hand: Card[],
  action: RoundAction,
): HandState {
  if (state.currentPlayerIndex !== playerIndex) {
    throw new Error('not your turn');
  }
  const next: HandState = {
    ...state,
    passed: state.passed.slice(),
    finishedOrder: state.finishedOrder.slice(),
  };

  if (action.kind === 'pass') {
    if (state.leadCombo === null) {
      throw new Error('cannot pass on the opening play');
    }
    if (!next.passed.includes(playerIndex)) next.passed.push(playerIndex);
  } else {
    const combo = detectCombo(action.combo.cards);
    if (!combo) throw new Error('illegal combo');
    if (state.leadCombo === null && state.openingCardId && !combo.cards.some((c) => c.id === state.openingCardId)) {
      throw new Error('opening play must include the 3 of clubs');
    }
    if (!canPlay(combo, state.leadCombo)) {
      throw new Error('combo does not beat lead');
    }
    // remove the played cards from the player's hand
    const remaining = hand.slice();
    for (const c of action.combo.cards) {
      const i = remaining.findIndex((x) => x.id === c.id);
      if (i < 0) throw new Error('card not in hand');
      remaining.splice(i, 1);
    }
    next.leadCombo = combo;
    delete next.openingCardId;
    next.lastPlay = { playerIndex, combo };
    if (remaining.length === 0) {
      // player just emptied their hand — they finish the hand
      if (!next.finishedOrder.includes(playerIndex)) {
        next.finishedOrder.push(playerIndex);
      }
    }
  }

  resolveTurn(next, playerIndex);

  const now = Date.now();
  next.turnStartedAt = now;
  next.turnDeadline = next.turnMs == null ? null : now + next.turnMs;
  return next;
}

// Auto-action for a player whose turn has timed out (a plain pass; callers
// must never time out an opening/leading seat -- that seat has to play, see
// roomLogic.timeoutCurrent).
export function applyTimeout(state: HandState, playerIndex: number): HandState {
  if (state.currentPlayerIndex !== playerIndex) return state;
  const next: HandState = { ...state, passed: state.passed.slice() };
  if (!next.passed.includes(playerIndex)) next.passed.push(playerIndex);
  resolveTurn(next, playerIndex);
  const now = Date.now();
  next.turnStartedAt = now;
  next.turnDeadline = next.turnMs == null ? null : now + next.turnMs;
  return next;
}

// Decide who acts next after `actor` played or passed (mutates `next`).
//  - The trick is over when nobody who could still answer remains: everyone else
//    has passed or gone out. The trick winner (last player to play) then leads
//    the next trick; if the winner just went out, the next seat clockwise that
//    still holds cards leads.
//  - Otherwise play rotates clockwise to the next seat still in the trick.
function resolveTurn(next: HandState, actor: number): void {
  const n = next.playerCount;
  const finished = (i: number) => next.finishedOrder.includes(i);
  const alive = Array.from({ length: n }, (_, i) => i).filter(
    (i) => !finished(i) && !next.passed.includes(i),
  );
  const winner = next.lastPlay ? next.lastPlay.playerIndex : null;

  if (next.finishedOrder.length === n) {
    next.leadCombo = null;
    next.lastPlay = null;
    next.passed = [];
    next.currentPlayerIndex = 0;
    next.leadPlayerIndex = 0;
    return;
  }
  const trickOver = alive.length === 0 || (alive.length === 1 && alive[0] === winner);
  if (trickOver) {
    let leader: number;
    if (winner !== null && !finished(winner)) {
      leader = winner;
    } else {
      leader = (winner ?? actor);
      do leader = (leader + 1) % n; while (finished(leader));
    }
    next.leadCombo = null;
    next.lastPlay = null;
    next.passed = [];
    next.leadPlayerIndex = leader;
    next.currentPlayerIndex = leader;
    return;
  }
  let i = (actor + 1) % n;
  while (alive.indexOf(i) < 0) i = (i + 1) % n;
  next.currentPlayerIndex = i;
}

// Hand is over when 3 of 4 players have emptied (the 4th is the "loser" and their
// remaining cards are scored against them — for the vertical slice we end on 3
// finishers; the last player's leftover cards are ignored for ranking but they
// are still appended to finishOrder for completeness).
export function isHandOver(state: HandState): boolean {
  const n = state.playerCount;
  if (state.finishedOrder.length === n) return true;
  // the hand ends once all but one player is out; the last player's leftover
  // cards are ignored for ranking but appended to the finish order.
  return state.finishedOrder.length >= n - 1;
}

export function handFinishOrder(state: HandState): number[] {
  const n = state.playerCount;
  if (state.finishedOrder.length === n) return state.finishedOrder;
  const seats = Array.from({ length: n }, (_, i) => i);
  const remaining = seats.filter((i) => !state.finishedOrder.includes(i));
  return [...state.finishedOrder, ...remaining];
}
