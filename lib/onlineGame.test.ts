// Tests for the online room connection state machine (lib/onlineConnection.ts).
//
// Imports only the node-safe module (never lib/onlineGame.ts, which pulls in
// react-native). A fake socket and a manual scheduler drive every transition:
// connecting/connected/reconnecting/closed, view updates, non-fatal errors,
// action sends, reconnect on drop, no reconnect on intentional close, and
// backoff growth. The real WebSocket + hook wiring is verified live by the
// orchestrator (two Chrome profiles).
//
// Run: tsx lib/onlineGame.test.ts (or via npm test)

import {
  OnlineRoomConnection,
  roomWsUrl,
  type OnlineRoomView,
  type SocketLike,
} from './onlineConnection';

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

// A controllable fake socket: records sends, and lets the test fire open /
// message / close / error.
function fakeSocket() {
  const sent: string[] = [];
  let closed = false;
  const ws: SocketLike = {
    send: (d) => sent.push(d),
    close: () => {
      closed = true;
      ws.onclose?.();
    },
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  };
  return {
    ws,
    sent,
    isClosed: () => closed,
    open: () => ws.onopen?.(),
    message: (data: string) => ws.onmessage?.({ data }),
    drop: () => ws.onclose?.(),
    error: () => ws.onerror?.(),
  };
}

// A manual scheduler: captures the pending reconnect callback so the test can
// fire it deterministically (no real timers).
function manualScheduler() {
  const pending: { fn: () => void; ms: number }[] = [];
  return {
    schedule: (fn: () => void, ms: number) => {
      pending.push({ fn, ms });
      return pending.length;
    },
    runNext: () => {
      const next = pending.shift();
      next?.fn();
      return next?.ms;
    },
    pendingCount: () => pending.length,
  };
}

const sampleView = (phase: OnlineRoomView['phase']): OnlineRoomView => ({
  code: 'ABC234',
  seats: 2,
  phase,
  hostUserId: 'host-1',
  botLevel: 'normal',
  players: [{ seat: 0, username: 'host', kind: 'human', connected: true, handCount: 13 }],
  yourSeat: 0,
  yourHand: [],
  handState: null,
  trickHistory: [],
  finishOrder: [],
  turnDeadline: null,
});

function main() {
  // --- roomWsUrl ------------------------------------------------------------
  ok('https base becomes wss', roomWsUrl('https://x.dev', 'CODE') === 'wss://x.dev/api/rooms/CODE/ws');
  ok('http base becomes ws', roomWsUrl('http://localhost:8787', 'CDE') === 'ws://localhost:8787/api/rooms/CDE/ws');

  // --- connecting -> connected, view updates --------------------------------
  {
    const sock = fakeSocket();
    const sched = manualScheduler();
    const statuses: string[] = [];
    let lastView: OnlineRoomView | null = null;
    const conn = new OnlineRoomConnection(() => sock.ws, {
      onStatus: (s) => statuses.push(s),
      onView: (v) => (lastView = v),
    }, { schedule: sched.schedule });

    conn.connect();
    ok('starts in connecting', conn.status === 'connecting');
    sock.open();
    ok('moves to connected on open', conn.status === 'connected');
    sock.message(JSON.stringify({ type: 'state', view: sampleView('lobby') }));
    ok('a state message updates the view', lastView !== null && (lastView as OnlineRoomView).phase === 'lobby');
    ok('the connection caches the latest view', conn.view?.phase === 'lobby');
  }

  // --- non-fatal error message ----------------------------------------------
  {
    const sock = fakeSocket();
    const errors: string[] = [];
    const conn = new OnlineRoomConnection(() => sock.ws, { onError: (m) => errors.push(m) }, {
      schedule: manualScheduler().schedule,
    });
    conn.connect();
    sock.open();
    sock.message(JSON.stringify({ type: 'error', message: 'not your turn' }));
    ok('an error message surfaces without closing', errors[0] === 'not your turn' && conn.status === 'connected');
  }

  // --- action sends ---------------------------------------------------------
  {
    const sock = fakeSocket();
    const conn = new OnlineRoomConnection(() => sock.ws, {}, { schedule: manualScheduler().schedule });
    conn.connect();
    sock.open();
    conn.pass();
    conn.start();
    conn.requestSync();
    ok('pass sends a pass action', sock.sent[0] === JSON.stringify({ type: 'action', action: { kind: 'pass' } }));
    ok('start sends a start', sock.sent[1] === JSON.stringify({ type: 'start' }));
    ok('sync sends a sync', sock.sent[2] === JSON.stringify({ type: 'sync' }));
  }

  // --- drop -> reconnecting -> reconnect ------------------------------------
  {
    let built = 0;
    const socks: ReturnType<typeof fakeSocket>[] = [];
    const sched = manualScheduler();
    const conn = new OnlineRoomConnection(
      () => {
        built += 1;
        const s = fakeSocket();
        socks.push(s);
        return s.ws;
      },
      {},
      { schedule: sched.schedule },
    );
    conn.connect();
    socks[0].open();
    socks[0].drop();
    ok('an unexpected drop goes to reconnecting', conn.status === 'reconnecting');
    ok('a reconnect is scheduled', sched.pendingCount() === 1);
    sched.runNext();
    ok('the reconnect opens a new socket', built === 2);
    socks[1].open();
    ok('a successful reconnect returns to connected', conn.status === 'connected');
  }

  // --- intentional close does not reconnect ---------------------------------
  {
    const sock = fakeSocket();
    const sched = manualScheduler();
    const conn = new OnlineRoomConnection(() => sock.ws, {}, { schedule: sched.schedule });
    conn.connect();
    sock.open();
    conn.close();
    ok('an intentional close goes to closed', conn.status === 'closed');
    ok('no reconnect is scheduled after an intentional close', sched.pendingCount() === 0);
  }

  // --- backoff grows with attempts ------------------------------------------
  {
    const sched = manualScheduler();
    const conn = new OnlineRoomConnection(
      () => fakeSocket().ws,
      {},
      { schedule: sched.schedule, backoffBaseMs: 500, backoffMaxMs: 15_000 },
    );
    conn.connect();
    // Force a couple of failed attempts by dropping right after connect.
    (conn as unknown as { attempts: number }).attempts = 1;
    ok('first retry backoff is the base', conn.backoffMs() === 500);
    (conn as unknown as { attempts: number }).attempts = 3;
    ok('backoff grows exponentially', conn.backoffMs() === 2000);
    (conn as unknown as { attempts: number }).attempts = 30;
    ok('backoff is capped at the max', conn.backoffMs() === 15_000);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
