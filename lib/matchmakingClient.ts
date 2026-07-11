// The quick-match waiting-room WebSocket state machine, framework-free (U4).
//
// Mirrors lib/onlineConnection.ts's split: a pure reducer over server messages
// plus a thin connection wrapper that owns the socket lifecycle, so the state
// machine - idle/connecting/queued/matched/error, message parsing, cancel - is
// unit-testable in node with a fake socket. Only a type-only import from
// onlineConnection.ts (its SocketLike shape), so this module never pulls in
// react-native. The real socket (cookie injection on native) is built in
// app/matchmaking.tsx, same split as lib/onlineGame.ts does for rooms.

import type { SocketLike } from './onlineConnection';

export type { SocketLike } from './onlineConnection';

// Server messages, matching server/src/matchmaker.ts exactly: 'queued' is the
// initial ack on connect, 'count' is every pool/deadline change afterward, and
// 'match' arrives once (the server closes the socket right after sending it).
export type ServerMatchmakingMessage =
  | { type: 'queued'; deadline: number | null; count: number }
  | { type: 'count'; count: number; deadline: number | null }
  | { type: 'match'; code: string };

export type MatchmakingState =
  | { status: 'idle' }
  | { status: 'connecting' }
  | { status: 'queued'; count: number; deadline: number | null }
  | { status: 'matched'; code: string }
  | { status: 'error'; retryable: boolean };

export type MatchmakingEvent =
  | { type: 'open' }
  | { type: 'message'; data: ServerMatchmakingMessage }
  | { type: 'close'; clean: boolean }
  | { type: 'error' };

// Build the wss:// URL for the matchmaking queue's WebSocket endpoint from the
// auth base URL. Mirrors onlineConnection.ts's roomWsUrl (same http->ws swap)
// for a different path, since that helper is hardcoded to /api/rooms.
export function matchmakingWsUrl(base: string): string {
  return `${base.replace(/^http/, 'ws')}/api/matchmaking/ws`;
}

// Pure transition function: idle -> connecting -> queued -> matched | error.
// 'connecting' is entered by the connection wrapper calling connect() (a
// call-time transition, not a reducer event, matching OnlineRoomConnection's
// style); everything after that is driven by the four events below.
export function matchmakingReducer(state: MatchmakingState, event: MatchmakingEvent): MatchmakingState {
  switch (event.type) {
    case 'open':
      // Nothing to do yet: the server's first message ('queued') is what
      // actually reports the pool, so the state stays whatever it was
      // (typically 'connecting') until that arrives.
      return state;

    case 'message': {
      const msg = event.data;
      if (msg.type === 'queued' || msg.type === 'count') {
        return { status: 'queued', count: msg.count, deadline: msg.deadline };
      }
      // msg.type === 'match'
      return { status: 'matched', code: msg.code };
    }

    case 'close': {
      // The server closes the socket right after sending 'match' -- that is
      // an expected, clean teardown of an already-successful state, not an
      // error. Keep it.
      if (state.status === 'matched') return state;
      // A clean close while idle/connecting/queued is the user cancelling
      // (or a close before anything happened); an unclean drop mid-queue
      // means the connection was lost and the wait needs a retry.
      if (event.clean) return { status: 'idle' };
      return { status: 'error', retryable: true };
    }

    case 'error':
      if (state.status === 'matched') return state;
      return { status: 'error', retryable: true };

    default:
      return state;
  }
}

export interface MatchmakingCallbacks {
  onState?: (state: MatchmakingState) => void;
}

// Owns one socket's lifecycle and feeds every open/message/close/error into
// the pure reducer above. No auto-reconnect (unlike the room connection): a
// dropped queue surfaces as error(retryable) and the screen offers "Try
// again", which calls connect() again on a fresh instance.
export class MatchmakingConnection {
  state: MatchmakingState = { status: 'idle' };

  private ws: SocketLike | null = null;
  private closedByUser = false;

  constructor(
    private readonly factory: () => SocketLike,
    private readonly cb: MatchmakingCallbacks = {},
  ) {}

  connect(): void {
    this.closedByUser = false;
    this.setState({ status: 'connecting' });
    const ws = this.factory();
    this.ws = ws;
    ws.onopen = () => this.dispatch({ type: 'open' });
    ws.onmessage = (ev) => {
      let msg: ServerMatchmakingMessage;
      try {
        msg = JSON.parse(ev.data) as ServerMatchmakingMessage;
      } catch {
        return;
      }
      this.dispatch({ type: 'message', data: msg });
    };
    ws.onclose = () => {
      const clean = this.closedByUser || this.state.status === 'matched';
      this.dispatch({ type: 'close', clean });
    };
    ws.onerror = () => this.dispatch({ type: 'error' });
  }

  // Cancel out of the queue: close the socket, no reconnect. The reducer's
  // 'close' handler (clean = true) lands this on 'idle'.
  cancel(): void {
    this.closedByUser = true;
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
  }

  private dispatch(event: MatchmakingEvent): void {
    this.setState(matchmakingReducer(this.state, event));
  }

  private setState(next: MatchmakingState): void {
    this.state = next;
    this.cb.onState?.(next);
  }
}
