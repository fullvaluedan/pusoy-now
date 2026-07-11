# Security check results — auth Worker (pusoy-now-auth)

Live tests against the deployed Worker on Cloudflare (D1-backed), run by the
orchestrating session. Date: 2026-07-11. Worker version at test time: U2
(email accounts end to end).

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Sign-up creates unverified account | PASS | `emailVerified:false`, `token:null` in sign-up response |
| 2 | Sign-in blocked before verification | PASS | `EMAIL_NOT_VERIFIED` error |
| 3 | Verification email issued (dev mailbox) | PASS | verify URL captured from worker log |
| 4 | Verify link flips the flag (302) and sign-in succeeds | PASS | session token returned post-verify |
| 5 | No user enumeration | PASS | wrong-password and nonexistent-user return byte-identical `INVALID_EMAIL_OR_PASSWORD` |
| 6 | Rate limiting on sign-in | PASS | burst of 12: `401 401 401` then nine `429` |
| 7 | Forged Origin rejected | PASS | `evil.example.com` origin returns 403 `INVALID_ORIGIN` |
| 8 | No secrets in client bundle | PASS | client references only `EXPO_PUBLIC_AUTH_URL` (public); no `sk_`/`whsec_`/`_SECRET`/`CLIENT_SECRET`/`BETTER_AUTH_SECRET` strings in lib/app/components |
| 9 | Turnstile captcha on signup/signin/reset | PENDING | enforced once TURNSTILE_SECRET_KEY secret is set (feature-detected until then) |
| 10 | Stripe webhook signature verification | PENDING | test at U5 |
| 11 | Session expiry / refresh configured | PENDING | verify config + cookie attributes at U8 |

| 12 | Live email sign-in from the real app UI | PASS | signed in as QA account from `/sign-in`; `get-session` returns the user with credentials:include; home shows signed-in chip |

Notes:
- Verification currently uses dev-mailbox mode (URL logged, not emailed).
  Flips to real email the moment `RESEND_API_KEY` is set as a wrangler secret.
- QA account created during testing: `pusoy.qa.round4@gmail.com` (delete
  before launch).

## Round 5 (friends + online play, live on Pages deploy) — 2026-07-11

Worker: pusoy-now-auth (D1 + GameRoom Durable Object). Web: https://pusoy-now.pages.dev.

| # | Check | Result | Evidence |
|---|---|---|---|
| 13 | Custom /api routes reachable cross-origin | PASS (after fix) | CORS was scoped to /api/auth/* only; widened to /api/*; providers/friends now return ACAO for the Pages origin |
| 14 | Cross-origin auth on the Pages deploy | PASS | signed in on pages.dev, session persists to workers.dev (SameSite=None cookie) |
| 15 | Remote D1 has the social schema | PASS (after fix) | 0003/0004 migrations were unapplied on remote D1 (username claim 500); applied, claim/friends/ranking now 200 |
| 16 | Username claim / friends / ranking live | PASS | claim -> {username}; friends -> empty lists; ranking -> self row, live on the deploy |
| 17 | Room create is session-gated + returns invite link | PASS | unauth create 401; signed-in create -> {code, pages.dev/join/CODE, deep link} |
| 18 | WS/friends IDOR + redaction | PENDING | needs the two-account live game (Browser 2 join) |

Two deploy bugs caught only by live cross-origin testing: CORS route scope, and unapplied remote migrations.

## Round 6 (Prends rebrand + store track, live on api.prends.app) — 2026-07-11

Worker: pusoy-now-auth at https://api.prends.app (workers.dev kept alive for transition). Web: pusoy-now.pages.dev (prends.app custom domain pending dashboard step).

| # | Check | Result | Evidence |
|---|---|---|---|
| 19 | 0005 marketing_consent applied to remote D1 before Worker deploy | PASS | migrations apply -> 0005 OK; no live 500s |
| 20 | api.prends.app custom domain serves the API | PASS | GET /api/providers 200 with ACAO for the pages.dev origin |
| 21 | Consent endpoints session-gated | PASS | anon POST /api/consent 401; signed-in write then read returns {optIn:true, source:"signup"} live |
| 22 | Account deletion end to end | PASS | throwaway account: sign-up -> verify -> sign-in -> DELETE /api/account {deleted:true}; sign-in after delete 401; old session 401 (cascade killed it) |
| 23 | Forged Origin still rejected on the new domain | PASS | evil.example.com origin -> 403 |
| 24 | Web deletion page for Google Data Safety | PASS | prends.app-served /delete-account renders signed-out explanation + sign-in path (checked on pages.dev origin) |
| 25 | AASA + assetlinks served correctly | PASS | /.well-known/apple-app-site-association 200 Content-Type application/json (via _headers); assetlinks.json 200; no redirects |
| 26 | Privacy/terms live | PASS | /privacy and /terms 200 via SPA fallback |
| 27 | QA accounts purged pre-launch | PASS | round4 account admin-deleted in D1; round6 throwaway deleted via the endpoint; user table has no QA rows |
| 28 | Apple sign-in feature detection | PASS (config-off) | /api/providers returns [] until APPLE_* secrets are set; button hidden accordingly |

Still pending: #18 (two-account live game: WS redaction + LEFT TABLE drop-out label), Apple web round-trip + iOS TestFlight flow (needs portal secrets + first build), OAuth redirect re-registration once Google/Facebook credentials are actually provisioned.
