// Pure matchmaking-queue logic for the Matchmaker Durable Object (U3).
//
// The Matchmaker is a singleton DO (getByName('global')) that pools players
// looking for a quick match and forms a game the moment 4 are queued, or after
// a 30s wait for whoever is waiting (expert bots fill the empty seats). All of
// the queue arithmetic lives here as pure functions over a QueueState value, so
// the formation rule - the security/fairness-critical piece - is unit-testable
// in node with no Workers runtime. matchmaker.ts is a thin shell that persists
// this state and wires WebSockets + one storage alarm around it.

// A queued player. joinedAt is the wall-clock time they entered the queue; the
// oldest entry drives the 30s force-form deadline.
export interface QueueEntry {
  userId: string;
  username: string | null;
  joinedAt: number;
}

export interface QueueState {
  entries: QueueEntry[];
}

// Quick-match forms as soon as this many players are pooled...
export const MATCH_SIZE = 4;
// ...otherwise the oldest queued player waits at most this long before the
// match forms with whoever is present (expert bots fill the rest).
export const MATCH_WAIT_MS = 30_000;

export function createQueueState(): QueueState {
  return { entries: [] };
}

// Add a player to the queue. Deduped by userId: a second enqueue for someone
// already queued is a no-op (keeps their original joinedAt, so a reconnect does
// not reset their place in line). Returns true iff the entry was added.
export function enqueue(state: QueueState, entry: QueueEntry): boolean {
  if (state.entries.some((e) => e.userId === entry.userId)) return false;
  state.entries.push(entry);
  return true;
}

// Remove a player from the queue (cancel / disconnect). Returns true iff they
// were present.
export function dequeueUser(state: QueueState, userId: string): boolean {
  const i = state.entries.findIndex((e) => e.userId === userId);
  if (i < 0) return false;
  state.entries.splice(i, 1);
  return true;
}

// When the match will be forced to form: the oldest queued player's deadline.
// null when the queue is empty (no alarm to arm).
export function earliestDeadline(state: QueueState, waitMs: number = MATCH_WAIT_MS): number | null {
  if (state.entries.length === 0) return null;
  let oldest = state.entries[0].joinedAt;
  for (const e of state.entries) if (e.joinedAt < oldest) oldest = e.joinedAt;
  return oldest + waitMs;
}

// Decide whether a match should form now. Forms when the queue holds >= 4, OR
// the oldest entry is older than the wait window with at least one player
// queued. Returns the up-to-4 oldest players to seat, or null to keep waiting.
export function shouldForm(
  state: QueueState,
  now: number,
  waitMs: number = MATCH_WAIT_MS,
): { players: QueueEntry[] } | null {
  if (state.entries.length === 0) return null;
  const full = state.entries.length >= MATCH_SIZE;
  const deadline = earliestDeadline(state, waitMs);
  const expired = deadline != null && now >= deadline;
  if (!full && !expired) return null;
  const players = [...state.entries].sort((a, b) => a.joinedAt - b.joinedAt).slice(0, MATCH_SIZE);
  return { players };
}
