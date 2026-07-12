// Tests for account-deletion logic.
//
// The pure deleteAccount logic runs against an in-memory store that mimics the
// D1 cascade (deleting the user row drops the user, its consent row, and both
// directions of its friendships), so the plan's scenarios - full purge removes
// user + verifications by email, a friended user deletes cleanly, apple-linked
// user revokes exactly once, a revocation failure never blocks deletion, and an
// unknown user returns not-found without throwing - are proven with no D1. The
// route's session gate is the same requireUserId mechanism proven elsewhere and
// is verified live by the orchestrator.
//
// Run: tsx src/deletion.test.ts (or via npm test)

import { deleteAccount, type DeletionStore } from './deletion';

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

// In-memory store mimicking the D1 tables and their cascade. Deleting a user
// drops that user, its consent row, its verification rows are deleted
// explicitly (no FK in real schema), and both friendship directions - exactly
// the rows the plan says must be gone.
function memStore(seed: {
  users: { id: string; email: string; apple?: boolean }[];
  friendships?: [string, string][];
  consent?: string[];
  verifications?: { identifier: string }[];
}) {
  const users = new Map(seed.users.map((u) => [u.id, u]));
  const apple = new Set(seed.users.filter((u) => u.apple).map((u) => u.id));
  let friendships = [...(seed.friendships ?? [])];
  const consent = new Set(seed.consent ?? []);
  let verifications = [...(seed.verifications ?? [])];

  const store: DeletionStore = {
    async getUserEmail(userId) {
      return users.get(userId)?.email ?? null;
    },
    async hasAppleLink(userId) {
      return apple.has(userId);
    },
    async deleteVerificationsByIdentifier(email) {
      verifications = verifications.filter((v) => v.identifier !== email);
    },
    async deleteUser(userId) {
      users.delete(userId);
      consent.delete(userId);
      // Cascade: both directions of any friendship touching this user.
      friendships = friendships.filter(([a, b]) => a !== userId && b !== userId);
    },
  };
  return {
    store,
    users,
    consent,
    friendshipsFor: (id: string) => friendships.filter(([a, b]) => a === id || b === id),
    verifications: () => verifications,
  };
}

async function main() {
  // --- full purge removes the user + verifications by email ------------------
  {
    const m = memStore({
      users: [{ id: 'u1', email: 'a@example.com' }],
      consent: ['u1'],
      verifications: [{ identifier: 'a@example.com' }, { identifier: 'other@example.com' }],
    });
    const res = await deleteAccount(m.store, 'u1');
    ok('deleted status returned', res.status === 'deleted');
    ok('user row is gone', !m.users.has('u1'));
    ok('consent row cascaded away', !m.consent.has('u1'));
    ok(
      'verification rows for the email are deleted',
      !m.verifications().some((v) => v.identifier === 'a@example.com'),
    );
    ok(
      "another user's verification rows are untouched",
      m.verifications().some((v) => v.identifier === 'other@example.com'),
    );
  }

  // --- a user with friendships deletes cleanly (both directions) -------------
  {
    const m = memStore({
      users: [
        { id: 'u1', email: 'a@example.com' },
        { id: 'u2', email: 'b@example.com' },
      ],
      // u1 as requester and as target, to prove both directions are removed.
      friendships: [
        ['u1', 'u2'],
        ['u2', 'u1'],
      ],
    });
    const res = await deleteAccount(m.store, 'u1');
    ok('friended user deletes without throwing', res.status === 'deleted');
    ok('no friendship row referencing the deleted user remains', m.friendshipsFor('u1').length === 0);
    ok('the surviving friend still exists', m.users.has('u2'));
  }

  // --- apple-linked user revokes exactly once --------------------------------
  {
    const m = memStore({ users: [{ id: 'u1', email: 'a@example.com', apple: true }] });
    let calls = 0;
    const res = await deleteAccount(m.store, 'u1', {
      revokeApple: async () => {
        calls++;
      },
    });
    ok('apple-linked deletion succeeds', res.status === 'deleted');
    ok('revocation is called exactly once', calls === 1);
    ok('the user is still purged', !m.users.has('u1'));
  }

  // --- a non-apple user does not call the revoke hook ------------------------
  {
    const m = memStore({ users: [{ id: 'u1', email: 'a@example.com' }] });
    let calls = 0;
    await deleteAccount(m.store, 'u1', {
      revokeApple: async () => {
        calls++;
      },
    });
    ok('revocation is skipped for a non-apple account', calls === 0);
  }

  // --- a revocation failure never blocks deletion ----------------------------
  {
    const m = memStore({ users: [{ id: 'u1', email: 'a@example.com', apple: true }] });
    const res = await deleteAccount(m.store, 'u1', {
      revokeApple: async () => {
        throw new Error('Apple is down');
      },
    });
    ok('deletion still succeeds when revocation throws', res.status === 'deleted');
    ok('the user is purged despite the revocation failure', !m.users.has('u1'));
  }

  // --- unknown user returns not-found without throwing -----------------------
  {
    const m = memStore({ users: [{ id: 'u1', email: 'a@example.com' }] });
    const res = await deleteAccount(m.store, 'ghost');
    ok('unknown user returns not-found', res.status === 'not-found');
    ok('the real user is left untouched', m.users.has('u1'));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

void main();
