// Tests for the pure room logic (server/src/roomLogic.ts): seat assignment,
// start, server-authoritative actions, bot turns, redaction, and timeout.
//
// These run in node with no Workers runtime, so the security-critical pieces
// the plan calls out - out-of-turn rejection, hand redaction (seat B never sees
// seat A's cards), the finish path, reconnect-resumes-seat - are proven here.
// The DO wiring (WS hibernation, alarms, D1 auto-friend/stats, unauthenticated
// upgrade rejected) is verified live by the orchestrator with two accounts.
//
// Run: tsx src/room.test.ts (or via npm test)

import {
  ONLINE_TURN_MS,
  advanceBots,
  applySeatAction,
  canStart,
  createRoomState,
  generateRoomCode,
  humanPairs,
  humanUserIds,
  joinRoom,
  placeOfSeat,
  redactStateFor,
  startGame,
  timeoutCurrent,
  type RoomState,
} from './roomLogic';
import { botChoose } from '../../lib/pusoy/bot';
import { makeRng } from '../../lib/pusoy/rng';
import type { RoundAction } from '../../lib/pusoy/types';

let pass = 0;
let fail = 0;

function ok(name: string, cond: boolean, info?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}`, info ?? '');
  }
}

const NOW = 1_700_000_000_000;

function twoSeatRoom(): RoomState {
  return createRoomState('ABC234', 2, 'host-1', 'normal', NOW);
}

function main() {
  // --- generateRoomCode -----------------------------------------------------
  {
    const code = generateRoomCode(makeRng(1));
    ok('a room code is 6 chars', code.length === 6);
    ok('a room code avoids ambiguous characters', /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/.test(code));
    ok('a seeded room code is deterministic', generateRoomCode(makeRng(1)) === code);
  }

  // --- joinRoom: fills seats in order, rejects when full --------------------
  {
    const r = twoSeatRoom();
    const a = joinRoom(r, 'host-1', 'host');
    const b = joinRoom(r, 'friend-1', 'friend');
    ok('the host takes seat 0', a.status === 'joined' && a.seat === 0);
    ok('the next human takes seat 1', b.status === 'joined' && b.seat === 1);
    const c = joinRoom(r, 'stranger-1', 'stranger');
    ok('a third human is rejected from a 2-seat room', c.status === 'full');
  }

  // --- reconnect resumes the same seat -------------------------------------
  {
    const r = twoSeatRoom();
    joinRoom(r, 'host-1', 'host');
    joinRoom(r, 'friend-1', 'friend');
    const again = joinRoom(r, 'friend-1', 'friend');
    ok('a rejoin returns the same seat', again.status === 'joined' && again.seat === 1 && again.rejoined === true);
  }

  // --- auto-friend pairing --------------------------------------------------
  {
    const r = createRoomState('CDE234', 3, 'host-1', 'normal', NOW);
    joinRoom(r, 'host-1', 'a');
    joinRoom(r, 'friend-1', 'b');
    joinRoom(r, 'friend-2', 'c');
    ok('every seated human id is listed', humanUserIds(r).join(',') === 'host-1,friend-1,friend-2');
    ok('all human pairs are produced for auto-friend', humanPairs(r).length === 3);
  }

  // --- canStart -------------------------------------------------------------
  {
    const r = twoSeatRoom();
    joinRoom(r, 'host-1', 'host');
    ok('a non-host cannot start', canStart(r, 'friend-1') === 'not-host');
    ok('the host cannot start with only 1 human', canStart(r, 'host-1') === 'need-2');
    joinRoom(r, 'friend-1', 'friend');
    ok('the host can start with 2 humans', canStart(r, 'host-1') === 'ok');
  }

  // --- startGame ------------------------------------------------------------
  {
    const r = createRoomState('DEF234', 4, 'host-1', 'normal', NOW);
    joinRoom(r, 'host-1', 'host');
    joinRoom(r, 'friend-1', 'friend');
    startGame(r, makeRng(7));
    ok('start fills every seat', r.players.length === 4);
    ok('unfilled seats become bots', r.players.filter((p) => p.kind === 'bot').length === 2);
    ok('start deals 13 to each seat', r.hands != null && r.hands.every((h) => h.length === 13));
    ok('start enters the playing phase', r.phase === 'playing');
    ok('online turns carry the 30s duration', r.handState?.turnMs === ONLINE_TURN_MS);
    ok('a turn deadline is set', r.handState?.turnDeadline != null);
  }

  // --- out-of-turn rejected -------------------------------------------------
  {
    const r = twoSeatRoom();
    joinRoom(r, 'host-1', 'host');
    joinRoom(r, 'friend-1', 'friend');
    startGame(r, makeRng(3));
    const opener = r.handState!.currentPlayerIndex;
    const notMySeat = opener === 0 ? 1 : 0;
    const res = applySeatAction(r, notMySeat, { kind: 'pass' });
    ok('an action from a seat whose turn it is not is rejected', res.status === 'error' && res.message === 'not your turn');
  }

  // --- redaction: seat B never sees seat A's cards --------------------------
  {
    const r = twoSeatRoom();
    joinRoom(r, 'host-1', 'host');
    joinRoom(r, 'friend-1', 'friend');
    startGame(r, makeRng(11));
    const view1 = redactStateFor(r, 1);
    ok('the viewer sees their own full hand', view1.yourHand != null && view1.yourHand.length === 13);
    ok('opponents appear only as counts', view1.players.every((p) => typeof p.handCount === 'number'));
    // Every card seat 0 holds (all private, nothing played yet) must be absent
    // from seat 1's view.
    const json = JSON.stringify(view1);
    const seat0Leaks = r.hands![0].filter((card) => json.includes(card.id));
    ok('none of seat 0 cards appear in seat 1 view', seat0Leaks.length === 0, seat0Leaks.map((c) => c.id));
  }

  // --- timeout auto-passes --------------------------------------------------
  {
    const r = twoSeatRoom();
    joinRoom(r, 'host-1', 'host');
    joinRoom(r, 'friend-1', 'friend');
    startGame(r, makeRng(5));
    const before = r.handState!.currentPlayerIndex;
    timeoutCurrent(r);
    const after = r.handState!.currentPlayerIndex;
    ok('a timeout advances off the timed-out player', after !== before || r.phase === 'finished');
  }

  // --- full simulation drives to a finish (bots act, finish records) --------
  {
    const r = createRoomState('SIM234', 4, 'host-1', 'normal', NOW);
    joinRoom(r, 'host-1', 'host');
    joinRoom(r, 'friend-1', 'friend');
    const rng = makeRng(99);
    startGame(r, rng);
    advanceBots(r, rng);
    let guard = 0;
    while (r.phase === 'playing' && guard++ < 2000) {
      const seat = r.handState!.currentPlayerIndex;
      // Drive the two human seats with the bot brain to exercise applySeatAction.
      const hand = r.hands![seat];
      const choice = botChoose(hand, r.handState!.leadCombo, {
        level: 'normal',
        rng,
        context: { seat, playedCards: r.playedCards, handSizes: r.hands!.map((h) => h.length) },
      });
      const action: RoundAction = choice ? { kind: 'play', combo: choice } : { kind: 'pass' };
      const res = applySeatAction(r, seat, action);
      if (res.status === 'error') {
        ok('no action errored during the simulation', false, res.message);
        break;
      }
      advanceBots(r, rng);
    }
    ok('the room reaches a finish without deadlock', r.phase === 'finished');
    ok('the finish order names all 4 seats', r.finishOrder.length === 4 && new Set(r.finishOrder).size === 4);
    ok('each human seat has a place in 1..4', [0, 1].every((s) => placeOfSeat(r, s) >= 1 && placeOfSeat(r, s) <= 4));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
