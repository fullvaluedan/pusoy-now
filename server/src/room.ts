// GameRoom: a Durable Object that runs one live room, server-authoritatively.
//
// One DO instance per room code (env.GAME_ROOM.getByName(code)). It owns the
// room state via roomLogic (the shared engine), persists it to DO storage so
// hibernation and reconnects resume cleanly, and speaks to clients over the
// WebSocket Hibernation API - each broadcast is redacted per recipient, so no
// client ever holds another player's cards. A 30s turn alarm auto-passes on
// timeout. Joining auto-friends every seated pair in D1; a finished game
// records stats to the same D1 tables as bot games (server-computed, trusting
// no client).

import { DurableObject } from 'cloudflare:workers';
import type { Env } from './auth';
import type { BotLevel, RoundAction } from '../../lib/pusoy/types';
import {
  advanceBots,
  applySeatAction,
  canStart,
  createRoomState,
  humanUserIds,
  joinRoom,
  placeOfSeat,
  redactStateFor,
  seatOf,
  setConnected,
  startGame,
  timeoutCurrent,
  type RoomState,
} from './roomLogic';
import { d1FriendStore, ensureFriendship, type StatTotals } from './friends';
import { d1StatsStore } from './stats';

// A room with no connected players is cleaned up after this idle window.
const ROOM_TTL_MS = 60 * 60 * 1000; // 1 hour

interface SocketMeta {
  userId: string;
  seat: number;
}

// Public lobby info (no hands) for the GET /api/rooms/:code endpoint.
export interface RoomInfo {
  code: string;
  seats: number;
  phase: RoomState['phase'];
  hostUserId: string;
  players: { seat: number; username: string | null; kind: 'human' | 'bot'; connected: boolean }[];
}

