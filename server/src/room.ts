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
  applySeatAction,
  canAutoStart,
  canStart,
  createRoomState,
  currentAutoKind,
  humanUserIds,
  joinRoom,
  nextAutoActDelay,
  placeOfSeat,
  redactStateFor,
  seatOf,
  setConnected,
  startGame,
  stepAutoSeat,
  timeoutCurrent,
  type RoomState,
} from './roomLogic';
import { d1FriendStore, ensureFriendship, type StatTotals } from './friends';
import { d1StatsStore } from './stats';
import { d1GameResultStore, recordGameResult } from './gameResults';

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
  async create(
    code: string,
    seats: number,
    hostUserId: string,
    botLevel: BotLevel,
    opts?: { lobbyDeadlineMs?: number; expectedUserIds?: string[] },
  ): Promise<RoomInfo> {
    const n = Math.max(2, Math.min(4, Math.floor(seats)));
    if (!this.room) {
      const now = Date.now();
      this.room = createRoomState(code, n, hostUserId, botLevel, now);
      // Matchmade rooms (U3) carry a short lobby deadline: the room auto-starts
      // when all matched humans connect, or bot-fills at the deadline. Invite
      // rooms pass no opts and keep the host-only start.
      if (opts?.lobbyDeadlineMs != null) {
        this.room.lobbyDeadline = now + opts.lobbyDeadlineMs;
        this.room.expectedUserIds = opts.expectedUserIds ?? null;
      }
      await this.persist();
      await this.ctx.storage.setAlarm(this.nextAlarm());
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

    // Matchmade auto-start (U3): once every expected human has arrived, begin
    // immediately without waiting for the lobby deadline. Invite rooms have no
    // lobbyDeadline, so canAutoStart is always false for them here.
    if (canAutoStart(this.room, Date.now())) {
      await this.startSequence();
    }

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
      await this.startSequence();
      return;
    }

    if (msg.type === 'action' && msg.action) {
      const res = applySeatAction(this.room, meta.seat, msg.action);
      if (res.status === 'error') {
        // Non-fatal: only the acting client hears it.
        ws.send(JSON.stringify({ type: 'error', message: res.message }));
        return;
      }
      // Broadcast the human's own play at once; afterProgress arms the paced
      // auto-turn for the next seat (a bot, or a disconnected human) if any.
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
      // If it is the departed player's turn, afterProgress arms a short
      // auto-pass so the table does not stall on someone who left; either way it
      // persists, broadcasts the "LEFT TABLE" state, and re-arms the alarm.
      await this.afterProgress();
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  async alarm(): Promise<void> {
    if (!this.room) return;
    const now = Date.now();

    // Paced auto-turn: a bot (or a disconnected human) acts ONE step at a time,
    // each with its own human-like delay, so clients see every bot play land as
    // its own broadcast (matching bot mode). This branch runs before the 30s
    // turn timeout because an auto delay (<=2.4s) is always sooner than the
    // deadline, so a bot seat plays here and never trips the timeout below.
    if (this.room.phase === 'playing' && this.room.autoActAt != null && now >= this.room.autoActAt) {
      this.room.autoActAt = null;
      const step = stepAutoSeat(this.room);
      if (step.acted) {
        // afterProgress broadcasts this play and arms autoActAt for the NEXT
        // auto seat (if the seat after it is also a bot / disconnected human).
        await this.afterProgress();
        return;
      }
      // Nothing was actually pending (state drifted, e.g. the disconnected
      // player reconnected before this fired): fall through and re-arm.
    }

    // Turn timeout: a CONNECTED human who stalls past the 30s deadline is
    // auto-passed. Bots and disconnected humans are handled by the paced branch
    // above, well before this deadline, so this only ever trips on a live human.
    const hs = this.room.handState;
    if (this.room.phase === 'playing' && hs?.turnDeadline != null && now >= hs.turnDeadline) {
      timeoutCurrent(this.room);
      await this.afterProgress();
      return;
    }

    // Matchmade lobby (U3): the connect-grace window has a deadline. If the room
    // can auto-start (>=1 human connected, deadline reached or all expected
    // arrived) run the same start sequence bots fill the empty seats. If the
    // deadline passed with zero humans connected, nobody showed - discard it.
    if (this.room.phase === 'lobby' && this.room.lobbyDeadline != null) {
      if (canAutoStart(this.room, now)) {
        await this.startSequence();
        return;
      }
      if (now >= this.room.lobbyDeadline) {
        const anyHuman = this.room.players.some((p) => p.kind === 'human' && p.connected);
        if (!anyHuman) {
          await this.ctx.storage.deleteAll();
          this.room = null;
          return;
        }
      }
    }

    // Room TTL: a room with no connected players is abandoned - clean up.
    const anyConnected = this.room.players.some((p) => p.kind === 'human' && p.connected);
    const idleFor = now - this.room.createdAt;
    if (!anyConnected && (this.room.phase === 'finished' || idleFor >= ROOM_TTL_MS)) {
      await this.ctx.storage.deleteAll();
      this.room = null;
      return;
    }

    // Self-heal: if an auto seat (a bot, or a disconnected human) is pending but
    // no schedule is armed - e.g. the DO was evicted and reloaded mid-turn, or a
    // human disconnected exactly on their own turn - arm it now so the paced
    // chain resumes rather than stalling.
    this.scheduleAuto();
    await this.persist();

    // Otherwise re-arm so the next auto turn / turn deadline (or TTL) is checked.
    await this.ctx.storage.setAlarm(this.nextAlarm());
  }

  // --- Internals ----------------------------------------------------------

  // Deal, run any leading bot turns, then persist + broadcast + re-arm. Shared
  // by the host 'start' message and the matchmade auto-start paths.
  private async startSequence(): Promise<void> {
    if (!this.room) return;
    startGame(this.room);
    // afterProgress broadcasts the opening deal and arms the first paced auto
    // turn if the opener is a bot (or a disconnected human).
    await this.afterProgress();
  }

  // If the current seat plays automatically (a bot, or a disconnected human) and
  // nothing is armed yet, schedule its action for `now + delay` so the alarm
  // paces it. When it is a connected human's turn (or the room is not playing),
  // clear any stale schedule. Idempotent and self-healing: only arms when the
  // slot is empty, so it never shortens an in-flight delay.
  private scheduleAuto(): void {
    if (!this.room) return;
    const kind = currentAutoKind(this.room);
    if (kind === null) {
      this.room.autoActAt = null;
    } else if (this.room.autoActAt == null) {
      this.room.autoActAt = Date.now() + nextAutoActDelay(Math.random, kind);
    }
  }

  // After a start/action/timeout: persist, record stats if the hand just
  // finished, arm the next paced auto turn, broadcast the redacted state, and
  // re-arm the alarm (soonest of autoActAt / turn deadline / lobby / TTL).
  private async afterProgress(): Promise<void> {
    if (!this.room) return;
    if (this.room.phase === 'finished') await this.recordStats();
    this.scheduleAuto();
    await this.persist();
    this.broadcast();
    await this.ctx.storage.setAlarm(this.nextAlarm());
  }

  private nextAlarm(): number {
    const r = this.room;
    if (r?.phase === 'playing') {
      // Whichever is sooner: the next paced auto turn or the current seat's 30s
      // deadline. For a bot seat autoActAt (<=2.4s) naturally precedes the
      // deadline, so the bot plays before it can be timed out.
      const times: number[] = [];
      if (r.autoActAt != null) times.push(r.autoActAt);
      if (r.handState?.turnDeadline != null) times.push(r.handState.turnDeadline);
      if (times.length > 0) return Math.min(...times);
    }
    // Matchmade lobby: fire at the connect-grace deadline to auto-start/clean up.
    if (r?.phase === 'lobby' && r.lobbyDeadline != null) return r.lobbyDeadline;
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
    // Also collect each human's finishing place for the per-game result rows
    // (head-to-head). Kept alongside the aggregate stats write below so both
    // read the same authoritative place.
    const placings: { userId: string; place: number }[] = [];
    for (const p of this.room.players) {
      if (p.kind !== 'human' || !p.userId) continue;
      const place = placeOfSeat(this.room, p.seat); // 1..seats
      if (place < 1) continue;
      placings.push({ userId: p.userId, place });
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
    // Per-game result rows for head-to-head (2+ humans only; recordGameResult
    // no-ops below 2). gameId is the room's stable hand id (`${code}-h1`), so an
    // alarm retry that re-runs recordStats writes the same rows idempotently
    // (INSERT OR IGNORE). Best-effort, like the stats writes above.
    try {
      await recordGameResult(
        d1GameResultStore(this.env.DB),
        `${this.room.code}-h1`,
        this.room.code,
        now,
        placings,
      );
    } catch {
      // Best-effort: a result write failure must not crash the finish path.
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
