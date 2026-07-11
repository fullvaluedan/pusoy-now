# Auth setup: social providers and secrets

Accounts run on the Cloudflare auth Worker in `server/` (better-auth on D1),
deployed at:

```
https://pusoy-now-auth.fullvaluedan.workers.dev
```

Email/password works today. Google and Facebook sign-in are wired but stay
disabled until you register an OAuth app with each provider and set its
id/secret as a wrangler secret. The Worker feature-detects: a provider only
appears (and `GET /api/providers` only lists it) once BOTH its id and secret
exist. Until then the client leaves that button unavailable rather than erroring.

All secrets are set with `wrangler secret put NAME` from inside `server/` and
are never committed. After setting or changing a secret, redeploy:
`npm --prefix server run deploy`.

## Redirect URIs (register these exactly)

- Google: `https://pusoy-now-auth.fullvaluedan.workers.dev/api/auth/callback/google`
- Facebook: `https://pusoy-now-auth.fullvaluedan.workers.dev/api/auth/callback/facebook`

The app's own deep-link scheme `pusoynow://` and the web origin are already in
the Worker's `trustedOrigins`; you do not register those with the providers.

## Google

1. Google Cloud Console -> APIs & Services -> Credentials.
2. Create an OAuth 2.0 Client ID, application type "Web application".
3. Under "Authorized redirect URIs" add the Google redirect URI above.
4. Copy the client id and client secret.
5. Set them on the Worker:

```bash
cd server
printf '%s' "<client-id>"     | wrangler secret put GOOGLE_CLIENT_ID
printf '%s' "<client-secret>" | wrangler secret put GOOGLE_CLIENT_SECRET
npm run deploy
```

## Facebook

1. Meta for Developers -> your app (create one if needed) -> add the
   "Facebook Login" product.
2. Facebook Login -> Settings -> "Valid OAuth Redirect URIs": add the Facebook
   redirect URI above.
3. From Settings -> Basic, copy the App ID and App Secret.
4. Set them on the Worker:

```bash
cd server
printf '%s' "<app-id>"     | wrangler secret put FACEBOOK_CLIENT_ID
printf '%s' "<app-secret>" | wrangler secret put FACEBOOK_CLIENT_SECRET
npm run deploy
```

The Worker requests a 400px avatar from Facebook up front, so the picture that
lands on the profile row is already usable-size (no second Graph call). Google
avatars are upscaled by rewriting the size token in the picture URL.

## Apple (Sign in with Apple)

Apple sign-in is wired and feature-detected: it appears only when all THREE
secrets below are set (`APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`,
`APPLE_APP_BUNDLE_IDENTIFIER`). The button shows on iOS (native identity-token
flow) and web (redirect), never on Android. Register everything against the
production API domain `https://api.prends.app` from day one.

### Apple Developer portal steps

1. **App ID** (Certificates, IDs & Profiles -> Identifiers -> App IDs): use or
   create `app.prends` and enable the **Sign In with Apple** capability. This is
   also the value for `APPLE_APP_BUNDLE_IDENTIFIER`.
2. **Services ID** (Identifiers -> Services IDs): create `app.prends.web` — this
   is the OAuth client id for the web/redirect flow (`APPLE_CLIENT_ID`). Enable
   Sign In with Apple on it and configure:
   - **Domains and Subdomains:** `prends.app`
   - **Return URLs:** `https://api.prends.app/api/auth/callback/apple`
3. **Key** (Keys -> +): create a key with **Sign In with Apple** enabled, tie it
   to the `app.prends` App ID, and **download the `.p8` once** (it cannot be
   re-downloaded). Note the **Key ID** and your **Team ID** (top-right of the
   portal).

### Minting the client-secret JWT (`APPLE_CLIENT_SECRET`)

Apple's "client secret" is an ES256 JWT you sign with the `.p8` key. It expires
in at most 6 months, so it must be re-minted before then (see rotation note).

```js
// mint-apple-secret.mjs — run with: node mint-apple-secret.mjs
// npm i jose
import { SignJWT, importPKCS8 } from 'jose';
import { readFileSync } from 'node:fs';

const TEAM_ID = 'XXXXXXXXXX';          // Apple Team ID
const KEY_ID = 'YYYYYYYYYY';           // the .p8 Key ID
const SERVICES_ID = 'app.prends.web';  // the Services ID (== APPLE_CLIENT_ID)
const p8 = readFileSync('./AuthKey_YYYYYYYYYY.p8', 'utf8');

const now = Math.floor(Date.now() / 1000);
const key = await importPKCS8(p8, 'ES256');
const jwt = await new SignJWT({})
  .setProtectedHeader({ alg: 'ES256', kid: KEY_ID })
  .setIssuer(TEAM_ID)                  // iss = Team ID
  .setSubject(SERVICES_ID)             // sub = Services ID
  .setAudience('https://appleid.apple.com')
  .setIssuedAt(now)
  .setExpirationTime(now + 60 * 60 * 24 * 180) // <= 6 months
  .sign(key);
console.log(jwt);
```

### Set the secrets

```bash
cd server
printf '%s' "app.prends.web" | wrangler secret put APPLE_CLIENT_ID
printf '%s' "<the-ES256-JWT>" | wrangler secret put APPLE_CLIENT_SECRET
printf '%s' "app.prends"     | wrangler secret put APPLE_APP_BUNDLE_IDENTIFIER
npm run deploy
```

`APPLE_APP_BUNDLE_IDENTIFIER` is load-bearing: better-auth uses it to verify the
native iOS identity token (whose audience is the bundle id). Without it native
sign-in fails with "Invalid id token".

Apple only returns the email/name on the **first** authorization for a user;
later sign-ins carry the stable `sub` only, so the profile name is captured on
that first grant. Users who choose "Hide My Email" get a private relay address.

### Rotation reminder

`APPLE_CLIENT_SECRET` (the ES256 JWT) expires at most 6 months after it is
minted. **Re-mint it and `wrangler secret put APPLE_CLIENT_SECRET` before the
expiry**, or Apple sign-in silently starts failing. Set a calendar reminder for
~5 months out. The `.p8` key itself does not expire — keep it backed up.

## TikTok (deferred)

TikTok is not a better-auth social provider; it needs its own Login Kit bridge
and developer-app approval. The button stays behind a coming-soon flag until
that bridge is ported to the Worker.

## Other secrets (related prerequisites)

Set the same way (`wrangler secret put`), each optional until you need it:

- `BETTER_AUTH_SECRET` (required, already set) - session/token signing.
- `RESEND_API_KEY` + `EMAIL_FROM` - real verification/reset emails. Until set,
  the Worker logs the link (dev-mailbox mode).
- `TURNSTILE_SECRET_KEY` - turns on the captcha on sign-up/sign-in/reset.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` - the
  $9.99/year web checkout. Until set, the money endpoints report "not
  configured".

## Verifying

```bash
# Which providers are live right now:
curl https://pusoy-now-auth.fullvaluedan.workers.dev/api/providers
```

Once a provider's secrets are set and deployed, its id appears in that list and
its sign-in button becomes available. Live OAuth can only be tested after the
provider app is registered, which is why it is deferred to this manual step.
