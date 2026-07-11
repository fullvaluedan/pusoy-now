// Generic single-flight guard: wraps an async factory so concurrent callers
// share one in-flight promise instead of triggering the underlying operation
// more than once. Used by lib/auth.tsx's ensureSession() to guard the
// anonymous sign-in call (better-auth rejects a second `signIn.anonymous()`
// while one is already resolving -- known plugin retry issue, see the plan's
// Risks section).
//
// This is a per-call guard, not a permanent cache: once the in-flight promise
// settles (success or failure), the next call starts a fresh one.

export function singleFlight<T>(run: () => Promise<T>): () => Promise<T> {
  let inflight: Promise<T> | null = null;
  return () => {
    if (!inflight) {
      inflight = run().finally(() => {
        inflight = null;
      });
    }
    return inflight;
  };
}
