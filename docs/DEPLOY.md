# Deploying Prends to Cloudflare Pages + Workers

This runbook walks through shipping the web app to Cloudflare Pages (at
`prends.app`) and the auth API to the Worker (at `api.prends.app`) so invite
links (`/join/CODE`) are real URLs.

## Domains (U5)

- Web: `https://prends.app` (Cloudflare Pages project `pusoy-now`, custom
  domain). `https://pusoy-now.pages.dev` keeps working during the transition
  — it stays in the Worker's `TRUSTED_ORIGINS` until it is retired.
- API: `https://api.prends.app` (Worker `pusoy-now-auth`, custom domain via
  `routes` in `server/wrangler.toml`). The Worker keeps its original name —
  renaming it would orphan its secrets and Durable Object storage.

**CRITICAL gotcha:** production Pages deploys MUST include `--branch=main`:

```bash
npx wrangler pages deploy dist --project-name pusoy-now --branch=main
```

A deploy without `--branch=main` from a non-`main` branch (e.g. a feature
branch) lands in **Preview**, not Production — it will NOT update
`prends.app` or any other production custom domain, even though the command
succeeds and prints a URL. This bit the team live during this round.

**Pages custom domain dashboard step (operator, one-time):** register
`prends.app` on the `pusoy-now` Pages project in the Cloudflare dashboard
(Pages project -> Custom domains -> Set up a custom domain) *before* pointing
any DNS (CNAME) at it. Adding a bare CNAME record first, before the domain is
registered on the project, causes a 522 (the edge has nowhere to route the
request). The dashboard flow creates the DNS record for you when the domain
is on the same Cloudflare account/zone.

**Worker custom domain requirement:** `api.prends.app` must have NO
pre-existing DNS record before `wrangler deploy` creates the custom domain —
if a record (even an unrelated one) already occupies that hostname, the
custom-domain attachment in `routes` fails. Check the zone first and remove
any stale record.

## 0. Apply D1 migrations to the REMOTE database (do this first)

Migrations run locally for tests but are NOT auto-applied to the deployed D1.
After any new migration lands, run:

```bash
cd server
npx wrangler d1 migrations apply pusoy-now --remote
```

Skipping this makes usernames, friends, ranking, and stats sync return 500 on
the live Worker even though the code is correct (the tables do not exist yet).

## 1. Build the static web export

```bash
npm run export:web
```

This outputs the static site to the `dist/` directory. Expo runs the esbuild bundler and strips platform-specific code.

## 2. Add the SPA fallback before export

The app uses dynamic routes like `/join/CODE`. Cloudflare Pages must serve `index.html` for unknown paths so the client-side router can handle them.

Before running the export, ensure a `public/_redirects` file exists at the root (or create it if missing):

```
/*    /index.html   200
```

Expo automatically copies the `public/` directory into the export output, so this rule ships with the build and enables SPA fallback on Pages.

## 3. Deploy to Cloudflare Pages (production)

```bash
npx wrangler pages deploy dist --project-name pusoy-now --branch=main
```

`--branch=main` is not optional for a production deploy — see the gotcha
above. On the first run this creates the `pusoy-now` Pages project.
Subsequent runs upload new builds to the same project. The default Pages URL
is `https://pusoy-now.pages.dev`; the production custom domain is
`https://prends.app` once the dashboard step above is done.

## 4. Configure the Worker to trust the web origin(s)

The auth Worker's trusted origins must include every web origin that signs
in against it. Edit `server/wrangler.toml` and set `TRUSTED_ORIGINS` and
`BETTER_AUTH_URL` under `[vars]`:

```toml
[vars]
BETTER_AUTH_URL = "https://api.prends.app"
TRUSTED_ORIGINS = "https://prends.app,https://pusoy-now.pages.dev"
```

The `routes` custom-domain entry (also in `server/wrangler.toml`) puts the
Worker itself at `https://api.prends.app`:

```toml
routes = [{ pattern = "api.prends.app", custom_domain = true }]
```

Note: the Worker's CORS layer (`server/src/index.ts`) and `trustedOriginsFor()` in `server/src/auth.ts` already reflect the `TRUSTED_ORIGINS` env var; no code change is needed.

Cookies are `SameSite=None; Secure` in `authOptions()` for now, kept that way
only so the still-cross-site `pusoy-now.pages.dev` origin keeps working
during the transition — see the comment in `server/src/auth.ts` for when to
drop it to `Lax`.

Then deploy the Worker:

```bash
cd server
npx wrangler deploy
```

`api.prends.app` must have no pre-existing DNS record the first time you do
this, or the custom-domain attachment fails.

## 5. Point the app at the Worker

The web build reads `EXPO_PUBLIC_AUTH_URL` at export time to configure the auth endpoint. By default it falls back to the deployed Worker's custom domain (`https://api.prends.app`), which is correct for production.

To override it (e.g., for a staging Worker), export with:

```bash
EXPO_PUBLIC_AUTH_URL=https://your-worker-url npm run export:web
```

This is handled in `lib/authClient.ts`. **The URL bakes in at export time** —
any time the Worker's public URL changes (as it just did, to
`api.prends.app`), the web app must be re-exported (step 1) and redeployed
(step 3) for the change to take effect; simply redeploying the Worker is not
enough.

## 6. Verify the deployment

Load `https://prends.app` (and, during the transition, `https://pusoy-now.pages.dev`) in a browser.

- Sign in to confirm the cookies work on both origins.
- Open a `/join/CODE` link to confirm the SPA fallback (route handled by the client router, not a 404).
- Verify the room join completes (WebSocket upgrade to the auth Worker at `api.prends.app`).
- `curl -sI https://api.prends.app/api/providers` returns 200 with an `Access-Control-Allow-Origin` reflecting `https://prends.app`.

## Email list export

Marketing-email consent is captured per user in the `marketing_consent` table
(signup checkbox, or a one-time post-sign-in prompt for social-login users).
To pull the current opt-in list for a mailing send:

```bash
npx wrangler d1 execute pusoy-now --remote --command "SELECT u.email FROM user u JOIN marketing_consent m ON m.userId = u.id WHERE m.optIn = 1"
```

Only rows with `optIn = 1` are lawful to email; `optIn = 0` rows exist so a
declined prompt is remembered and never asked again.

## Rollback

To revert to a previous build, re-deploy an older version of `dist/` (still
with `--branch=main`, or it lands in Preview instead of rolling back
production):

```bash
npx wrangler pages deploy dist --project-name pusoy-now --branch=main
```

Cloudflare Pages keeps a deployment history in the dashboard.
