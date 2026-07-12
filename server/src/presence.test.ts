// Tests for the presence heartbeat's pure beat/count/prune logic.
//
// The pure `beat` function runs against an in-memory store, so the plan's
// scenarios - beat then count includes the device, a stale device is
// excluded, the same device beating twice counts once, a malformed device id
// is rejected, and prune removes only day-old rows - are proven with no D1.
// The route's public access (no requireUserId) is verified live by the
// orchestrator.
//
// Run: tsx src/presence.test.ts (or via npm test)

import { beat, isValidDeviceId, PRESENCE_WINDOW_MS, type PresenceStore } from './presence';

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

// In-memory store: one row per device, the same shape the D1 primary-key
// upsert gives.
function memStore() {
  const rows = new Map<string, number>();
  const store: PresenceStore = {
    async upsert(deviceId, now) {
      rows.set(deviceId, now);
    },
    async countSince(cutoff) {
      let n = 0;
      for (const lastSeen of rows.values()) if (lastSeen >= cutoff) n++;
      return n;
    },
    async pruneBefore(cutoff) {
      for (const [deviceId, lastSeen] of rows) {
        if (lastSeen < cutoff) rows.delete(deviceId);
      }
    },
  };
  return { store, rows };
}

const DEVICE_A = '11111111-1111-1111-1111-111111111111';
const DEVICE_B = '22222222-2222-2222-2222-222222222222';
const DEVICE_C = '33333333-3333-3333-3333-333333333333';

async function main() {
  const now = 1_700_000_000_000;

  // --- beat then count includes the device ------------------------------------
  {
    const { store } = memStore();
    const res = await beat(store, DEVICE_A, now, () => false);
    ok('a valid beat is accepted', res.status === 'ok');
    ok('the count includes the just-beaten device', res.status === 'ok' && res.count === 1);
  }

  // --- a stale device (5 minutes ago) is excluded ------------------------------
  {
    const { store } = memStore();
    await store.upsert(DEVICE_A, now - 5 * 60 * 1000);
    ok('sanity: 5 minutes exceeds the 90s window', 5 * 60 * 1000 > PRESENCE_WINDOW_MS);
    const res = await beat(store, DEVICE_B, now, () => false);
    ok('a device last seen 5 minutes ago is excluded from the count', res.status === 'ok' && res.count === 1);
  }

  // --- the same device beating twice counts once -------------------------------
  {
    const { store, rows } = memStore();
    await beat(store, DEVICE_A, now, () => false);
    const res = await beat(store, DEVICE_A, now + 1_000, () => false);
    ok('beating the same device twice counts once', res.status === 'ok' && res.count === 1);
    ok('only one row exists for the repeated device', rows.size === 1);
  }

  // --- a malformed device id is rejected ----------------------------------------
  {
    const { store, rows } = memStore();
    const res = await beat(store, 'not-a-uuid', now, () => false);
    ok('a malformed device id is rejected', res.status === 'invalid');
    ok('a rejected beat never writes a row', rows.size === 0);
    ok('isValidDeviceId rejects the same shape', !isValidDeviceId('not-a-uuid'));
    ok('isValidDeviceId rejects a non-string', !isValidDeviceId(undefined));
    ok('isValidDeviceId accepts a real UUID shape', isValidDeviceId(DEVICE_A));
  }

  // --- prune removes only day-old rows ------------------------------------------
  {
    const { store, rows } = memStore();
    await store.upsert(DEVICE_A, now - 25 * 60 * 60 * 1000); // 25h old -> pruned
    await store.upsert(DEVICE_B, now - 5 * 60 * 1000); // 5 min old -> kept, just outside the count window
    await beat(store, DEVICE_C, now, () => true); // force the opportunistic prune
    ok('prune removes the day-old row', !rows.has(DEVICE_A));
    ok('prune keeps a row younger than 24h', rows.has(DEVICE_B));
    ok('the beating device itself is kept', rows.has(DEVICE_C));
  }

  // --- shouldPrune false leaves old rows alone ----------------------------------
  {
    const { store, rows } = memStore();
    await store.upsert(DEVICE_A, now - 25 * 60 * 60 * 1000);
    await beat(store, DEVICE_C, now, () => false);
    ok('a beat that does not trigger prune leaves an old row in place', rows.has(DEVICE_A));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

void main();
