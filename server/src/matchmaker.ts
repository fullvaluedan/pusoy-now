// Matchmaker: a singleton Durable Object that runs the quick-match queue (U3).
//
// One instance for the whole app (env.MATCHMAKER.getByName('global')). Waiting
// clients hold a hibernating WebSocket, so an idle queue costs almost nothing
// and "match found" is an instant push. Queue state lives in DO storage; one
// storage alarm is always recomputed to the earliest queued player's 30s
// deadline. Match formation - dequeue up to 4, create the GameRoom with expert
// bots filling the empty seats, notify + close the matched sockets - is a single
// synchronous handler over the pure matchmakerLogic, so a 4th arrival and the
// alarm can never race into a double-formed room. All queue arithmetic is the
// pure module; this file only persists it and wires WS + the alarm.

import { DurableObject } from 'cloudflare:workers';
import type { Env } from './auth';
import {
  createQueueState,
  dequeueUser,
  earliestDeadline,
  enqueue,
  shouldForm,
  type QueueState,
} from './matchmakerLogic';
import { generateRoomCode } from './roomLogic';

// Matchmade rooms are created with a short connect grace: the room auto-starts
// the moment every matched human connects, or when this window passes with at
// least one human present (expert bots fill the rest).
const LOBBY_DEADLINE_MS = 8_000;

interface SocketMeta {
  userId: string;
  username: string | null;
}

export class Matchmaker extends DurableObject<Env> {
  private queue: QueueState = createQueueState();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.queue = (await ctx.storage.get<QueueState>('queue')) ?? createQueueState();
    });
  }

  private async persist(): Promise<void> {
    await this.ctx.storage.put('queue', this.queue);
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

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ userId, username } satisfies SocketMeta);

    const now = Date.now();
    enqueue(this.queue, { userId, username, joinedAt: now }); // deduped by userId
    await this.persist();

    // Forming on join covers the 4th-arrival case atomically. If this player was
    // matched, formMatches already sent them {type:'match'} and closed them.
    const matched = await this.formMatches(now);
    if (!matched.includes(userId)) {
      this.sendQueued(server);
      this.broadcastCount();
      await this.rearm();
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const meta = ws.deserializeAttachment() as SocketMeta | null;
    if (!meta) return;
    // Only drop them if this was their last live socket (guards a reconnect
    // that briefly holds two).
    const stillHere = this.ctx
      .getWebSockets()
      .some((s) => s !== ws && (s.deserializeAttachment() as SocketMeta | null)?.userId === meta.userId);
    if (stillHere) return;
    if (dequeueUser(this.queue, meta.userId)) {
      await this.persist();
      this.broadcastCount();
      await this.rearm();
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  async alarm(): Promise<void> {
    // Idempotent: formMatches re-checks shouldForm, so a spurious or retried
    // alarm forms nothing when the head is not actually expired.
    await this.formMatches(Date.now());
    await this.rearm();
  }

  // --- Internals ----------------------------------------------------------

  // Form every full/expired match currently possible. Creates one GameRoom per
  // match (seats 4, expert bots, short lobby deadline + the expected humans so
  // it auto-starts), notifies + closes the matched sockets, and removes them
  // from the queue. Returns the matched user ids.
  private async formMatches(now: number): Promise<string[]> {
    const matched: string[] = [];
    for (let form = shouldForm(this.queue, now); form; form = shouldForm(this.queue, now)) {
      const players = form.players;
      const code = generateRoomCode();
      await this.env.GAME_ROOM.getByName(code).create(code, 4, players[0].userId, 'expert', {
        lobbyDeadlineMs: LOBBY_DEADLINE_MS,
        expectedUserIds: players.map((p) => p.userId),
      });
      for (const p of players) {
        dequeueUser(this.queue, p.userId);
        matched.push(p.userId);
        this.sendTo(p.userId, { type: 'match', code });
        this.closeUser(p.userId);
      }
    }
    if (matched.length > 0) {
      await this.persist();
      this.broadcastCount();
    }
    return matched;
  }

  // Re-arm the single storage alarm to the oldest queued player's deadline, or
  // clear it when the queue is empty.
  private async rearm(): Promise<void> {
    const deadline = earliestDeadline(this.queue);
    if (deadline == null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(deadline);
  }

  private socketsFor(userId: string): WebSocket[] {
    return this.ctx
      .getWebSockets()
      .filter((ws) => (ws.deserializeAttachment() as SocketMeta | null)?.userId === userId);
  }

  private sendTo(userId: string, msg: unknown): void {
    const payload = JSON.stringify(msg);
    for (const ws of this.socketsFor(userId)) {
      try {
        ws.send(payload);
      } catch {
        // socket may be closing; ignore
      }
    }
  }

  private closeUser(userId: string): void {
    for (const ws of this.socketsFor(userId)) {
      try {
        ws.close(1000, 'matched');
      } catch {
        // already closing; ignore
      }
    }
  }

  // The initial ack to a freshly-queued socket: the shared force-form deadline
  // (server-driven countdown) and the current pool size.
  private sendQueued(ws: WebSocket): void {
    try {
      ws.send(JSON.stringify({ type: 'queued', deadline: earliestDeadline(this.queue), count: this.queue.entries.length }));
    } catch {
      // ignore
    }
  }

  // Push the live pool size + deadline to everyone still waiting.
  private broadcastCount(): void {
    const deadline = earliestDeadline(this.queue);
    const count = this.queue.entries.length;
    const payload = JSON.stringify({ type: 'count', count, deadline });
    for (const ws of this.ctx.getWebSockets()) {
      const meta = ws.deserializeAttachment() as SocketMeta | null;
      if (!meta) continue;
      if (!this.queue.entries.some((e) => e.userId === meta.userId)) continue;
      try {
        ws.send(payload);
      } catch {
        // ignore
      }
    }
  }
}
