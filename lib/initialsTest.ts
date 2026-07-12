// Tests for the avatar initial extraction logic in lib/initials.ts.
// Run: tsx lib/initialsTest.ts (or via npm test)

import { avatarInitial } from './initials';

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

console.log('avatar initial extraction');
ok('renders first initial for a normal name', avatarInitial('Alice') === 'A');
ok('uppercases a lowercase name', avatarInitial('bob') === 'B');
ok('returns ? for an empty string', avatarInitial('') === '?');
ok('returns ? for a whitespace-only string', avatarInitial('   ') === '?');
ok('returns ? for undefined', avatarInitial(undefined) === '?');
ok('handles a leading-space name', avatarInitial('  Charlie') === 'C');
ok('handles a single-character name', avatarInitial('X') === 'X');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
