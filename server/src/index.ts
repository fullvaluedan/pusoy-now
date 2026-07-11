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

const app = new Hono<{ Bindings: Env }>();

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

// better-auth owns sign-up / sign-in / verify / reset / callbacks under this
// prefix. Built per request because the D1 binding lives on env.
app.on(['GET', 'POST'], '/api/auth/*', (c) => makeAuth(c.env).handler(c.req.raw));

export default app;