export class GameRoom extends DurableObject<Env> {
  private room: RoomState | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<RoomState>('room')) ?? null;
    });
  }

  private async persist(): Promise<void> {
    if (this.room) await this.ctx.storage.put('room', this.room);
  }

  // --- RPC (called by the Worker) -----------------------------------------

  // Initialize the room if it does not exist yet. The DO does not know its own
  // name, so the Worker passes the room code in. Idempotent: a second create
  // returns the existing room's info.
  async create(code: string, seats: number, hostUserId: string, botLevel: BotLevel): Promise<RoomInfo> {
    const n = Math.max(2, Math.min(4, Math.floor(seats)));
    if (!this.room) {
      this.room = createRoomState(code, n, hostUserId, botLevel, Date.now());
      await this.persist();
      await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
    }
    return this.info();
  }

  info(): RoomInfo {
    const r = this.room;
    if (!r) {
      return { code: '', seats: 0, phase: 'lobby', hostUserId: '', players: [] };
    }
    return {
      code: r.code,
      seats: r.seats,
      phase: r.phase,
      hostUserId: r.hostUserId,
      players: r.players.map((p) => ({ seat: p.seat, username: p.username, kind: p.kind, connected: p.connected })),
    };
  }

  // --- WebSocket upgrade + lifecycle --------------------------------------

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    // The Worker authenticated the session and forwards the identity. The DO is
    // only reachable through the Worker, so these headers are trusted.
    const userId = request.headers.get('X-User-Id');
    const username = request.headers.get('X-Username');
    if (!userId) return new Response('unauthorized', { status: 401 });
    if (!this.room) return new Response('no such room', { status: 404 });

    const join = joinRoom(this.room, userId, username);
    if (join.status === 'full') return new Response('room full', { status: 409 });
    if (join.status === 'in-progress') return new Response('game in progress', { status: 409 });

    // Auto-friend: pair the joiner with every other seated human (idempotent).
    if (!join.rejoined) await this.autoFriend(userId);
    await this.persist();
    await this.ctx.storage.setAlarm(this.nextAlarm());

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ userId, seat: join.seat } satisfies SocketMeta);

    // Send the joiner their view immediately, then tell everyone else the
    // roster changed.
    this.sendView(server, join.seat);
    this.broadcast(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (!this.room) return;
    const meta = ws.deserializeAttachment() as SocketMeta | null;
    if (!meta) return;
    let msg: { type?: string; action?: RoundAction };
    try {
      msg = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));
    } catch {
      return;
    }

    if (msg.type === 'start') {
      const check = canStart(this.room, meta.userId);
      if (check !== 'ok') {
        ws.send(JSON.stringify({ type: 'error', message: startErrorMessage(check) }));
        return;
      }
      startGame(this.room);
      advanceBots(this.room);
      await this.afterProgress();
      return;
    }

    if (msg.type === 'action' && msg.action) {
      const res = applySeatAction(this.room, meta.seat, msg.action);
      if (res.status === 'error') {
        // Non-fatal: only the acting client hears it.
        ws.send(JSON.stringify({ type: 'error', message: res.message }));
        return;
      }
      advanceBots(this.room);
      await this.afterProgress();
      return;
    }

    if (msg.type === 'sync') {
      // A client asking for a fresh view (e.g. after reconnect).
      this.sendView(ws, meta.seat);
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    if (!this.room) return;
    const meta = ws.deserializeAttachment() as SocketMeta | null;
    if (meta) {
      setConnected(this.room, meta.userId, false);
      await this.persist();
      this.broadcast();
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  async alarm(): Promise<void> {
    if (!this.room) return;

    // Turn timeout: if it is a player's turn and the deadline has passed,
    // auto-pass via the engine's timeout path, then let bots play on.
    const hs = this.room.handState;
    if (this.room.phase === 'playing' && hs?.turnDeadline != null && Date.now() >= hs.turnDeadline) {
      timeoutCurrent(this.room);
      advanceBots(this.room);
      await this.afterProgress();
      return;
    }

    // Room TTL: a room with no connected players is abandoned - clean up.
    const anyConnected = this.room.players.some((p) => p.kind === 'human' && p.connected);
    const idleFor = Date.now() - this.room.createdAt;
    if (!anyConnected && (this.room.phase === 'finished' || idleFor >= ROOM_TTL_MS)) {
      await this.ctx.storage.deleteAll();
      this.room = null;
      return;
    }

    // Otherwise re-arm so the next turn deadline (or TTL) is checked.
    await this.ctx.storage.setAlarm(this.nextAlarm());
  }

  // --- Internals ----------------------------------------------------------

  // After a start/action/timeout: persist, record stats if the hand just
  // finished, broadcast the redacted state, and re-arm the turn alarm.
  private async afterProgress(): Promise<void> {
    if (!this.room) return;
    if (this.room.phase === 'finished') await this.recordStats();
    await this.persist();
    this.broadcast();
    await this.ctx.storage.setAlarm(this.nextAlarm());
  }

  private nextAlarm(): number {
    const hs = this.room?.handState;
    if (this.room?.phase === 'playing' && hs?.turnDeadline != null) return hs.turnDeadline;
    return Date.now() + ROOM_TTL_MS;
  }

  private async autoFriend(joinerId: string): Promise<void> {
    if (!this.room) return;
    const store = d1FriendStore(this.env.DB);
    const others = humanUserIds(this.room).filter((id) => id !== joinerId);
    const now = Date.now();
    for (const other of others) {
      try {
        await ensureFriendship(store, joinerId, other, now);
      } catch {
        // Best-effort: a failed auto-friend must not block joining.
      }
    }
  }

  // Record each seated human's finishing place into D1, once (idempotent on a
  // duplicate finish). Server-computed from the authoritative finish order.
  private async recordStats(): Promise<void> {
    if (!this.room || this.room.statsRecorded) return;
    this.room.statsRecorded = true;
    await this.persist();
    const store = d1StatsStore(this.env.DB);
    const now = Date.now();
    for (const p of this.room.players) {
      if (p.kind !== 'human' || !p.userId) continue;
      const place = placeOfSeat(this.room, p.seat); // 1..seats
      if (place < 1) continue;
      try {
        const prev: StatTotals = (await store.get(p.userId)) ?? {
          games: 0, firsts: 0, seconds: 0, thirds: 0, fourths: 0,
        };
        const next: StatTotals = { ...prev, games: prev.games + 1 };
        if (place === 1) next.firsts += 1;
        else if (place === 2) next.seconds += 1;
        else if (place === 3) next.thirds += 1;
        else if (place === 4) next.fourths += 1;
        await store.set(p.userId, next, now);
      } catch {
        // Best-effort: a stats write failure must not crash the finish path.
      }
    }
  }

  // Send one socket its own redacted view.
  private sendView(ws: WebSocket, seat: number | null): void {
    if (!this.room) return;
    ws.send(JSON.stringify({ type: 'state', view: redactStateFor(this.room, seat) }));
  }

  // Broadcast the per-viewer redacted state to every connected socket (except
  // an optional one that was already sent its view this tick).
  private broadcast(except?: WebSocket): void {
    if (!this.room) return;
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const meta = ws.deserializeAttachment() as SocketMeta | null;
      const seat = meta ? seatOf(this.room, meta.userId) : null;
      try {
        ws.send(JSON.stringify({ type: 'state', view: redactStateFor(this.room, seat) }));
      } catch {
        // socket may be closing; ignore
      }
    }
  }
}

function startErrorMessage(check: 'not-host' | 'not-lobby' | 'need-2'): string {
  switch (check) {
    case 'not-host':
      return 'Only the host can start the game.';
    case 'not-lobby':
      return 'The game has already started.';
    case 'need-2':
      return 'At least 2 players must be seated to start.';
  }
}
