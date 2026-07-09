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

export const TURN_MS = 15_000;

export function newHand(
  gameId: string,
  playerIds: string[],
  hands: Card[][],
  roundNumber: number,
  leadPlayerIndex: number,
  handId: string,
): HandState {
  if (playerIds.length !== 4) {
    throw new Error('Pusoy Dos is 4 players');
  }
  if (hands.length !== 4) {
    throw new Error('need 4 hands');
  }
  const now = Date.now();
  return {
    handId,
    roundNumber,
    currentPlayerIndex: leadPlayerIndex,
    leadPlayerIndex,
    leadCombo: null,
    lastPlay: null,
    passed: [],
    finishedOrder: [],
    turnDeadline: now + TURN_MS,
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
    next.lastPlay = { playerIndex, combo };
    if (remaining.length === 0) {
      // player just emptied their hand — they finish the hand
      if (!next.finishedOrder.includes(playerIndex)) {
        next.finishedOrder.push(playerIndex);
      }
    }
  }

  // advance turn
  const aliveIndexes = [0, 1, 2, 3].filter(
    (i) => !next.finishedOrder.includes(i) && !next.passed.includes(i),
  );

  if (aliveIndexes.length === 0) {
    // everyone is either finished or passed. trick is over. The new lead is the
    // player who played the winning card (lastPlay.playerIndex) — unless they
    // themselves just finished, in which case pick the next alive (i.e. with
    // cards) player.
    if (next.finishedOrder.length === 4) {
      // whole hand is done — caller should detect this via isHandOver.
      next.leadCombo = null;
      next.lastPlay = null;
      next.passed = [];
      next.currentPlayerIndex = 0;
      next.leadPlayerIndex = 0;
    } else {
      // some players still have cards. lead the new trick with whoever holds cards.
      next.leadCombo = null;
      next.lastPlay = null;
      next.passed = [];
      // pick the lowest-index player still holding cards
      const holders = [0, 1, 2, 3].filter((i) => !next.finishedOrder.includes(i));
      next.leadPlayerIndex = holders[0];
      next.currentPlayerIndex = holders[0];
    }
  } else if (aliveIndexes.length === 1) {
    // one player still has cards; everyone else either finished or passed.
    // the trick is over. the lone alive player leads the next trick.
    next.leadCombo = null;
    next.lastPlay = null;
    next.passed = [];
    next.leadPlayerIndex = aliveIndexes[0];
    next.currentPlayerIndex = aliveIndexes[0];
  } else {
    // 2+ alive. If the current player just played, rotate to next alive.
    let i = (next.currentPlayerIndex + 1) % 4;
    while (aliveIndexes.indexOf(i) < 0) i = (i + 1) % 4;
    next.currentPlayerIndex = i;
  }

  const now = Date.now();
  next.turnStartedAt = now;
  next.turnDeadline = now + TURN_MS;
  return next;
}

// Auto-action for a player whose turn has timed out.
export function applyTimeout(state: HandState, playerIndex: number): HandState {
  if (state.currentPlayerIndex !== playerIndex) return state;
  const passed = state.passed.slice();
  if (!passed.includes(playerIndex)) passed.push(playerIndex);

  const alive = [0, 1, 2, 3].filter(
    (i) => !state.finishedOrder.includes(i) && !passed.includes(i),
  );
  if (alive.length === 0) {
    // everyone finished or passed.
    const holders = [0, 1, 2, 3].filter((i) => !state.finishedOrder.includes(i));
    const next: HandState = {
      ...state,
      passed,
      leadCombo: null,
      lastPlay: null,
    };
    if (holders.length === 0) {
      // whole hand done
      next.currentPlayerIndex = 0;
      next.leadPlayerIndex = 0;
    } else {
      next.leadPlayerIndex = holders[0];
      next.currentPlayerIndex = holders[0];
    }
    const now = Date.now();
    next.turnStartedAt = now;
    next.turnDeadline = now + TURN_MS;
    return next;
  }
  if (alive.length === 1) {
    const next: HandState = {
      ...state,
      passed,
      leadCombo: null,
      lastPlay: null,
    };
    next.leadPlayerIndex = alive[0];
    next.currentPlayerIndex = alive[0];
    const now = Date.now();
    next.turnStartedAt = now;
    next.turnDeadline = now + TURN_MS;
    return next;
  }
  let i = (playerIndex + 1) % 4;
  while (alive.indexOf(i) < 0) i = (i + 1) % 4;
  const now = Date.now();
  return {
    ...state,
    passed,
    currentPlayerIndex: i,
    turnStartedAt: now,
    turnDeadline: now + TURN_MS,
  };
}

// Hand is over when 3 of 4 players have emptied (the 4th is the "loser" and their
// remaining cards are scored against them — for the vertical slice we end on 3
// finishers; the last player's leftover cards are ignored for ranking but they
// are still appended to finishOrder for completeness).
export function isHandOver(state: HandState): boolean {
  if (state.finishedOrder.length === 4) return true;
  // alternative: 3 finished, 1 leftover
  return state.finishedOrder.length >= 3;
}

export function handFinishOrder(state: HandState): number[] {
  if (state.finishedOrder.length === 4) return state.finishedOrder;
  const remaining = [0, 1, 2, 3].filter((i) => !state.finishedOrder.includes(i));
  return [...state.finishedOrder, ...remaining];
}
