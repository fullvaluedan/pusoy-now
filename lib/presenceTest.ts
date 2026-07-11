// Tests for the pure parts of lib/presence.ts: device id persistence (via a
// storage fake), the generated id's shape, and the foreground predicate that
// drives the hook's beat scheduling. React hooks (usePresence) are not
// exercised here -- that's a live/UI concern -- only the extracted pure
// helpers are.
//
// Run: tsx lib/presenceTest.ts (or via npm test)

import { generateDeviceId, isForegroundState, resolveDeviceId, type DeviceIdStorage } from './presencePure';

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fakeStorage(initial: string | null = null): DeviceIdStorage & { value: string | null; writes: number } {
  const state = { value: initial, writes: 0 };
  return {
    get value() {
      return state.value;
    },
    get writes() {
      return state.writes;
    },
    async read() {
      return state.value;
    },
    async write(v: string) {
      state.value = v;
      state.writes++;
    },
  };
}

async function main() {
  // --- generateDeviceId shape --------------------------------------------------
  {
    const id = generateDeviceId();
    ok('a generated id is 36 characters', id.length === 36);
    ok('a generated id matches the UUID shape', UUID_RE.test(id));
    const other = generateDeviceId();
    ok('two generated ids are (almost certainly) different', id !== other);
  }

  // --- resolveDeviceId: no existing id generates and persists one -------------
  {
    const storage = fakeStorage(null);
    const id = await resolveDeviceId(storage, () => 'generated-id-1');
    ok('a fresh storage generates a new id', id === 'generated-id-1');
    ok('the generated id is persisted', storage.value === 'generated-id-1');
    ok('exactly one write happens', storage.writes === 1);
  }

  // --- resolveDeviceId: an existing id is read back, not regenerated ----------
  {
    const storage = fakeStorage('existing-id');
    let generateCalls = 0;
    const id = await resolveDeviceId(storage, () => {
      generateCalls++;
      return 'should-not-be-used';
    });
    ok('an existing id is returned as-is', id === 'existing-id');
    ok('the generator is never called when an id already exists', generateCalls === 0);
    ok('no write happens for an existing id', storage.writes === 0);
  }

  // --- resolveDeviceId: repeated calls against the same storage are stable ----
  {
    const storage = fakeStorage(null);
    const first = await resolveDeviceId(storage, () => 'stable-id');
    const second = await resolveDeviceId(storage, () => 'a-different-id-if-called-again');
    ok('a second resolve reuses the persisted id', first === second && second === 'stable-id');
  }

  // --- isForegroundState -------------------------------------------------------
  {
    ok('active is foreground', isForegroundState('active') === true);
    ok('background is not foreground', isForegroundState('background') === false);
    ok('inactive is not foreground', isForegroundState('inactive') === false);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

void main();
