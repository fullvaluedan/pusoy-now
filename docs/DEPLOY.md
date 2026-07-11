# Deploying Pusoy Now to Cloudflare Pages

This runbook walks through shipping the web app to Cloudflare Pages so invite links (`/join/CODE`) are real URLs.

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

## 3. Deploy to Cloudflare Pages

```bash
npx wrangler pages deploy dist --project-name pusoy-now
```

On the first run, this creates the `pusoy-now` Pages project. Subsequent runs upload new builds to the same project.

The Pages URL will be something like `https://pusoy-now.pages.dev`. Make note of the exact URL.

## 4. Configure the Worker to trust the Pages origin

After the Pages URL is known, add it to the auth Worker's trusted origins so cross-origin sign-in cookies and API calls work.

Edit `server/wrangler.toml` and set the `TRUSTED_ORIGINS` var under `[vars]`:

```toml
[vars]
BETTER_AUTH_URL = "https://pusoy-now-auth.fullvaluedan.workers.dev"
TRUSTED_ORIGINS = "https://pusoy-now.pages.dev"
```

Multiple origins are supported (comma-separated):

```toml
TRUSTED_ORIGINS = "https://pusoy-now.pages.dev,https://staging.pages.dev"
```

Note: the Worker's CORS layer (`server/src/index.ts`) and `trustedOriginsFor()` in `server/src/auth.ts` already reflect the `TRUSTED_ORIGINS` env var; no code change is needed.

SameSite=None; Secure cookies are already configured in `authOptions()` for cross-origin use.

Then deploy the Worker:

```bash
cd server
npx wrangler deploy
```

## 5. Point the app at the Worker

The web build reads `EXPO_PUBLIC_AUTH_URL` at export time to configure the auth endpoint. By default it falls back to the deployed Worker URL (`https://pusoy-now-auth.fullvaluedan.workers.dev`), which is correct for production.

To override it (e.g., for a staging Worker), export with:

```bash
EXPO_PUBLIC_AUTH_URL=https://your-worker-url npm run export:web
```

This is handled in `lib/authClient.ts`.

## 6. Verify the deployment

Load `https://pusoy-now.pages.dev` in a browser.

- Sign in to confirm the cross-origin cookies work.
- Open a `/join/CODE` link to confirm the SPA fallback (route handled by the client router, not a 404).
- Verify the room join completes (WebSocket upgrade to the auth Worker).

## Rollback

To revert to a previous build, re-deploy an older version of `dist/`:

```bash
npx wrangler pages deploy dist --project-name pusoy-now
```

Cloudflare Pages keeps a deployment history in the dashboard.
