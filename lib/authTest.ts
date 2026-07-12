// Tests for the pure auth helpers in lib/authForms.ts: form validation, phase
// derivation, and interpreting the better-auth client's { data, error }
// responses. These are the testable core of lib/auth.tsx without standing up
// React or the network. Run: tsx lib/authTest.ts (or via npm test)

import {
  deriveAuthPhase,
  interpretSignIn,
  interpretSignUp,
  isValidEmail,
  validateResetEmail,
  validateSignIn,
  validateSignUp,
  MIN_PASSWORD_LENGTH,
} from './authForms';

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
  // --- email validation -----------------------------------------------------
  ok('a normal email is valid', isValidEmail('player@example.com'));
  ok('whitespace is tolerated around a valid email', isValidEmail('  player@example.com  '));
  ok('a missing @ is invalid', !isValidEmail('playerexample.com'));
  ok('a missing domain dot is invalid', !isValidEmail('player@example'));
  ok('an empty string is invalid', !isValidEmail(''));

  // --- sign-up validation ---------------------------------------------------
  const good = { name: 'Ada', email: 'ada@x.co', password: 'longenough', confirm: 'longenough' };
  ok('a well-formed sign-up passes', validateSignUp(good) === null);
  ok('a blank name is rejected', validateSignUp({ ...good, name: '  ' }) !== null);
  ok('a bad email is rejected', validateSignUp({ ...good, email: 'nope' }) !== null);
  ok(
    'a short password is rejected',
    validateSignUp({ ...good, password: 'short', confirm: 'short' })?.includes(String(MIN_PASSWORD_LENGTH)) === true,
  );
  ok(
    'a password mismatch is rejected',
    validateSignUp({ ...good, confirm: 'different!' }) === 'Passwords do not match.',
  );

  // --- sign-in / reset validation ------------------------------------------
  ok('sign-in needs a valid email', validateSignIn({ email: 'nope', password: 'x' }) !== null);
  ok('sign-in needs a password', validateSignIn({ email: 'a@b.co', password: '' }) !== null);
  ok('a valid sign-in passes', validateSignIn({ email: 'a@b.co', password: 'x' }) === null);
  ok('reset needs a valid email', validateResetEmail('nope') !== null);
  ok('a valid reset email passes', validateResetEmail('a@b.co') === null);

  // --- phase derivation: guest -> pending -> signed-in -> signed-out --------
  ok('loading wins over everything', deriveAuthPhase({ loading: true, hasSession: false, pendingEmail: null }) === 'loading');
  ok('no session, no pending is guest', deriveAuthPhase({ loading: false, hasSession: false, pendingEmail: null }) === 'guest');
  ok(
    'a pending email is pending-verification',
    deriveAuthPhase({ loading: false, hasSession: false, pendingEmail: 'a@b.co' }) === 'pending-verification',
  );
  ok('a session is signed-in', deriveAuthPhase({ loading: false, hasSession: true, pendingEmail: null }) === 'signed-in');
  ok(
    'a session outranks a stale pending email',
    deriveAuthPhase({ loading: false, hasSession: true, pendingEmail: 'a@b.co' }) === 'signed-in',
  );
  ok(
    'signed out returns to guest',
    deriveAuthPhase({ loading: false, hasSession: false, pendingEmail: null }) === 'guest',
  );

  // --- interpreting sign-up responses ---------------------------------------
  ok(
    'sign-up with no session token is pending-verification',
    interpretSignUp({ data: { token: null } }, 'a@b.co').status === 'verification-pending',
  );
  ok(
    'sign-up that returns a session is signed-in',
    interpretSignUp({ data: { token: 'tok' } }, 'a@b.co').status === 'signed-in',
  );
  ok(
    'a sign-up error surfaces as an error',
    interpretSignUp({ error: { message: 'taken' } }, 'a@b.co').status === 'error',
  );

  // --- interpreting sign-in responses ---------------------------------------
  ok(
    'unverified sign-in is pending, not an error',
    interpretSignIn({ error: { code: 'EMAIL_NOT_VERIFIED', message: 'Email not verified' } }, 'a@b.co').status ===
      'verification-pending',
  );
  ok(
    'a wrong-password sign-in is an error',
    interpretSignIn({ error: { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' } }, 'a@b.co')
      .status === 'error',
  );
  ok(
    'a successful sign-in is signed-in',
    interpretSignIn({ data: { token: 'tok' } }, 'a@b.co').status === 'signed-in',
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
