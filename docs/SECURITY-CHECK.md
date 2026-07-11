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
