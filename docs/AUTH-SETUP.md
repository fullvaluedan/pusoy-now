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
