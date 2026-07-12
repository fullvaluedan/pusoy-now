// Tests for the pure profile helpers in lib/profile.ts.
//
// Under better-auth the user row already carries the resolved name and image
// (the Worker maps social providers into it), so the client helpers are now a
// straight read with sensible fallbacks. These live outside lib/auth.tsx so the
// node harness never imports react-native. Same minimal ok() harness as the
// engine tests. Run: tsx lib/profileTest.ts (or via npm test)

import { pickAvatarUrl, pickDisplayName, validateUsernameClient, type AuthUser } from './profile';

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

function main() {
  // --- display name ---------------------------------------------------------
  ok('a name is used as-is', pickDisplayName({ name: 'Ada Lovelace' }) === 'Ada Lovelace');
  ok(
    'the email local-part stands in when there is no name',
    pickDisplayName({ email: 'grace@example.com' }) === 'grace',
  );
  ok(
    'an empty name falls through to the email',
    pickDisplayName({ name: '', email: 'x@y.co' }) === 'x',
  );
  ok('a neutral fallback when nothing is known', pickDisplayName({}) === 'Player');
  ok('null fields do not throw', pickDisplayName({ name: null, email: null }) === 'Player');

  // --- avatar ---------------------------------------------------------------
  ok('an image url is returned', pickAvatarUrl({ image: 'https://cdn/x.jpg' }) === 'https://cdn/x.jpg');
  ok('no image falls back to null (initials in the UI)', pickAvatarUrl({}) === null);
  ok('an empty image string is treated as no image', pickAvatarUrl({ image: '' }) === null);
  ok('a null image is null', pickAvatarUrl({ image: null }) === null);

  // Type-level anchor: the helpers accept a bare AuthUser subset.
  const u: AuthUser = { name: 'Test', email: 't@e.co', image: null };
  ok('AuthUser shape is accepted', pickDisplayName(u) === 'Test' && pickAvatarUrl(u) === null);

  // --- username client mirror ----------------------------------------------
  ok('a clean handle validates', validateUsernameClient('ada_42').ok === true);
  ok('mixed case is lowercased', (() => {
    const r = validateUsernameClient('AdaLovelace');
    return r.ok && r.username === 'adalovelace';
  })());
  ok('too short is rejected as length', (() => {
    const r = validateUsernameClient('ab');
    return !r.ok && r.reason === 'length';
  })());
  ok('spaces are rejected as charset', (() => {
    const r = validateUsernameClient('a b');
    return !r.ok && r.reason === 'charset';
  })());
  ok('a reserved handle is rejected', (() => {
    const r = validateUsernameClient('admin');
    return !r.ok && r.reason === 'reserved';
  })());

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
