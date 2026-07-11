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
  canAutoStart,
  canStart,
  createRoomState,
  generateRoomCode,
  humanPairs,
  humanUserIds,
  joinRoom,
  placeOfSeat,
  redactStateFor,
  setConnected,
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

  // --- a disconnected human is auto-passed, never blocks the table ----------
  {
    const r = twoSeatRoom();
    joinRoom(r, 'host-1', 'host');
    joinRoom(r, 'friend-1', 'friend');
    startGame(r, makeRng(5));
    const gone = r.handState!.currentPlayerIndex; // the seat about to act
    setConnected(r, r.players[gone].userId!, false);
    // advanceBots now stands in for the DO's disconnect handler: it must move
    // the turn off the departed seat (auto-pass/forced) rather than stall.
    advanceBots(r);
    const stalled = r.phase === 'playing' && r.handState!.currentPlayerIndex === gone;
    ok('a disconnected player does not hold up the turn', !stalled);
    // Reconnecting restores their seat and they can act again.
    const back = joinRoom(r, r.players[gone].userId!, 'host');
    ok('the departed player rejoins their seat', back.status === 'joined' && back.seat === gone);
    ok('the rejoined player is marked connected', r.players[gone].connected === true);
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

  // --- matchmade auto-start (U3): all expected connected -> starts now -------
  {
    // A matchmade room (as room.ts create() sets it up): expert bots, a lobby
    // deadline in the future, and the two matched humans as the expected set.
    const r = createRoomState('MM0234', 4, 'guest-a', 'expert', NOW);
    r.lobbyDeadline = NOW + 8_000;
    r.expectedUserIds = ['guest-a', 'guest-b'];
    joinRoom(r, 'guest-a', 'A');
    ok('one of two expected humans present does not auto-start yet', canAutoStart(r, NOW + 1) === false);
    joinRoom(r, 'guest-b', 'B');
    ok('all expected humans present auto-starts before the deadline', canAutoStart(r, NOW + 1) === true);
    // The DO would now run startGame; bots fill the remaining seats at expert.
    startGame(r, makeRng(21));
    ok('auto-start fills to 4 seats', r.players.length === 4);
    ok('the empty seats are bots', r.players.filter((p) => p.kind === 'bot').length === 2);
    ok('matchmade bots play at expert', r.botLevel === 'expert');
    ok('the game is now playing', r.phase === 'playing');
    ok('a started room no longer auto-starts', canAutoStart(r, NOW + 1) === false);
  }

  // --- matchmade auto-start (U3): deadline + 1 human -> starts, bots fill -----
  {
    const r = createRoomState('MM1234', 4, 'guest-a', 'expert', NOW);
    r.lobbyDeadline = NOW + 8_000;
    r.expectedUserIds = ['guest-a', 'guest-b', 'guest-c', 'guest-d'];
    joinRoom(r, 'guest-a', 'A'); // only one of four expected showed up
    ok('one human before the deadline does not auto-start early', canAutoStart(r, NOW + 1) === false);
    ok('one connected human at the deadline auto-starts', canAutoStart(r, NOW + 8_000) === true);
    startGame(r, makeRng(22));
    ok('a lone matchmade human is filled to 4 by bots', r.players.length === 4);
    ok('three seats become expert bots', r.players.filter((p) => p.kind === 'bot').length === 3);
  }

  // --- matchmade auto-start (U3): deadline + zero humans -> no start ----------
  {
    const r = createRoomState('MM2234', 4, 'guest-a', 'expert', NOW);
    r.lobbyDeadline = NOW + 8_000;
    r.expectedUserIds = ['guest-a'];
    joinRoom(r, 'guest-a', 'A');
    setConnected(r, 'guest-a', false); // they never actually connected / dropped
    ok('a lobby with zero connected humans never auto-starts', canAutoStart(r, NOW + 8_000) === false);
    // The DO's alarm branch uses this same predicate to discard the dead room.
    const anyHuman = r.players.some((p) => p.kind === 'human' && p.connected);
    ok('zero connected humans is detectable for cleanup', anyHuman === false);
  }

  // --- invite room (no deadline) still requires host start (regression) -------
  {
    const r = createRoomState('INV234', 4, 'host-1', 'normal', NOW);
    joinRoom(r, 'host-1', 'host');
    joinRoom(r, 'friend-1', 'friend');
    ok('an invite room has no lobby deadline', r.lobbyDeadline === null);
    ok('an invite room never auto-starts even far in the future', canAutoStart(r, NOW + 10 * 60 * 1000) === false);
    ok('an invite room still starts via the host path', canStart(r, 'host-1') === 'ok');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
