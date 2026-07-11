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

const app = new Hono<{ Bindings: Env }>();

// The web origin to send a checkout return to: the request's Origin if it is
// trusted, else the first configured web origin, else the Worker's own URL.
function webOrigin(env: Env, requestOrigin: string | undefined): string {
  const trusted = trustedOriginsFor(env).filter((o) => o.startsWith('http'));
  if (requestOrigin && trusted.includes(requestOrigin)) return requestOrigin;
  return trusted.find((o) => !o.includes('localhost')) ?? trusted[0] ?? env.BETTER_AUTH_URL ?? '';
}

// Reflect only trusted origins, and only for the auth API. `credentials: true`
// is required for the session cookie to be sent and stored by the browser.
app.use('/api/auth/*', (c, next) => {
  const allowed = trustedOriginsFor(c.env).filter((o) => o.startsWith('http'));
  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : null),
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
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

export default app;
