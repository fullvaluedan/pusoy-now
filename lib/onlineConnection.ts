// The online room WebSocket connection state machine, framework-free.
//
// Split from lib/onlineGame.ts (which imports react / react-native / authClient)
// so the state machine - connecting/connected/reconnecting/closed, message
// parsing, action sends, reconnect backoff - is unit-testable in node with a
// fake socket and an injected scheduler. Only type-only imports here, so this
// module never pulls in react-native.

import type { Card, HandState, PlayedCombo } from './pusoy/types';

// Client mirror of the server's RoomView (server/src/roomLogic.ts). Kept in
// sync structurally; only the viewer's own hand is ever populated.
export interface OnlinePlayerView {
  seat: number;
  username: string | null;
  kind: 'human' | 'bot';
  connected: boolean;
  handCount: number;
}

export interface OnlineRoomView {
  code: string;
  seats: number;
  phase: 'lobby' | 'playing' | 'finished';
  hostUserId: string;
  botLevel: 'easy' | 'normal' | 'expert';
  players: OnlinePlayerView[];
  yourSeat: number | null;
  yourHand: Card[] | null;
  handState: HandState | null;
  trickHistory: { playerIndex: number; combo: PlayedCombo }[];
  finishOrder: number[];
  turnDeadline: number | null;
}

export type ConnStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed';

type ServerMessage =
  | { type: 'state'; view: OnlineRoomView }
  | { type: 'error'; message: string };

type ClientMessage =
  | { type: 'action'; action: { kind: 'play'; combo: PlayedCombo } | { kind: 'pass' } }
  | { type: 'start' }
  | { type: 'sync' };

// The subset of WebSocket the connection drives. The browser/RN WebSocket and a
// test fake both satisfy it.
export interface SocketLike {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: ((ev?: unknown) => void) | null;
}

export interface ConnCallbacks {
  onView?: (view: OnlineRoomView) => void;
  onError?: (message: string) => void;
  onStatus?: (status: ConnStatus) => void;
}

interface ConnOptions {
  schedule?: (fn: () => void, ms: number) => unknown;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
}

// Build the wss:// URL for a room's WebSocket endpoint from the auth base URL.
export function roomWsUrl(base: string, code: string): string {
  return `${base.replace(/^http/, 'ws')}/api/rooms/${code}/ws`;
}

export class OnlineRoomConnection {
  status: ConnStatus = 'connecting';
  view: OnlineRoomView | null = null;

  private ws: SocketLike | null = null;
  private attempts = 0;
  private closedByUser = false;
  private readonly schedule: (fn: () => void, ms: number) => unknown;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;

  constructor(
    private readonly factory: () => SocketLike,
    private readonly cb: ConnCallbacks = {},
    opts: ConnOptions = {},
  ) {
    const sched = opts.schedule ?? ((fn, ms) => setTimeout(fn, ms));
    this.schedule = sched;
    this.backoffBaseMs = opts.backoffBaseMs ?? 500;
    this.backoffMaxMs = opts.backoffMaxMs ?? 15_000;
  }

  connect(): void {
    this.setStatus(this.attempts === 0 ? 'connecting' : 'reconnecting');
    const ws = this.factory();
    this.ws = ws;
    ws.onopen = () => {
      this.attempts = 0;
      this.setStatus('connected');
    };
    ws.onmessage = (ev) => this.handleMessage(ev.data);
    ws.onclose = () => this.handleClose();
    ws.onerror = () => {
      // Let the close handler drive reconnect; closing here makes errors and
      // clean closes take the same path.
      try {
        ws.close();
      } catch {
        this.handleClose();
      }
    };
  }

  private handleMessage(data: string): void {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(data) as ServerMessage;
    } catch {
      return;
    }
    if (msg.type === 'state') {
      this.view = msg.view;
      this.cb.onView?.(msg.view);
    } else if (msg.type === 'error') {
      // Non-fatal: surfaced to the UI as a banner, the connection stays open.
      this.cb.onError?.(msg.message);
    }
  }

  private handleClose(): void {
    if (this.closedByUser) {
      this.setStatus('closed');
      return;
    }
    this.setStatus('reconnecting');
    this.attempts += 1;
    this.schedule(() => {
      if (!this.closedByUser) this.connect();
    }, this.backoffMs());
  }

  // Exponential backoff with a ceiling, capped so a long outage still retries at
  // a steady cadence.
  backoffMs(): number {
    const exp = this.backoffBaseMs * 2 ** Math.min(this.attempts - 1, 10);
    return Math.min(this.backoffMaxMs, exp);
  }

  private setStatus(status: ConnStatus): void {
    this.status = status;
    this.cb.onStatus?.(status);
  }

  private send(msg: ClientMessage): void {
    try {
      this.ws?.send(JSON.stringify(msg));
    } catch {
      // socket not open; the next reconnect + server state resync recovers
    }
  }

  playCards(combo: PlayedCombo): void {
    this.send({ type: 'action', action: { kind: 'play', combo } });
  }

  pass(): void {
    this.send({ type: 'action', action: { kind: 'pass' } });
  }

  start(): void {
    this.send({ type: 'start' });
  }

  requestSync(): void {
    this.send({ type: 'sync' });
  }

  close(): void {
    this.closedByUser = true;
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
  }
}
