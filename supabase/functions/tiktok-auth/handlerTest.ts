// Tests for the TikTok login bridge.
//
// The handler takes all its dependencies as arguments, so these run in plain
// node with fake TikTok endpoints and a fake Supabase Admin API. Nothing here
// touches the network, and no TikTok developer app is required.
//
// Run: tsx supabase/functions/tiktok-auth/handlerTest.ts (or via npm test)

import {
  handleTikTokAuth,
  tiktokEmail,
  TIKTOK_TOKEN_URL,
  type AdminApiLike,
  type AdminUser,
  type Deps,
  type HandlerRequest,
} from './handler';

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

const CLIENT_SECRET = 'super-secret-client-secret';
const SERVICE_ROLE_KEY = 'super-secret-service-role-key';
const OPEN_ID = 'open-id-abc';

function req(body: unknown, method = 'POST'): HandlerRequest {
  return {
    method,
    json: async () => {
      if (body === undefined) throw new Error('no body');
      return body;
    },
  };
}

// A fake TikTok. `codes` is the set of authorization codes it will honor.
function fakeTikTok(opts: {
  codes?: string[];
  tokenStatus?: number;
  tokenBody?: unknown;
  userStatus?: number;
  userBody?: unknown;
  throwOnToken?: boolean;
}) {
  const seen: { url: string; body?: string }[] = [];
  const fetchFn = (async (url: string, init?: { body?: string; headers?: Record<string, string> }) => {
    seen.push({ url: String(url), body: init?.body });
    if (String(url) === TIKTOK_TOKEN_URL) {
      if (opts.throwOnToken) throw new Error('network down');
      const code = new URLSearchParams(init?.body ?? '').get('code') ?? '';
      const honored = opts.codes ?? ['good-code'];
      if (opts.tokenBody !== undefined || opts.tokenStatus !== undefined) {
        return {
          ok: (opts.tokenStatus ?? 200) < 400,
          status: opts.tokenStatus ?? 200,
          json: async () => opts.tokenBody ?? {},
        } as unknown as Response;
      }
      if (!honored.includes(code)) {
        // TikTok answers 200 with an error field for a bad code.
        return { ok: true, status: 200, json: async () => ({ error: 'invalid_grant' }) } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({ access_token: 'tok-1' }) } as unknown as Response;
    }
    // user info
    return {
      ok: (opts.userStatus ?? 200) < 400,
      status: opts.userStatus ?? 200,
      json: async () =>
        opts.userBody ?? { data: { user: { open_id: OPEN_ID, display_name: 'Dancer', avatar_url: 'https://tt/a.jpg' } } },
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fetchFn, seen };
}

// A fake Admin API backed by an in-memory user table keyed on email, so a
// duplicate create genuinely behaves like GoTrue's.
function fakeAdmin(seed: AdminUser[] = []) {
  const users: AdminUser[] = [...seed];
  const calls = { createUser: 0, generateLink: 0, updateUserById: 0 };
  let nextId = seed.length + 1;

  const admin: AdminApiLike = {
    async createUser(attrs) {
      calls.createUser++;
      if (users.some((u) => u.email === attrs.email)) {
        return { data: { user: null }, error: { code: 'email_exists', message: 'A user with this email address has already been registered' } };
      }
      const user: AdminUser = {
        id: `uid-${nextId++}`,
        email: attrs.email,
        app_metadata: attrs.app_metadata,
        user_metadata: attrs.user_metadata,
      };
      users.push(user);
      return { data: { user }, error: null };
    },
    async updateUserById(id, attrs) {
      calls.updateUserById++;
      const user = users.find((u) => u.id === id);
      if (!user) return { data: { user: null }, error: { message: 'not found' } };
      user.user_metadata = { ...user.user_metadata, ...attrs.user_metadata };
      return { data: { user }, error: null };
    },
    async generateLink({ email }) {
      calls.generateLink++;
      const user = users.find((u) => u.email === email) ?? null;
      if (!user) return { data: { properties: null, user: null }, error: { message: 'user not found' } };
      return { data: { properties: { hashed_token: `hash-for-${user.id}` }, user }, error: null };
    },
  };
  return { admin, users, calls };
}

function deps(fetchFn: typeof fetch, admin: AdminApiLike): Deps {
  return {
    fetchFn,
    admin,
    clientKey: 'client-key',
    clientSecret: CLIENT_SECRET,
    redirectUri: 'pusoynow://auth-callback',
  };
}

async function main() {
  // --- rejection paths -----------------------------------------------------
  console.log('tiktok bridge: rejections');

  const tt = fakeTikTok({});
  const a1 = fakeAdmin();
  ok(
    'a GET is rejected with 405',
    (await handleTikTokAuth(req({ code: 'good-code' }, 'GET'), deps(tt.fetchFn, a1.admin))).status === 405,
  );
  ok('a missing code is a 400', (await handleTikTokAuth(req({}), deps(tt.fetchFn, a1.admin))).status === 400);
  ok('a blank code is a 400', (await handleTikTokAuth(req({ code: '   ' }), deps(tt.fetchFn, a1.admin))).status === 400);
  ok(
    'a non-JSON body is a 400',
    (await handleTikTokAuth(req(undefined), deps(tt.fetchFn, a1.admin))).status === 400,
  );

  // The headline case from the plan: a bad code returns 401.
  const badCode = await handleTikTokAuth(req({ code: 'bad-code' }), deps(tt.fetchFn, a1.admin));
  ok('a bad code returns 401', badCode.status === 401, badCode);
  ok('a bad code creates no user', a1.users.length === 0);

  const httpErr = fakeTikTok({ tokenStatus: 400, tokenBody: { error: 'invalid_request' } });
  ok(
    'a non-2xx token response returns 401',
    (await handleTikTokAuth(req({ code: 'x' }), deps(httpErr.fetchFn, fakeAdmin().admin))).status === 401,
  );

  const netErr = fakeTikTok({ throwOnToken: true });
  ok(
    'a token endpoint that throws returns 401',
    (await handleTikTokAuth(req({ code: 'x' }), deps(netErr.fetchFn, fakeAdmin().admin))).status === 401,
  );

  const noProfile = fakeTikTok({ userStatus: 500 });
  ok(
    'an unreadable profile returns 502',
    (await handleTikTokAuth(req({ code: 'good-code' }), deps(noProfile.fetchFn, fakeAdmin().admin))).status === 502,
  );

  const noOpenId = fakeTikTok({ userBody: { data: { user: { display_name: 'Nobody' } } } });
  ok(
    'a profile with no open_id returns 502',
    (await handleTikTokAuth(req({ code: 'good-code' }), deps(noOpenId.fetchFn, fakeAdmin().admin))).status === 502,
  );

  // --- happy path ----------------------------------------------------------
  console.log('tiktok bridge: first sign-in');

  const good = fakeTikTok({});
  const admin1 = fakeAdmin();
  const first = await handleTikTokAuth(req({ code: 'good-code' }), deps(good.fetchFn, admin1.admin));
  ok('a valid code returns 200', first.status === 200, first);
  ok('exactly one user was created', admin1.users.length === 1);
  ok('the user is keyed on the tiktok open_id', admin1.users[0].email === tiktokEmail(OPEN_ID));
  ok(
    'the user records the provider and open_id',
    admin1.users[0].app_metadata?.provider === 'tiktok' &&
      admin1.users[0].app_metadata?.tiktok_open_id === OPEN_ID,
  );
  ok('the response carries a session token hash', typeof first.body.token_hash === 'string' && first.body.token_hash !== '');
  ok('the response carries the display name', first.body.display_name === 'Dancer');
  ok('the response carries the avatar url', first.body.avatar_url === 'https://tt/a.jpg');
  ok('the token exchange sent the client secret to TikTok, not to the caller', good.seen[0].body!.includes(CLIENT_SECRET));

  // --- no duplicate users on a second login --------------------------------
  console.log('tiktok bridge: second sign-in');

  const second = await handleTikTokAuth(req({ code: 'good-code' }), deps(good.fetchFn, admin1.admin));
  ok('a second login also returns 200', second.status === 200, second);
  ok('a second login creates no duplicate user', admin1.users.length === 1, admin1.users);
  ok('both logins resolve to the same user', first.body.token_hash === second.body.token_hash);
  ok('createUser was attempted twice, and rejected once', admin1.calls.createUser === 2);
  ok('exactly one link was generated per request', admin1.calls.generateLink === 2);
  ok('the returning user had their profile refreshed', admin1.calls.updateUserById === 1);

  // A changed TikTok display name and a rotated avatar URL must land on the row.
  const renamed = fakeTikTok({
    userBody: { data: { user: { open_id: OPEN_ID, display_name: 'Dancer II', avatar_url: 'https://tt/b.jpg' } } },
  });
  await handleTikTokAuth(req({ code: 'good-code' }), deps(renamed.fetchFn, admin1.admin));
  ok('a renamed user keeps one row', admin1.users.length === 1);
  ok('the refreshed name is stored', admin1.users[0].user_metadata?.full_name === 'Dancer II');
  ok('the refreshed avatar is stored', admin1.users[0].user_metadata?.avatar_url === 'https://tt/b.jpg');

  // --- a hard create failure is not mistaken for a duplicate ---------------
  console.log('tiktok bridge: failures');

  const brokenAdmin = fakeAdmin();
  brokenAdmin.admin.createUser = async () => ({ data: { user: null }, error: { message: 'database is on fire' } });
  ok(
    'a real create failure returns 500, not a session',
    (await handleTikTokAuth(req({ code: 'good-code' }), deps(fakeTikTok({}).fetchFn, brokenAdmin.admin))).status === 500,
  );

  const noLink = fakeAdmin();
  noLink.admin.generateLink = async () => ({ data: { properties: null, user: null }, error: { message: 'nope' } });
  ok(
    'a failure to mint the session returns 500',
    (await handleTikTokAuth(req({ code: 'good-code' }), deps(fakeTikTok({}).fetchFn, noLink.admin))).status === 500,
  );

  // --- secrets never leave ---------------------------------------------------
  console.log('tiktok bridge: secrets stay server-side');

  const leakTT = fakeTikTok({});
  const leakAdmin = fakeAdmin();
  const responses = [
    await handleTikTokAuth(req({ code: 'good-code' }), deps(leakTT.fetchFn, leakAdmin.admin)),
    await handleTikTokAuth(req({ code: 'bad-code' }), deps(leakTT.fetchFn, leakAdmin.admin)),
    await handleTikTokAuth(req({}), deps(leakTT.fetchFn, leakAdmin.admin)),
  ];
  const serialized = JSON.stringify(responses);
  ok('no response body contains the TikTok client secret', !serialized.includes(CLIENT_SECRET));
  ok('no response body contains the service-role key', !serialized.includes(SERVICE_ROLE_KEY));
  ok('no response body contains the TikTok access token', !serialized.includes('tok-1'));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

void main();
