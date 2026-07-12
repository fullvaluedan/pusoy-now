// Auth Worker entrypoint: Hono app mounting better-auth at /api/auth/*.
//
// Everything auth-related is delegated to better-auth's handler. The only
// bespoke route is a health check so deploys and uptime probes have a cheap,
// unauthenticated 200 to hit. CORS is registered before the auth routes and
// reflects any trusted origin with credentials, since the app talks to this
// Worker cross-site with session cookies.

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { makeAuth, trustedOriginsFor, type Env } from './auth';
import { d1Store, isPremium, processStripeEvent, requireUserId } from './entitlements';
import { constructEvent, createCheckout, stripeConfigured } from './stripe';
import { configuredProviderIds } from './social';
import { checkUsername, claimUsername, d1ProfileStore, usernameErrorMessage } from './profile';
import { d1ConsentStore, getConsent, recordConsent } from './consent';
import { appleRevocationHook, d1DeletionStore, deleteAccount, type AppleRevocationEnv } from './deletion';
import {
  acceptRequest,
  d1FriendStore,
  declineRequest,
  fetchDisplayInfo,
  listFriends,
  rankUsers,
  removeFriend,
  sendRequest,
} from './friends';
import { d1StatsStore, fetchStatsMany, sanitizeTotals, syncStats } from './stats';
import { d1GameResultStore, headToHead } from './gameResults';
import { beat, d1PresenceStore } from './presence';
import { generateRoomCode } from './roomLogic';
import { GameRoom } from './room';
import { Matchmaker } from './matchmaker';

// The DO classes must be exported from the Worker's entrypoint so the runtime
// can instantiate them for the GAME_ROOM and MATCHMAKER bindings.
export { GameRoom, Matchmaker };

const app = new Hono<{ Bindings: Env }>();

// The web origin to send a checkout return to: the request's Origin if it is
// trusted, else the first configured web origin, else the Worker's own URL.
function webOrigin(env: Env, requestOrigin: string | undefined): string {
  const trusted = trustedOriginsFor(env).filter((o) => o.startsWith('http'));
  if (requestOrigin && trusted.includes(requestOrigin)) return requestOrigin;
  return trusted.find((o) => !o.includes('localhost')) ?? trusted[0] ?? env.BETTER_AUTH_URL ?? '';
}

// Reflect only trusted origins across the whole API (auth AND the custom
// friends/rooms/profile/stats routes) since the app calls all of them
// cross-site with the session cookie. `credentials: true` is required for the
// browser to send and store that cookie. Scoping this to only /api/auth/*
// left the custom routes without CORS headers, so the browser blocked them
// from any web origin.
app.use('/api/*', (c, next) => {
  const allowed = trustedOriginsFor(c.env).filter((o) => o.startsWith('http'));
  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : null),
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
    credentials: true,
  })(c, next);
});

// Cheap unauthenticated liveness probe. Names the service and reports whether
// the D1 binding is present so a broken deploy is obvious from the response.
app.get('/', (c) => c.json({ service: 'pusoy-now-auth', ok: true, db: Boolean(c.env.DB) }));
app.get('/health', (c) => c.json({ ok: true }));

// Which social providers are fully configured, so the client can show only the
// buttons that will work (and leave the rest disabled) without guessing.
app.get('/api/providers', (c) => c.json({ providers: configuredProviderIds(c.env) }));

// better-auth owns sign-up / sign-in / verify / reset / callbacks under this
// prefix. Built per request because the D1 binding lives on env.
app.on(['GET', 'POST'], '/api/auth/*', (c) => makeAuth(c.env).handler(c.req.raw));

// --- Entitlements + Stripe (U5) -------------------------------------------

// The client reads this on auth load to know free vs premium. Session-gated.
app.get('/api/entitlement', async (c) => {
  const userId = await requireUserId(c.env, c.req.raw.headers);
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const until = await d1Store(c.env.DB).getPremiumUntil(userId);
  return c.json({ premium: isPremium(until, Date.now()), premiumUntil: until });
});

