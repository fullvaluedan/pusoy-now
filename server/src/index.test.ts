// Tests for the auth Worker's resolved config: trustedOrigins and rate limiting.
//
// These are pure-config assertions that never touch D1, so they run in plain
// node via tsx (same minimal ok() harness as the app's lib tests). The live
// pieces the plan calls for — health 200, D1 tables, a forged-origin rejection,
// a 429 under load — are exercised against `wrangler dev` / the deployed Worker
// by the orchestrator, not here. What we can assert deterministically offline is
// that the config the Worker builds is the locked-down one we intend.
//
// Run: tsx src/index.test.ts (or via npm test)

import { authOptions, trustedOriginsFor, type Env } from './auth';

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

// A fake env: authOptions constructs a D1Dialect from env.DB, but never queries
// it, so a bare object stands in fine for config assertions.
function fakeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    GAME_ROOM: {} as Env['GAME_ROOM'],
    BETTER_AUTH_SECRET: 'test-secret',
    ...overrides,
  };
}

function main() {
  // --- trustedOrigins -------------------------------------------------------
  const base = trustedOriginsFor(fakeEnv());
  ok('app scheme is always trusted', base.includes('prends://'));
  ok('local dev origin is trusted', base.includes('http://localhost:8095'));
  ok(
    'a forged web origin is not trusted',
    !base.includes('https://evil.example.com'),
    base,
  );

  const withExtra = trustedOriginsFor(fakeEnv({ TRUSTED_ORIGINS: 'https://prends.pages.dev, https://foo.dev' }));
  ok('configured web origins are added', withExtra.includes('https://prends.pages.dev') && withExtra.includes('https://foo.dev'));
  ok('the scheme survives alongside configured origins', withExtra.includes('prends://'));

  const blank = trustedOriginsFor(fakeEnv({ TRUSTED_ORIGINS: '  ,  , ' }));
  ok('empty TRUSTED_ORIGINS entries are dropped', !blank.includes(''));

  // --- rate limiting --------------------------------------------------------
  const opts = authOptions(fakeEnv());
  ok('rate limiting is enabled', opts.rateLimit?.enabled === true);
  ok('rate limiting is database-backed (shared across isolates)', opts.rateLimit?.storage === 'database');

  // --- email/password + sessions -------------------------------------------
  ok('email/password sign-in is enabled', opts.emailAndPassword?.enabled === true);
  ok('a minimum password length is enforced', (opts.emailAndPassword?.minPasswordLength ?? 0) >= 8);
  ok('the auth API is mounted under /api/auth', opts.basePath === '/api/auth');
  ok('session cookies are Secure', opts.advanced?.defaultCookieAttributes?.secure === true);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
