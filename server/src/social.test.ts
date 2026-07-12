// Tests for social provider feature-detection and profile mapping.
//
// The live authorize-URL check is deferred until the user registers the OAuth
// apps (documented in docs/AUTH-SETUP.md). What is asserted offline: providers
// appear only when their id/secret pair exists, and the avatar/name mapping
// produces the right sized image from fixture provider payloads.
//
// Run: tsx src/social.test.ts (or via npm test)

import type { Env } from './auth';
import {
  AVATAR_SIZE,
  configuredProviderIds,
  mapFacebookProfile,
  mapGoogleProfile,
  sizeGoogleAvatarUrl,
  socialProvidersFor,
} from './social';

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
  return { DB: {} as D1Database, GAME_ROOM: {} as Env['GAME_ROOM'], MATCHMAKER: {} as Env['MATCHMAKER'], BETTER_AUTH_SECRET: 'test-secret', ...overrides };
}

const GOOGLE = { GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsec' };
const FACEBOOK = { FACEBOOK_CLIENT_ID: 'fid', FACEBOOK_CLIENT_SECRET: 'fsec' };
const APPLE = {
  APPLE_CLIENT_ID: 'app.prends.web',
  APPLE_CLIENT_SECRET: 'es256.jwt',
  APPLE_APP_BUNDLE_IDENTIFIER: 'app.prends',
};

function main() {
  // --- Google avatar sizing -------------------------------------------------
  ok(
    'a Google =s96-c token is rewritten to the target size',
    sizeGoogleAvatarUrl('https://lh3.googleusercontent.com/a/x=s96-c') ===
      `https://lh3.googleusercontent.com/a/x=s${AVATAR_SIZE}`,
  );
  ok(
    'a Google url with no size token gets one appended',
    sizeGoogleAvatarUrl('https://lh3.googleusercontent.com/a/x') ===
      `https://lh3.googleusercontent.com/a/x=s${AVATAR_SIZE}`,
  );

  // --- profile mapping ------------------------------------------------------
  const g = mapGoogleProfile({ name: 'Ada Lovelace', picture: 'https://lh3/a=s96-c' });
  ok('Google mapping keeps the name', g.name === 'Ada Lovelace');
  ok('Google mapping upsizes the image', g.image === `https://lh3/a=s${AVATAR_SIZE}`);
  ok('Google mapping tolerates a missing picture', mapGoogleProfile({ name: 'X' }).image === undefined);

  const f = mapFacebookProfile({ name: 'Grace Hopper', picture: { data: { url: 'https://fb/big.jpg' } } });
  ok('Facebook mapping keeps the name', f.name === 'Grace Hopper');
  ok('Facebook mapping reads picture.data.url', f.image === 'https://fb/big.jpg');
  ok('Facebook mapping tolerates a missing picture', mapFacebookProfile({ name: 'X' }).image === undefined);

  // --- feature detection ----------------------------------------------------
  ok('no secrets means no providers configured', configuredProviderIds(fakeEnv()).length === 0);
  ok('no secrets means an empty socialProviders block', Object.keys(socialProvidersFor(fakeEnv())).length === 0);

  const gOnly = fakeEnv(GOOGLE);
  ok('Google alone configures only google', JSON.stringify(configuredProviderIds(gOnly)) === JSON.stringify(['google']));
  ok('Google alone registers the google provider', Boolean(socialProvidersFor(gOnly)?.google));
  ok('Google alone does not register facebook', !socialProvidersFor(gOnly)?.facebook);

  const both = fakeEnv({ ...GOOGLE, ...FACEBOOK });
  ok('both pairs configure both providers', configuredProviderIds(both).length === 2);
  ok('the facebook provider is registered when its pair exists', Boolean(socialProvidersFor(both)?.facebook));

  // A half-configured provider (id but no secret) must not register.
  const half = fakeEnv({ GOOGLE_CLIENT_ID: 'gid' });
  ok('an id without a secret does not configure the provider', configuredProviderIds(half).length === 0);

  // --- Apple feature detection ----------------------------------------------
  ok('no Apple secrets means apple is not listed', !configuredProviderIds(fakeEnv()).includes('apple'));
  ok('no Apple secrets means no apple provider', !socialProvidersFor(fakeEnv())?.apple);

  const appleAll = fakeEnv(APPLE);
  ok('all three Apple secrets list apple', configuredProviderIds(appleAll).includes('apple'));
  ok('all three Apple secrets register the apple provider', Boolean(socialProvidersFor(appleAll)?.apple));
  ok(
    'the apple provider passes appBundleIdentifier through (native idToken flow)',
    (socialProvidersFor(appleAll)?.apple as { appBundleIdentifier?: string })?.appBundleIdentifier === 'app.prends',
  );

  // Apple needs the bundle id too: id + secret alone must not register it, or
  // native idToken verification would fail at runtime with "Invalid id token".
  const appleNoBundle = fakeEnv({ APPLE_CLIENT_ID: 'app.prends.web', APPLE_CLIENT_SECRET: 'es256.jwt' });
  ok('Apple without the bundle id is not listed', !configuredProviderIds(appleNoBundle).includes('apple'));
  ok('Apple without the bundle id does not register', !socialProvidersFor(appleNoBundle)?.apple);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