// Create a Stripe Checkout Session for the yearly no-ads offer (web only).
app.post('/api/stripe/checkout', async (c) => {
  if (!stripeConfigured(c.env)) return c.json({ error: 'not configured' }, 503);
  const userId = await requireUserId(c.env, c.req.raw.headers);
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const session = await makeAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  try {
    const url = await createCheckout(c.env, {
      userId,
      email: session?.user?.email,
      origin: webOrigin(c.env, c.req.header('origin')),
    });
    return c.json({ url });
  } catch (e) {
    return c.json({ error: 'checkout failed', message: (e as Error).message }, 502);
  }
});

// Stripe calls this. Verify the signature, then flip the entitlement exactly
// once (idempotent on retry). The raw body is required for verification, so it
// is read as text and never parsed before the signature check.
app.post('/api/stripe/webhook', async (c) => {
  if (!stripeConfigured(c.env) || !c.env.STRIPE_WEBHOOK_SECRET) {
    return c.json({ error: 'not configured' }, 503);
  }
  const signature = c.req.header('stripe-signature');
  if (!signature) return c.json({ error: 'missing signature' }, 400);

  const payload = await c.req.text();
  let event;
  try {
    event = await constructEvent(c.env, payload, signature);
  } catch {
    return c.json({ error: 'bad signature' }, 400);
  }

  const { applied } = await processStripeEvent(d1Store(c.env.DB), event, Date.now());
  return c.json({ received: true, applied });
});

// --- Usernames (U3) --------------------------------------------------------

// The caller's own profile: their claimed username, or null if unclaimed (the
// app then prompts them to claim one on the Profile screen). Session-gated.
app.get('/api/profile', async (c) => {
  const userId = await requireUserId(c.env, c.req.raw.headers);
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const row = await d1ProfileStore(c.env.DB).getByUserId(userId);
  return c.json({ username: row?.username ?? null });
});

// Inline availability check for the claim field. Session-gated so username
// existence is not enumerable by anonymous callers.
app.get('/api/username/check', async (c) => {
  const userId = await requireUserId(c.env, c.req.raw.headers);
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const raw = c.req.query('u') ?? '';
  const res = await checkUsername(d1ProfileStore(c.env.DB), raw);
  if (res.status === 'invalid') {
    return c.json({ available: false, reason: res.reason, message: usernameErrorMessage(res.reason) });
  }
  return c.json({ available: res.status === 'available' });
});

// Claim a username (once; rename is deferred). Session-gated.
app.post('/api/username/claim', async (c) => {
  const userId = await requireUserId(c.env, c.req.raw.headers);
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const body = (await c.req.json().catch(() => ({}))) as { username?: unknown };
  const raw = typeof body.username === 'string' ? body.username : '';
  const res = await claimUsername(d1ProfileStore(c.env.DB), userId, raw, Date.now());
  if (res.status === 'invalid') {
    return c.json({ error: 'invalid', reason: res.reason, message: usernameErrorMessage(res.reason) }, 400);
  }
  if (res.status === 'taken') {
    return c.json({ error: 'taken', message: 'That username is taken.' }, 409);
  }
  if (res.status === 'already-claimed') {
    return c.json({ error: 'already-claimed', username: res.username, message: 'You already have a username.' }, 409);
  }
  return c.json({ username: res.username });
});

// --- Marketing email consent (U3, Round 6) ----------------------------------

// The caller's current consent choice, or null if they have never recorded
// one. The client uses null to decide whether to show the post-sign-in
// prompt (home, for social-login users who skip the signup checkbox).
// Session-gated.
app.get('/api/consent', async (c) => {
  const userId = await requireUserId(c.env, c.req.raw.headers);
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const row = await getConsent(d1ConsentStore(c.env.DB), userId);
  return c.json({ consent: row });
});

