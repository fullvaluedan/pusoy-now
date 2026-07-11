// Tests for the email-account config and the Resend/dev-mailbox sender.
//
// The offline-assertable surface: verification + reset are wired, captcha is
// feature-detected on the Turnstile secret, and the email sender behaves in
// both modes (dev-mailbox logs, resend POSTs the right payload and surfaces
// failures). The live behaviors the plan lists — unverified sign-in rejected,
// verify flips the flag, no user enumeration, single-use reset token, captcha
// rejection, rate-limit 429 — are exercised against `wrangler dev` and the
// deployed Worker (dev-mailbox URL from the logs), not here.
//
// Run: tsx src/auth.test.ts (or via npm test)

import { authOptions, type Env } from './auth';
import { emailBody, emailMode, sendAuthEmail, type AuthEmail } from './email';

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

function fakeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    GAME_ROOM: {} as Env['GAME_ROOM'],
    BETTER_AUTH_SECRET: 'test-secret',
    ...overrides,
  };
}

async function main() {
  // --- verification + reset wiring -----------------------------------------
  const opts = authOptions(fakeEnv());
  ok('unverified emails cannot sign in', opts.emailAndPassword?.requireEmailVerification === true);
  ok(
    'a verification email sender is wired',
    typeof opts.emailVerification?.sendVerificationEmail === 'function',
  );
  ok('accounts verify-then-sign-in', opts.emailVerification?.autoSignInAfterVerification === true);
  ok(
    'a reset-password sender is wired',
    typeof opts.emailAndPassword?.sendResetPassword === 'function',
  );

  // --- captcha is feature-detected on the Turnstile secret ------------------
  ok(
    'captcha is off when no Turnstile secret is set',
    !(opts.plugins ?? []).some((p) => p.id === 'captcha'),
    (opts.plugins ?? []).map((p) => p.id),
  );
  const withCaptcha = authOptions(fakeEnv({ TURNSTILE_SECRET_KEY: 'ts-secret' }));
  ok(
    'captcha turns on the moment the secret exists',
    (withCaptcha.plugins ?? []).some((p) => p.id === 'captcha'),
    (withCaptcha.plugins ?? []).map((p) => p.id),
  );

  // --- anonymous guest sessions are always on (guest play is core) ----------
  ok(
    'the anonymous plugin is wired without any secret',
    (opts.plugins ?? []).some((p) => p.id === 'anonymous'),
    (opts.plugins ?? []).map((p) => p.id),
  );
  ok(
    'the anonymous plugin survives captcha composition',
    (withCaptcha.plugins ?? []).some((p) => p.id === 'anonymous') &&
      (withCaptcha.plugins ?? []).some((p) => p.id === 'captcha'),
    (withCaptcha.plugins ?? []).map((p) => p.id),
  );

  // --- email mode ------------------------------------------------------------
  ok('no Resend key means dev-mailbox mode', emailMode(fakeEnv()) === 'dev-mailbox');
  ok('a Resend key means resend mode', emailMode(fakeEnv({ RESEND_API_KEY: 're_x' })) === 'resend');

  // --- email bodies (UI copy rules: no em dash, no emoji) -------------------
  const verifyBody = emailBody('verify', 'https://w/verify?token=abc');
  const resetBody = emailBody('reset', 'https://w/reset?token=abc');
  ok('the verify body carries the link', verifyBody.includes('https://w/verify?token=abc'));
  ok('the reset body carries the link', resetBody.includes('https://w/reset?token=abc'));
  ok('no em dashes in email copy', !verifyBody.includes('—') && !resetBody.includes('—'));
  // eslint-disable-next-line no-control-regex
  ok('no emoji in email copy', !/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(verifyBody + resetBody));

  // --- dev-mailbox sender: never touches the network ------------------------
  let fetchCalls = 0;
  const spyFetch = (async () => {
    fetchCalls++;
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
  const msg: AuthEmail = { to: 'a@b.co', kind: 'verify', url: 'https://w/v?token=t' };
  await sendAuthEmail(fakeEnv(), msg, spyFetch);
  ok('dev-mailbox mode does not POST to Resend', fetchCalls === 0);

  // --- resend sender: correct endpoint, auth header, and payload ------------
  const seen: { url: string; init: RequestInit } = { url: '', init: {} };
  const captureFetch = (async (url: string, init: RequestInit) => {
    seen.url = String(url);
    seen.init = init;
    return new Response('{"id":"1"}', { status: 200 });
  }) as unknown as typeof fetch;
  await sendAuthEmail(fakeEnv({ RESEND_API_KEY: 're_k', EMAIL_FROM: 'from@x.co' }), msg, captureFetch);
  ok('resend mode POSTs to the Resend API', seen.url === 'https://api.resend.com/emails');
  ok('the API key is sent as a bearer token', String((seen.init.headers as any)?.Authorization) === 'Bearer re_k');
  const body = JSON.parse(String(seen.init.body));
  ok('the recipient and link are in the payload', body.to === 'a@b.co' && String(body.text).includes(msg.url));
  ok('EMAIL_FROM overrides the default sender', body.from === 'from@x.co');

  // --- resend failure surfaces as an error ----------------------------------
  const failFetch = (async () => new Response('nope', { status: 422 })) as unknown as typeof fetch;
  let threw = false;
  try {
    await sendAuthEmail(fakeEnv({ RESEND_API_KEY: 're_k' }), msg, failFetch);
  } catch {
    threw = true;
  }
  ok('a failed Resend send throws', threw);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

void main();
