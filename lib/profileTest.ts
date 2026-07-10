// Tests for the pure auth helpers in lib/profile.ts.
//
// These deliberately live outside lib/auth.tsx so the node test harness never
// has to import react-native. Same minimal ok() harness as lib/pusoy/test.ts.
// Run: tsx lib/profileTest.ts (or via npm test)

import {
  buildPlayerRow,
  interpretAuthSessionResult,
  pickDisplayName,
  pickProvider,
  pickRawAvatarUrl,
  resolveAvatarUrl,
  sizeGoogleAvatarUrl,
  upsertPlayer,
  type UserLike,
} from './profile';

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

// Fixtures -----------------------------------------------------------------

const googleUser: UserLike = {
  app_metadata: { provider: 'google' },
  user_metadata: {
    avatar_url: 'https://lh3.googleusercontent.com/a/x=s96-c',
    full_name: 'Ada Lovelace',
  },
};

const emptyUser: UserLike = { user_metadata: {}, identities: [] };

// GoTrue only ever hands back a 50px Facebook thumbnail, so the usable URL has
// to be re-fetched from the Graph API with the provider token.
const FB_THUMB = 'https://platform-lookaside.fbsbx.com/tiny.jpg';
const FB_BIG = 'https://scontent.xx.fbcdn.net/v/big400.jpg';
const fbUser: UserLike = {
  app_metadata: { provider: 'facebook' },
  user_metadata: { avatar_url: FB_THUMB, full_name: 'Grace Hopper' },
};