// Record (or update) the caller's marketing email consent choice. One row per
// user; re-submitting overwrites it rather than piling up history. Session-gated.
app.post('/api/consent', async (c) => {
  const userId = await requireUserId(c.env, c.req.raw.headers);
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const body = (await c.req.json().catch(() => ({}))) as { optIn?: unknown; source?: unknown };
  const optIn = body.optIn === true;
  const source = typeof body.source === 'string' && body.source.trim() ? body.source.trim() : 'unknown';
  const row = await recordConsent(d1ConsentStore(c.env.DB), userId, optIn, source, Date.now());
  return c.json({ consent: row });
});

// --- Account deletion (U4, Round 6) -----------------------------------------

// Store-compliant, irreversible account deletion. Purges the user row (which
// cascades session/account/entitlement/profile/friendship/stats/consent) plus
// the email-keyed verification rows, and revokes Apple tokens first when the
// account is apple-linked and Apple credentials are configured (best-effort;
// a revocation failure never blocks deletion). Session-gated; the client signs
// out locally after this succeeds. A stale session for an already-deleted user
// resolves to no userId and gets the same 401 as any anonymous caller.
app.delete('/api/account', async (c) => {
  const userId = await requireUserId(c.env, c.req.raw.headers);
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  // Apple secrets (U8) are not on the typed Env yet; read them structurally so
  // revocation stays feature-detected and disabled until they are provisioned.
  const revokeApple = appleRevocationHook(c.env.DB, c.env as unknown as AppleRevocationEnv);
  const res = await deleteAccount(d1DeletionStore(c.env.DB), userId, { revokeApple });
  if (res.status === 'not-found') return c.json({ error: 'not-found' }, 404);
  return c.json({ deleted: true });
});

// --- Friends + ranking (U4) ------------------------------------------------

// Decorate a set of user ids with their display fields (username, name,
// avatar), preserving order. Used by the list and ranking routes.
async function withDisplay(env: Env, ids: string[]) {
  const info = await fetchDisplayInfo(env.DB, ids);
  return ids.map((userId) => {
    const d = info.get(userId);
    return { userId, username: d?.username ?? null, name: d?.name ?? null, image: d?.image ?? null };
  });
}

// The caller's friends, split into accepted / incoming / outgoing, each row
// carrying the other player's display fields. Accepted rows additionally carry
// `h2h: {wins, losses}` - the caller's head-to-head vs that friend from shared
// finished online games (one batched query; friends with no shared games ->
// {0, 0}). Session-gated.
app.get('/api/friends', async (c) => {
  const userId = await requireUserId(c.env, c.req.raw.headers);
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const lists = await listFriends(d1FriendStore(c.env.DB), userId);
  const accepted = await withDisplay(c.env, lists.accepted);
  const h2h = await headToHead(d1GameResultStore(c.env.DB), userId, lists.accepted);
  return c.json({
    accepted: accepted.map((f) => ({ ...f, h2h: h2h[f.userId] ?? { wins: 0, losses: 0 } })),
    incoming: await withDisplay(c.env, lists.incoming),
    outgoing: await withDisplay(c.env, lists.outgoing),
  });
});

// Send a friend request by username. Resolves the handle to a user id first;
// an unknown handle is a 404 so the UI can say "No player with that username".
app.post('/api/friends/request', async (c) => {
  const userId = await requireUserId(c.env, c.req.raw.headers);
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const body = (await c.req.json().catch(() => ({}))) as { username?: unknown };
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  if (!username) return c.json({ error: 'missing-username' }, 400);
  const target = await d1ProfileStore(c.env.DB).getByUsername(username);
  if (!target) return c.json({ error: 'not-found', message: 'No player with that username.' }, 404);
  const outcome = await sendRequest(d1FriendStore(c.env.DB), userId, target.userId, Date.now());
  if (outcome === 'self') return c.json({ error: 'self', message: 'You cannot add yourself.' }, 400);
  return c.json({ outcome });
});

