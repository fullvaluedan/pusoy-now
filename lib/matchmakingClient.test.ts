// Tests for the matchmaking waiting-room state machine (lib/matchmakingClient.ts).
//
// Same harness shape as lib/onlineGame.test.ts: a controllable fake socket
// drives every transition through MatchmakingConnection, and the pure reducer
// is also exercised directly. No react-native import anywhere in the chain.
//
// Run: tsx lib/matchmakingClient.test.ts (or via npm test)

import {
  MatchmakingConnection,
  matchmakingReducer,
  matchmakingWsUrl,
  type MatchmakingState,
  type ServerMatchmakingMessage,
  type SocketLike,
} from './matchmakingClient';

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

function send(sock: ReturnType<typeof fakeSocket>, msg: ServerMatchmakingMessage) {
  sock.message(JSON.stringify(msg));
}

function main() {
  // --- matchmakingWsUrl -------------------------------------------------------
  ok('https base becomes wss', matchmakingWsUrl('https://x.dev') === 'wss://x.dev/api/matchmaking/ws');
  ok('http base becomes ws', matchmakingWsUrl('http://localhost:8787') === 'ws://localhost:8787/api/matchmaking/ws');

  // --- pure reducer: queued -> matched transition -----------------------------
  {
    let state: MatchmakingState = { status: 'connecting' };
    state = matchmakingReducer(state, { type: 'open' });
    ok('open keeps connecting until the first message', state.status === 'connecting');
    state = matchmakingReducer(state, { type: 'message', data: { type: 'queued', deadline: 1_000, count: 1 } });
    ok('queued message enters queued', state.status === 'queued');
    state = matchmakingReducer(state, { type: 'message', data: { type: 'count', count: 2, deadline: 1_000 } });
    ok('count message stays queued with the updated count', state.status === 'queued' && (state as { count: number }).count === 2);
    state = matchmakingReducer(state, { type: 'message', data: { type: 'match', code: 'ABC234' } });
    ok('match message enters matched with the room code', state.status === 'matched' && (state as { code: string }).code === 'ABC234');
  }

  // --- pure reducer: count updates keep deadline (not reset to null) ---------
  {
    let state: MatchmakingState = { status: 'queued', count: 1, deadline: 5_000 };
    state = matchmakingReducer(state, { type: 'message', data: { type: 'count', count: 3, deadline: 5_000 } });
    ok(
      'a count update carries the server deadline through unchanged',
      state.status === 'queued' && (state as { deadline: number | null }).deadline === 5_000,
    );
  }

  // --- pure reducer: cancel mid-queue -> idle ---------------------------------
  {
    const state = matchmakingReducer({ status: 'queued', count: 1, deadline: 3_000 }, { type: 'close', clean: true });
    ok('a clean close while queued goes to idle', state.status === 'idle');
  }

  // --- pure reducer: unclean close while queued -> error(retryable) ----------
  {
    const state = matchmakingReducer({ status: 'queued', count: 2, deadline: 3_000 }, { type: 'close', clean: false });
    ok(
      'an unclean close while queued is a retryable error',
      state.status === 'error' && (state as { retryable: boolean }).retryable === true,
    );
  }

  // --- pure reducer: the server's post-match close does not clobber matched --
  {
    const matched: MatchmakingState = { status: 'matched', code: 'ZZZ999' };
    const afterClose = matchmakingReducer(matched, { type: 'close', clean: true });
    ok('a close after matched stays matched', afterClose.status === 'matched' && (afterClose as { code: string }).code === 'ZZZ999');
  }

  // --- pure reducer: a network error is a retryable error ---------------------
  {
    const state = matchmakingReducer({ status: 'queued', count: 1, deadline: 1_000 }, { type: 'error' });
    ok('an error event is retryable', state.status === 'error' && (state as { retryable: boolean }).retryable === true);
  }

  // --- connection wrapper: full queued -> matched flow ------------------------
  {
    const sock = fakeSocket();
    const states: MatchmakingState[] = [];
    const conn = new MatchmakingConnection(() => sock.ws, { onState: (s) => states.push(s) });
    conn.connect();
    ok('connect() enters connecting', conn.state.status === 'connecting');
    sock.open();
    send(sock, { type: 'queued', deadline: 30_000, count: 1 });
    ok('queued reaches the wrapper state', conn.state.status === 'queued');
    send(sock, { type: 'count', count: 4, deadline: 30_000 });
    send(sock, { type: 'match', code: 'ROOM01' });
    ok('the wrapper lands on matched with the room code', conn.state.status === 'matched' && (conn.state as { code: string }).code === 'ROOM01');
    ok('every transition was reported via onState', states.length >= 4);
  }

  // --- connection wrapper: cancel mid-queue closes the socket and goes idle --
  {
    const sock = fakeSocket();
    const conn = new MatchmakingConnection(() => sock.ws, {});
    conn.connect();
    sock.open();
    send(sock, { type: 'queued', deadline: 30_000, count: 1 });
    conn.cancel();
    ok('cancel() closes the underlying socket', sock.isClosed());
    ok('cancel() lands the state on idle', conn.state.status === 'idle');
  }

  // --- connection wrapper: unclean drop mid-queue surfaces a retryable error --
  {
    const sock = fakeSocket();
    const conn = new MatchmakingConnection(() => sock.ws, {});
    conn.connect();
    sock.open();
    send(sock, { type: 'queued', deadline: 30_000, count: 1 });
    sock.drop(); // not user-initiated: no conn.cancel() call first
    ok(
      'an unrequested drop while queued surfaces a retryable error',
      conn.state.status === 'error' && (conn.state as { retryable: boolean }).retryable === true,
    );
  }

  // --- connection wrapper: the server's own close after a match is not an error
  {
    const sock = fakeSocket();
    const conn = new MatchmakingConnection(() => sock.ws, {});
    conn.connect();
    sock.open();
    send(sock, { type: 'match', code: 'CLEAN01' });
    sock.drop(); // server closes right after sending 'match', per the protocol
    ok('the server closing after a match keeps matched', conn.state.status === 'matched' && (conn.state as { code: string }).code === 'CLEAN01');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
