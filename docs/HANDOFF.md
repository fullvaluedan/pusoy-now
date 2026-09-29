# Prends — Handoff

Last updated: 2026-07-14. App: Prends (Pusoy Dos), Expo SDK 57 + Cloudflare Worker (better-auth + D1 + Durable Objects). Root: `D:\Claude\pusoy-now`, branch `master`.

This doc is the pick-up point after the post-launch device-feedback + non-gameplay audit round. Read `docs/STORE-SETUP.md` for the store runbook, `docs/AUTH-SETUP.md` for auth secrets/rotation, `docs/DEPLOY.md` for deploy mechanics.

---

## 1. Current status snapshot

**Store launch (Google Play):** App content 11/11 done. App is on the **Closed testing – Alpha** track, 177 countries, testers via the **Google Group `prends-testers@googlegroups.com`** (open-join; public link `https://groups.google.com/g/prends-testers`). Needs **12 distinct testers opted-in for 14 continuous days** before Production unlocks. Play Console under `fullvaluedan@gmail.com` (org "Smarter Futures LLC").

**Latest Android build:** versionCode **3** (`.aab`: https://expo.dev/artifacts/eas/LHJFhac4zAxpqTqUDzx9esf9bsMZuxIoTUOJeT7TAws.aab). Carries: blue-P icon, card-selection clarity, deal-animation safe-area fix. **User must upload this to the Closed testing track** (OS file picker — cannot be automated).

**Apple:** Not started. Need to create the App Store Connect app record + upload the `.ipa` (Transporter or `eas submit`), then TestFlight. Also the Apple **Services ID `app.prends.web`** for web Sign-in-with-Apple still needs creating (native Apple sign-in already works).

**Server (api.prends.app):** live, current version deployed this session (see §2).

**Two blockers still open (user action):**
- `public/.well-known/assetlinks.json` still has `PLACEHOLDER_UPLOAD_KEY_FINGERPRINT`. After the `.aab` is uploaded, get **both SHA-256 fingerprints** (App Signing key + Upload key) from Play Console → App Integrity, send them, then fill + redeploy so Android App Links verify.
- Ads: both the Play "Ads" declaration and the "Advertising ID" declaration are set to **No** (accurate for the current ad-free build). When an ad SDK ships, flip BOTH + update Data Safety BEFORE that build goes live (see `docs/STORE-SETUP.md`).

---

## 2. Shipped this session

**Server (deployed to api.prends.app — helps the CURRENTLY INSTALLED app, no rebuild needed):**
- **Session persistence (root cause of name-churn + flaky online + stat fragmentation):** added the required `@better-auth/expo` **server `expo()` plugin** (`server/src/auth.ts`). The native client sends an `expo-origin` header instead of a browser Origin; without the server plugin to rewrite it, native auth requests weren't treated as the trusted `prends://` origin, so sessions didn't persist — every online action minted a fresh anonymous account. Verified end-to-end (cookie round-trip returns the same user; `updateUser` name-sync works).
- **H1 — reconnect blip no longer abandons a live game** (`server/src/room.ts` `webSocketClose`): added a "still holds another live socket?" guard before flagging disconnect (mirrors `matchmaker.ts`).
- **H2 — leaderboard integrity** (`server/src/stats.ts` `shouldApplyStats`): reject any push where placement buckets sum to more than `games`, and cap per-push bucket growth by games added. Verified live: `{games:5,firsts:1000000}` → `applied:false`.
- **M1 — no localhost trust in production** (`server/src/auth.ts` `trustedOriginsFor`): `DEV_ORIGINS` now included only when `BETTER_AUTH_URL` is unset (i.e. `wrangler dev`).
- **M4 — room share links use the web origin** (`server/src/index.ts` `webOrigin`): exclude `appleid.apple.com` from the fallback so native-created room links are `prends.app/join/CODE`, not `appleid.apple.com/join/CODE`. Verified live.
- **M6 — matchmaker can't double-form a room** (`server/src/matchmaker.ts` `formMatches`): dequeue players synchronously BEFORE the cross-DO `create()` await.

**Client (in Android build v3, pending user upload):**
- App icon → blue P (`assets/art/app-icon.png`).
- Card selection clarity (`components/PlayingCard.tsx` bolder border + lift; `components/table/HandRow.tsx` selected cards zIndex above neighbors).
- Deal-animation vertical shift (`components/DealingAnimation.tsx`): compensate the accumulating fan for the bottom safe-area inset (`insets.bottom`). Native-only effect; web is inert (verified handBottom unchanged at 734).

**CAVEAT from M1:** local web dev (e.g. Expo web on `localhost:8095`) hitting the PRODUCTION `api.prends.app` will now be CORS-blocked. Use `wrangler dev` (local Worker) for local dev, or temporarily add the origin to the `TRUSTED_ORIGINS` env var. This is intended — prod no longer trusts localhost.

---

## 3. Audit — remaining fixes (prioritized)

From the 5-reviewer non-gameplay audit. The HIGH + several MED server items are already fixed above. Below is what's left, most impactful first. Locations are file:line at time of writing.

### Do next (client — rides the next Android/iOS build)

- **M3 — deletion is incomplete (privacy / store-policy).**
  - Client (`app/delete-account.tsx:56`): after `DELETE /api/account`, clear local device data — `clearStats()` (exists, no caller), settings key, guest-name key, and reset the module-level `cached` in `lib/guest.ts`. Otherwise the next guest session on the device reuses the old name and re-uploads the deleted account's stats onto a new account (contradicts the "permanently deleted" promise).
  - Also wrap the post-delete `signOut()` in its own try/catch (**M9**): today a successful delete followed by a throwing `signOut()` shows "could not delete your account" while the account IS gone.
  - Server (`server/src/deletion.ts:63`): deletion trusts D1 `ON DELETE CASCADE` for `session`/`account`(OAuth tokens!)/`entitlement`/`player_profile`/`friendship`/`player_stats`/`marketing_consent` with no test asserting the child rows are gone. Add a test that asserts zero child rows post-delete, OR delete each child table explicitly in the store.

- **M5 — deep-link room code injected raw into the WS URL** (`lib/onlineConnection.ts:72`, entered via `app/join/[code].tsx`): validate the code against `^[A-Z0-9]{4,8}$` before routing and `encodeURIComponent(code)` in `roomWsUrl`. Server codes are strictly `[ABCDEFGHJKMNPQRSTUVWXYZ23456789]`.

- **M7 — account enumeration on sign-up** (`lib/authForms.ts:79` `interpretSignUp`, surfaced `app/sign-in.tsx:158`): the existing-email error is echoed verbatim. Map it to a generic "Could not create your account. Try signing in or resetting your password." (reset flow is already generic; sign-up leaks the same fact).

- **M10 — stats write race on a win** (`app/game-local.tsx:249`, root `lib/stats.ts:103`): `recordGame()` and `recordWinTime()` fire as two concurrent un-serialized read-modify-writes of the same blob; one clobbers the other. Chain them or serialize all stats writes behind one in-module promise queue.

### Do next (server — deployable anytime, no rebuild)

- **M2 — guest→real merge is non-atomic** (`server/src/linkMerge.ts:68` `mergeOnLink`): several independent D1 writes with no transaction; `mergeOnLinkSafe` catches-and-continues, then better-auth deletes the anon row. A mid-merge failure permanently loses friendships/consent (the client safety-net only re-pushes stats). **Fix approach:** split `mergeOnLink` into (1) a read/plan phase (all reads + friendship dedupe → a `MergePlan {stats?, friendships[], consent?}`) and (2) a single atomic write via a new `LinkMergeStore.applyPlan(newUserId, plan, now)` that maps to `db.batch([...])` in the D1 store; the in-memory test store applies the plan synchronously. Keep `linkMerge.test.ts` green (13 tests). Deferred from this session because it's a store-seam refactor + test update that shouldn't be rushed into a same-day live deploy.

- **M8 — no rate-limiting on custom routes** (`server/src/index.ts:154+`): better-auth's DB limiter covers only `/api/auth/*`. The bespoke routes (`friends/request`, `username/check`, `stats/sync`, `consent`, `presence/beat`, `profile`) have none → username enumeration / floods. Add a shared per-user/per-IP limiter reusing the `rateLimit` D1 table. Also add stricter `customRules` on `/api/auth/sign-in/email`, `/sign-up/email`, `/request-password-reset` (e.g. 5–10/min) — current flat 100/min is a weak brute-force barrier — and confirm the rate-limit key resolves to the client IP on Workers.

- **Defense-in-depth for the new `expo()` plugin:** web CSRF safety now depends on `expo-origin` NOT being in the CORS `allowHeaders` (`server/src/index.ts:77`). Add a regression test asserting `expo-origin` is never in the allow-list. When `pusoy-now.pages.dev` is retired from `TRUSTED_ORIGINS`, flip cookies to `sameSite:'lax'` (`server/src/auth.ts` `advanced.defaultCookieAttributes`, already noted in a comment).

### Lows (batch when convenient)

- Username enumeration via `/api/friends/request` distinct 404 (`server/src/index.ts:328`) — return a generic outcome or claimant-gate + rate-limit.
- `/api/presence/beat` unauth + unthrottled (`server/src/index.ts:423`, `presence.ts`) — inflatable "players online" + table bloat. Rate-limit by IP; prune deterministically.
- Apple sign-in swallows all errors as `cancelled` (`lib/auth.tsx:115`) — return `{status:'error'}` for non-`ERR_REQUEST_CANCELED` codes so failures aren't silent.
- Friends/leaderboard errors render as empty-state (`lib/friends.ts:58`) — distinguish error (`null`) from empty; show retry.
- Finished-room DO re-arms its alarm hourly forever if a socket stays open (`server/src/room.ts:313`) — clean up finished rooms after a grace period regardless of `anyConnected`.
- Matchmade-room join not restricted to `expectedUserIds` (`server/src/roomLogic.ts:181` + ws route) — negligible (unguessable code space); optionally reject non-expected users.
- Checkout 502 leaks the raw Stripe/internal error message (`server/src/index.ts:122`) — return a static message, log detail server-side.
- Unbounded consent `source` string (`server/src/index.ts:259`) — cap length (≤64) / whitelist.
- `eas.json` `submit.production` empty — populate `android` (serviceAccountKeyPath, track) + `ios` (ascAppId, appleTeamId `AR885BVBSK`) if/when using `eas submit` (manual upload unaffected).
- AASA has a redundant legacy entry (`public/.well-known/apple-app-site-association`) — keep only the modern `appIDs`+`components` entry.
- No explicit `android.permissions: []` allowlist in `app.json` — add it and verify the prebuilt `AndroidManifest.xml` before submit so no auto-linked permission surprises the Play Data-Safety declaration.

### Verified CLEAN (no action)
No SQL injection (all parameterized). Friends accept/decline IDOR guards correct. Session-gating on all state-changers. Stripe webhook signature-verified + idempotent. Username moderation holds (doubled-letter evasions still blocked; only accepted misses are mid-handle short roots like "assface"). **No ads/tracking/analytics SDK, no advertising ID, no hardcoded secrets** — `AdBanner.tsx` is a pure placeholder; matches the store Data-Safety declaration. Bundle-id/scheme/`.well-known` consistent (`app.prends`, `AR885BVBSK.app.prends`). `ITSAppUsesNonExemptEncryption:false` correct. Deal-overlay + all-disconnected livelock fixes still hold. Server-side seat/identity trust boundaries sound (seat derived from authed userId; `X-User-Id`/`X-Username` overwritten server-side; `applyAction` rejects cards not in hand).

---

## 4. Operational reference

- **Deploy Worker:** `cd server && npx wrangler deploy` (wrangler is authed locally). Prod env has `BETTER_AUTH_URL=https://api.prends.app`, `TRUSTED_ORIGINS=https://prends.app,https://pusoy-now.pages.dev`.
- **Server tests:** `cd server && npm test` (tsx suites; all green as of this session). Typecheck: `npx tsc --noEmit`.
- **Android build:** `eas build --platform android --profile production` (auto-increments versionCode; owner `fullvaluedan`, EAS projectId `5978af40-b62c-42c0-ba9b-e4ccfe9e45a3`). iOS: same with `--platform ios`.
- **App typecheck:** `npx tsc --noEmit` from root.
- **Quick live server checks:** `curl https://api.prends.app/api/providers` → `{"providers":["google","facebook","apple"]}`. For session-gated checks, POST `/api/auth/sign-in/anonymous` with header `expo-origin: prends://` to get a cookie (simulates native).
- **Read `AGENTS.md`:** Expo SDK 57 — read the versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing native code. **No em dashes** in any user-facing copy (project rule).