function graphFetch(status: number, body: unknown, seen?: { url: string }): typeof fetch {
  return (async (url: string) => {
    if (seen) seen.url = String(url);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

function fakeClient() {
  const calls: { table: string; row: any; opts: any }[] = [];
  return {
    calls,
    from(table: string) {
      return {
        upsert: async (row: any, opts: any) => {
          calls.push({ table, row, opts });
          return { error: null };
        },
      };
    },
  };
}

async function main() {
  // --- Google avatar sizing ------------------------------------------------
  console.log('google avatar sizing');
  ok(
    'a bare Google URL gains =s400',
    sizeGoogleAvatarUrl('https://lh3.googleusercontent.com/a/ACg8ocKabc') ===
      'https://lh3.googleusercontent.com/a/ACg8ocKabc=s400',
  );
  ok(
    'an existing size token is replaced, not appended',
    sizeGoogleAvatarUrl('https://lh3.googleusercontent.com/a/ACg8ocKabc=s96-c') ===
      'https://lh3.googleusercontent.com/a/ACg8ocKabc=s400',
  );
  ok(
    'a plain =s64 token is replaced',
    sizeGoogleAvatarUrl('https://lh3.googleusercontent.com/a/x=s64') ===
      'https://lh3.googleusercontent.com/a/x=s400',
  );

  // --- picking the raw avatar out of the user object -----------------------
  console.log('avatar url extraction');
  ok(
    'reads user_metadata.avatar_url',
    pickRawAvatarUrl(googleUser) === 'https://lh3.googleusercontent.com/a/x=s96-c',
  );
  ok(
    'falls back to user_metadata.picture',
    pickRawAvatarUrl({ user_metadata: { picture: 'https://lh3.googleusercontent.com/a/y' } }) ===
      'https://lh3.googleusercontent.com/a/y',
  );
  ok(
    'missing metadata falls back to identities[].identity_data',
    pickRawAvatarUrl({
      user_metadata: {},
      identities: [{ provider: 'google', identity_data: { picture: 'https://lh3.googleusercontent.com/a/z' } }],
    }) === 'https://lh3.googleusercontent.com/a/z',
  );
  ok('all-missing yields null', pickRawAvatarUrl(emptyUser) === null);

  // --- resolveAvatarUrl ----------------------------------------------------
  console.log('resolveAvatarUrl');
  ok(
    'google url gains =s400 end to end',
    (await resolveAvatarUrl(googleUser, { providerToken: null })) ===
      'https://lh3.googleusercontent.com/a/x=s400',
  );

  const seen = { url: '' };
  const fbResolved = await resolveAvatarUrl(fbUser, {
    providerToken: 'tok123',
    fetchFn: graphFetch(200, { picture: { data: { url: FB_BIG } } }, seen),
  });
  ok('facebook re-fetches the 400px url', fbResolved === FB_BIG, fbResolved);
  ok('facebook graph call asks for width 400', seen.url.includes('picture.width(400)'), seen.url);
  ok('facebook graph call sends the provider token', seen.url.includes('access_token=tok123'), seen.url);

  ok(
    'facebook falls back to the thumbnail with no provider token',
    (await resolveAvatarUrl(fbUser, { providerToken: null })) === FB_THUMB,
  );
  ok(
    'facebook falls back to the thumbnail when the graph call fails',
    (await resolveAvatarUrl(fbUser, {
      providerToken: 'tok123',
      fetchFn: graphFetch(400, { error: 'bad token' }),
    })) === FB_THUMB,
  );
  ok(
    'facebook falls back to the thumbnail when the graph call throws',
    (await resolveAvatarUrl(fbUser, {
      providerToken: 'tok123',
      fetchFn: (async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch,
    })) === FB_THUMB,
  );
  ok(
    'a user with no avatar anywhere resolves to null',
    (await resolveAvatarUrl(emptyUser, { providerToken: null })) === null,
  );

  // --- display name and provider -------------------------------------------
  console.log('display name and provider');
  ok('display name from full_name', pickDisplayName(googleUser) === 'Ada Lovelace');
  ok(
    'display name from name when full_name is missing',
    pickDisplayName({ user_metadata: { name: 'Alan Turing' } }) === 'Alan Turing',
  );
  ok(
    'display name falls back to the email local part',
    pickDisplayName({ user_metadata: {}, email: 'katherine@nasa.gov' }) === 'katherine',
  );
  ok('display name falls back to Player', pickDisplayName(emptyUser) === 'Player');
  ok('provider from app_metadata', pickProvider(googleUser) === 'google');
  ok(
    'provider falls back to the first identity',
    pickProvider({ identities: [{ provider: 'facebook' }] }) === 'facebook',
  );
  ok('provider is null when unknown', pickProvider(emptyUser) === null);

  // --- the players row ------------------------------------------------------
  console.log('players row');
  const row = buildPlayerRow('uid-1', googleUser, 'https://img/x=s400');
  ok('row carries user_id', row.user_id === 'uid-1');
  ok('row carries display_name', row.display_name === 'Ada Lovelace');
  ok('row carries avatar_url', row.avatar_url === 'https://img/x=s400');
  ok('row carries social_provider', row.social_provider === 'google');

  // Keyed on user_id so a repeat sign-in refreshes the (expiring) Facebook
  // avatar_url instead of failing on a duplicate primary key.
  const firstSignIn = fakeClient();
  await upsertPlayer(firstSignIn as any, row);
  ok(
    'first sign-in upserts display_name, avatar_url, social_provider into players',
    firstSignIn.calls.length === 1 &&
      firstSignIn.calls[0].table === 'players' &&
      firstSignIn.calls[0].opts?.onConflict === 'user_id' &&
      firstSignIn.calls[0].row.display_name === 'Ada Lovelace' &&
      firstSignIn.calls[0].row.avatar_url === 'https://img/x=s400' &&
      firstSignIn.calls[0].row.social_provider === 'google',
    firstSignIn.calls[0],
  );

  const repeatSignIn = fakeClient();
  await upsertPlayer(repeatSignIn as any, buildPlayerRow('uid-1', googleUser, 'https://img/fresh=s400'));
  ok(
    'a repeat sign-in refreshes avatar_url',
    repeatSignIn.calls[0].row.avatar_url === 'https://img/fresh=s400',
  );

  // --- OAuth callback interpretation ---------------------------------------
  console.log('oauth callback');
  const good = interpretAuthSessionResult({ type: 'success', url: 'pusoynow://auth-callback?code=abc123' });
  ok('a success url yields its code', good.kind === 'code' && good.code === 'abc123');
  ok('a cancelled browser session is not an error', interpretAuthSessionResult({ type: 'cancel' }).kind === 'cancelled');
  ok('a dismissed browser session is not an error', interpretAuthSessionResult({ type: 'dismiss' }).kind === 'cancelled');
  ok(
    'the user denying consent is not an error either',
    interpretAuthSessionResult({
      type: 'success',
      url: 'pusoynow://auth-callback?error=access_denied&error_description=User+denied',
    }).kind === 'cancelled',
  );
  ok(
    'a provider error surfaces as an error',
    interpretAuthSessionResult({
      type: 'success',
      url: 'pusoynow://auth-callback?error=server_error&error_description=Boom',
    }).kind === 'error',
  );
  ok(
    'a success url with no code is an error',
    interpretAuthSessionResult({ type: 'success', url: 'pusoynow://auth-callback' }).kind === 'error',
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

void main();
