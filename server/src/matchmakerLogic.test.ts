// Tests for the pure matchmaking-queue logic (server/src/matchmakerLogic.ts):
// enqueue/dedupe, cancel, the earliest-deadline recomputation, and the
// formation rule (4 pooled -> form now; 30s elapsed -> form with whoever is
// present; up to 4 oldest, the rest stay queued).
//
// These run in node with no Workers runtime, so the fairness-critical formation
// decision is proven here. The DO wiring (WS hibernation, alarm, GameRoom
// creation) is verified live by the orchestrator.
//
// Run: tsx src/matchmakerLogic.test.ts (or via npm test)

import {
  MATCH_WAIT_MS,
  createQueueState,
  dequeueUser,
  earliestDeadline,
  enqueue,
  shouldForm,
  type QueueEntry,
} from './matchmakerLogic';

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

const T0 = 1_700_000_000_000;

function entry(userId: string, joinedAt: number): QueueEntry {
  return { userId, username: userId, joinedAt };
}

function main() {
  // --- 4th join forms immediately with all 4 --------------------------------
  {
    const q = createQueueState();
    enqueue(q, entry('a', T0));
    enqueue(q, entry('b', T0 + 1));
    enqueue(q, entry('c', T0 + 2));
    // Only three so far: not full, not expired -> keep waiting.
    ok('three fresh players do not form', shouldForm(q, T0 + 3) === null);
    enqueue(q, entry('d', T0 + 3));
    const formed = shouldForm(q, T0 + 3);
    ok('a 4th join forms a match immediately', formed !== null);
    ok('the formed match seats all 4', formed !== null && formed.players.length === 4);
    ok(
      'the formed match seats them oldest-first',
      formed !== null && formed.players.map((p) => p.userId).join(',') === 'a,b,c,d',
    );
  }

  // --- 2 players + 30s -> forms with 2 --------------------------------------
  {
    const q = createQueueState();
    enqueue(q, entry('a', T0));
    enqueue(q, entry('b', T0 + 500));
    ok('two players before the deadline keep waiting', shouldForm(q, T0 + 1000) === null);
    const formed = shouldForm(q, T0 + MATCH_WAIT_MS);
    ok('two players at the deadline form a 2-human match', formed !== null && formed.players.length === 2);
  }

  // --- 1 player + 30s -> forms with 1 ---------------------------------------
  {
    const q = createQueueState();
    enqueue(q, entry('lonely', T0));
    ok('a lone player before the deadline keeps waiting', shouldForm(q, T0 + 100) === null);
    const formed = shouldForm(q, T0 + MATCH_WAIT_MS);
    ok('a lone player at the deadline forms a solo (bot-fill) match', formed !== null && formed.players.length === 1);
    ok('the solo match is that player', formed !== null && formed.players[0].userId === 'lonely');
  }

  // --- cancel removes and never matches -------------------------------------
  {
    const q = createQueueState();
    enqueue(q, entry('a', T0));
    ok('dequeue of a queued player reports removal', dequeueUser(q, 'a') === true);
    ok('a cancelled player is gone from the queue', q.entries.length === 0);
    ok('an empty queue never forms even past the deadline', shouldForm(q, T0 + MATCH_WAIT_MS * 2) === null);
    ok('dequeue of an absent player is a no-op', dequeueUser(q, 'ghost') === false);
  }

  // --- deadline recomputes after the head of queue cancels ------------------
  {
    const q = createQueueState();
    enqueue(q, entry('head', T0));
    enqueue(q, entry('tail', T0 + 5_000));
    ok('deadline tracks the oldest entry', earliestDeadline(q) === T0 + MATCH_WAIT_MS);
    dequeueUser(q, 'head');
    ok('deadline recomputes to the new oldest after a cancel', earliestDeadline(q) === T0 + 5_000 + MATCH_WAIT_MS);
    // At the OLD deadline the remaining tail player is not yet expired.
    ok('the survivor does not form at the stale head deadline', shouldForm(q, T0 + MATCH_WAIT_MS) === null);
    ok('the survivor forms at its own deadline', shouldForm(q, T0 + 5_000 + MATCH_WAIT_MS) !== null);
  }

  // --- duplicate enqueue of the same userId is a no-op ----------------------
  {
    const q = createQueueState();
    ok('first enqueue is added', enqueue(q, entry('a', T0)) === true);
    ok('a duplicate enqueue is rejected', enqueue(q, { userId: 'a', username: 'a', joinedAt: T0 + 9_999 }) === false);
    ok('the duplicate did not grow the queue', q.entries.length === 1);
    ok('the duplicate did not reset the original joinedAt', q.entries[0].joinedAt === T0);
  }

  // --- 5 queued -> forms the 4 oldest, the 5th stays queued -----------------
  {
    const q = createQueueState();
    enqueue(q, entry('a', T0));
    enqueue(q, entry('b', T0 + 1));
    enqueue(q, entry('c', T0 + 2));
    enqueue(q, entry('d', T0 + 3));
    enqueue(q, entry('e', T0 + 4));
    const formed = shouldForm(q, T0 + 5);
    ok('five queued forms exactly 4', formed !== null && formed.players.length === 4);
    ok(
      'the 4 oldest are taken, the newest is left',
      formed !== null && formed.players.map((p) => p.userId).join(',') === 'a,b,c,d',
    );
    // Simulate the DO removing the matched four; the 5th remains for the next
    // round and is not itself expired yet.
    for (const p of formed!.players) dequeueUser(q, p.userId);
    ok('the 5th player stays queued after formation', q.entries.length === 1 && q.entries[0].userId === 'e');
    ok('the leftover player does not form on its own before its deadline', shouldForm(q, T0 + 5) === null);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
