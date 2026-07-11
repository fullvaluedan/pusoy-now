// Players Online counter (Round 7 U5): a device-keyed heartbeat table. Every
// client (guest or signed-in) pings /api/presence/beat while foregrounded;
// the count of devices seen in the last 90s is an honest live-player number
// for the home screen.
//
// The store seam and pure beat logic are split from D1, the same shape as
// consent.ts/profile.ts, so the count-window and prune scenarios are
// unit-testable with no D1. The route (public, no session) is wired in
// index.ts.

// A rolling 90s window: a device that hasn't beaten in the last 90s (two
// missed 45s client heartbeats) is presumed gone and drops out of the count.
export const PRESENCE_WINDOW_MS = 90_000;

// Rows older than this are stale beyond any reasonable reconnect and are
// opportunistically pruned so the table doesn't grow unbounded.
const PRUNE_AGE_MS = 24 * 60 * 60 * 1000;

// Shape-only UUID check (36 chars, 8-4-4-4-12 hex groups). Deliberately
// version/variant-agnostic -- this only guards against garbage/oversized
// input, not RFC compliance.
const DEVICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidDeviceId(deviceId: unknown): deviceId is string {
  return typeof deviceId === 'string' && DEVICE_ID_RE.test(deviceId);
}

export interface PresenceStore {
  upsert(deviceId: string, now: number): Promise<void>;
  countSince(cutoff: number): Promise<number>;
  pruneBefore(cutoff: number): Promise<void>;
}

export type BeatResult = { status: 'invalid' } | { status: 'ok'; count: number };

// Record one device's heartbeat and return the live count. Rejects a
// malformed device id before touching the store. Pruning is opportunistic:
// `shouldPrune` decides on each successful beat (default ~1% via Math.random,
// injectable so tests can force it on/off deterministically).
export async function beat(
  store: PresenceStore,
  deviceId: string,
  now: number,
  shouldPrune: () => boolean = () => Math.random() < 0.01,
): Promise<BeatResult> {
  if (!isValidDeviceId(deviceId)) return { status: 'invalid' };
  await store.upsert(deviceId, now);
  if (shouldPrune()) {
    await store.pruneBefore(now - PRUNE_AGE_MS);
  }
  const count = await store.countSince(now - PRESENCE_WINDOW_MS);
  return { status: 'ok', count };
}

// --- D1-backed store ---------------------------------------------------------

export function d1PresenceStore(db: D1Database): PresenceStore {
  return {
    async upsert(deviceId, now) {
      await db
        .prepare(
          `INSERT INTO presence (deviceId, lastSeen) VALUES (?, ?)
           ON CONFLICT(deviceId) DO UPDATE SET lastSeen = excluded.lastSeen`,
        )
        .bind(deviceId, now)
        .run();
    },
    async countSince(cutoff) {
      const row = await db
        .prepare('SELECT COUNT(*) as c FROM presence WHERE lastSeen >= ?')
        .bind(cutoff)
        .first<{ c: number }>();
      return row?.c ?? 0;
    },
    async pruneBefore(cutoff) {
      await db.prepare('DELETE FROM presence WHERE lastSeen < ?').bind(cutoff).run();
    },
  };
}