// Accept / decline / remove act on the other player's user id (the client has
// it from the friends lists). Each maps the domain outcome to an HTTP status.
app.post('/api/friends/accept', async (c) => {
  const userId = await requireUserId(c.env, c.req.raw.headers);
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const body = (await c.req.json().catch(() => ({}))) as { userId?: unknown };
  const other = typeof body.userId === 'string' ? body.userId : '';
  const outcome = await acceptRequest(d1FriendStore(c.env.DB), userId, other, Date.now());
  if (outcome === 'not-found') return c.json({ error: 'not-found' }, 404);
  if (outcome === 'forbidden') return c.json({ error: 'forbidden' }, 403);
  return c.json({ outcome });
});

app.post('/api/friends/decline', async (c) => {
  const userId = await requireUserId(c.env, c.req.raw.headers);
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const body = (await c.req.json().catch(() => ({}))) as { userId?: unknown };
  const other = typeof body.userId === 'string' ? body.userId : '';
  const outcome = await declineRequest(d1FriendStore(c.env.DB), userId, other);
  if (outcome === 'not-found') return c.json({ error: 'not-found' }, 404);
  if (outcome === 'forbidden') return c.json({ error: 'forbidden' }, 403);
  return c.json({ outcome });
});

app.post('/api/friends/remove', async (c) => {
  const userId = await requireUserId(c.env, c.req.raw.headers);
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const body = (await c.req.json().catch(() => ({}))) as { userId?: unknown };
  const other = typeof body.userId === 'string' ? body.userId : '';
  const outcome = await removeFriend(d1FriendStore(c.env.DB), userId, other);
  if (outcome === 'not-found') return c.json({ error: 'not-found' }, 404);
  return c.json({ outcome });
});

// You plus your accepted friends, ranked by total 1st-place finishes (win-rate
// tiebreak). Your own row is flagged so the UI can highlight it. Session-gated.
app.get('/api/friends/ranking', async (c) => {
  const userId = await requireUserId(c.env, c.req.raw.headers);
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const lists = await listFriends(d1FriendStore(c.env.DB), userId);
  const ids = [userId, ...lists.accepted];
  const stats = await fetchStatsMany(c.env.DB, ids);
  const display = await fetchDisplayInfo(c.env.DB, ids);
  const ranked = rankUsers(ids, stats).map((e) => {
    const d = display.get(e.userId);
    return {
      userId: e.userId,
      username: d?.username ?? null,
      name: d?.name ?? null,
      image: d?.image ?? null,
      firsts: e.firsts,
      games: e.games,
      winRate: e.winRate,
      isSelf: e.userId === userId,
    };
  });
  return c.json({ ranking: ranked });
});

// --- Stats sync (U6 data / R6, R14) ----------------------------------------

// Read the caller's cumulative totals. Session-gated.
app.get('/api/stats', async (c) => {
  const userId = await requireUserId(c.env, c.req.raw.headers);
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const totals = await d1StatsStore(c.env.DB).get(userId);
  return c.json({ totals: totals ?? { games: 0, firsts: 0, seconds: 0, thirds: 0, fourths: 0 } });
});

// Push updated cumulative totals for a signed-in user. Monotonic: a stale or
// forged lower total is accepted with `applied: false` and ignored. Guests
// (no session) are rejected, so guest stats stay local-only.
app.post('/api/stats/sync', async (c) => {
  const userId = await requireUserId(c.env, c.req.raw.headers);
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json().catch(() => ({}));
  const next = sanitizeTotals(body);
  const res = await syncStats(d1StatsStore(c.env.DB), userId, next, Date.now());
  return c.json(res);
});

// --- Presence (Round 7 U5) ---------------------------------------------------

