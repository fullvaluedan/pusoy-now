// Marketing email consent (U3): a per-user opt-in/opt-out row, captured at
// signup (unchecked box) or via a one-time post-sign-in prompt for
// social-login users. One row per user records the CURRENT choice;
// re-submitting overwrites it in place rather than piling up history, which
// is what a lawful, exportable opt-in mailing list needs (docs/DEPLOY.md's
// export query reads this table directly).
//
// The store seam and pure record/read logic are split from D1, the same
// shape as profile.ts and friends.ts, so upsert/re-submit/missing-row
// scenarios are unit-testable with no D1. The route (session gating, live
// D1) is wired in index.ts.

export interface ConsentRow {
  userId: string;
  optIn: boolean;
  source: string;
  updatedAt: number;
}

export interface ConsentStore {
  get(userId: string): Promise<ConsentRow | null>;
  upsert(userId: string, optIn: boolean, source: string, now: number): Promise<void>;
}

// Record (or update) a user's marketing consent choice. Idempotent: a
// re-submit overwrites optIn/source/updatedAt on the same row instead of
// creating a new one, so "declined the prompt" and "opted in at signup" both
// leave exactly one row, and the row's existence is what stops the post-
// sign-in prompt from repeating.
export async function recordConsent(
  store: ConsentStore,
  userId: string,
  optIn: boolean,
  source: string,
  now: number,
): Promise<ConsentRow> {
  await store.upsert(userId, optIn, source, now);
  return { userId, optIn, source, updatedAt: now };
}

// The caller's current consent row, or null if they have never recorded one.
// The client uses null to decide whether to show the post-sign-in prompt.
export async function getConsent(store: ConsentStore, userId: string): Promise<ConsentRow | null> {
  return store.get(userId);
}

// --- D1-backed store ---------------------------------------------------------

interface ConsentD1Row {
  userId: string;
  optIn: number;
  source: string;
  updatedAt: number;
}

export function d1ConsentStore(db: D1Database): ConsentStore {
  return {
    async get(userId) {
      const row = await db
        .prepare('SELECT userId, optIn, source, updatedAt FROM marketing_consent WHERE userId = ?')
        .bind(userId)
        .first<ConsentD1Row>();
      if (!row) return null;
      return { userId: row.userId, optIn: row.optIn === 1, source: row.source, updatedAt: row.updatedAt };
    },
    async upsert(userId, optIn, source, now) {
      await db
        .prepare(
          `INSERT INTO marketing_consent (userId, optIn, source, updatedAt) VALUES (?, ?, ?, ?)
           ON CONFLICT(userId) DO UPDATE SET optIn = excluded.optIn, source = excluded.source, updatedAt = excluded.updatedAt`,
        )
        .bind(userId, optIn ? 1 : 0, source, now)
        .run();
    },
  };
}