// Public heartbeat: guests must count before any session exists, so this
// route never gates on requireUserId. One round trip both records this
// device as active and returns the live 90s-window count. 400 on a
// malformed device id.
app.post('/api/presence/beat', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { deviceId?: unknown };
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';
  const res = await beat(d1PresenceStore(c.env.DB), deviceId, Date.now());
  if (res.status === 'invalid') return c.json({ error: 'invalid-device-id' }, 400);
  return c.json({ count: res.count });
});

// --- Online rooms (U7) -----------------------------------------------------

// Create a room. The caller becomes the host at seat 0; seats (2-4) and the bot
// difficulty for unfilled seats are chosen now. Returns the code plus a public
// web link (Pages origin) and an app deep link. Session-gated.
app.post('/api/rooms', async (c) => {
  const userId = await requireUserId(c.env, c.req.raw.headers);
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const body = (await c.req.json().catch(() => ({}))) as { seats?: unknown; botLevel?: unknown };
  const seats = Math.max(2, Math.min(4, Math.floor(Number(body.seats) || 4)));
  const botLevel = body.botLevel === 'easy' || body.botLevel === 'expert' ? body.botLevel : 'normal';
  const code = generateRoomCode();
  await c.env.GAME_ROOM.getByName(code).create(code, seats, userId, botLevel);
  const origin = webOrigin(c.env, c.req.header('origin'));
  return c.json({
    code,
    link: `${origin}/join/${code}`,
    deepLink: `prends://join/${code}`,
  });
});

// Lobby info for a room (no hands). Session-gated. A missing room is 404.
app.get('/api/rooms/:code', async (c) => {
  const userId = await requireUserId(c.env, c.req.raw.headers);
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const code = c.req.param('code').toUpperCase();
  const info = await c.env.GAME_ROOM.getByName(code).info();
  if (!info.code) return c.json({ error: 'not-found' }, 404);
  return c.json(info);
});

// WebSocket upgrade into a room. The session is validated here (unauthenticated
// upgrades are rejected before reaching the DO), then the request is forwarded
// to the room DO with the resolved identity injected as trusted headers.
app.get('/api/rooms/:code/ws', async (c) => {
  if (c.req.header('upgrade') !== 'websocket') return c.json({ error: 'expected websocket' }, 426);
  const userId = await requireUserId(c.env, c.req.raw.headers);
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const code = c.req.param('code').toUpperCase();
  const profile = await d1ProfileStore(c.env.DB).getByUserId(userId);

  const headers = new Headers(c.req.raw.headers);
  headers.set('X-User-Id', userId);
  headers.set('X-Username', profile?.username ?? '');
  const forwarded = new Request(c.req.raw.url, {
    method: c.req.raw.method,
    headers,
    body: c.req.raw.body,
  });
  return c.env.GAME_ROOM.getByName(code).fetch(forwarded);
});

// --- Matchmaking (U3) ------------------------------------------------------

// WebSocket upgrade into the quick-match queue. Session-gated exactly like the
// rooms WS route: the session is validated here (unauthenticated upgrades are
// rejected before reaching the DO), then forwarded to the singleton Matchmaker
// with the resolved identity injected as trusted headers. The username falls
// back to the session name so guests (no claimed profile username) still carry
// a display name into the match.
app.get('/api/matchmaking/ws', async (c) => {
  if (c.req.header('upgrade') !== 'websocket') return c.json({ error: 'expected websocket' }, 426);
  const session = await makeAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  const userId = session?.user?.id;
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const profile = await d1ProfileStore(c.env.DB).getByUserId(userId);
  const username = profile?.username ?? session.user?.name ?? '';

  const headers = new Headers(c.req.raw.headers);
  headers.set('X-User-Id', userId);
  headers.set('X-Username', username);
  const forwarded = new Request(c.req.raw.url, {
    method: c.req.raw.method,
    headers,
    body: c.req.raw.body,
  });
  return c.env.MATCHMAKER.getByName('global').fetch(forwarded);
});

export default app;
