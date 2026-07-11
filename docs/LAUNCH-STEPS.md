# Prends — what you need to do next

Everything in Round 6 is built, deployed, and live on the API (`api.prends.app`)
and the web app (`pusoy-now.pages.dev`). The remaining work is the handful of
things only you can do from your own accounts (dashboards, developer portals,
CLI logins). This is that checklist, in priority order.

Status legend from our last exchange:
1. Cloudflare custom domain — **you want detailed instructions / me to drive it**
2. EAS CLI — **you're on it** (note: the CLI issue is covered below)
3. Apple Sign in — **you're on it, want details** (full walkthrough below)
4. Google Play — **you're on it**
5. Art refresh — **fine as is** (skipped for now)

---

## 1. Point prends.app at the web app (Cloudflare Pages)

Right now the site answers at `pusoy-now.pages.dev`. This step makes
`https://prends.app` serve the same app. The API domain (`api.prends.app`) is
already done — this is only the web front-end.

**Manual steps (about 3 minutes):**

1. Go to https://dash.cloudflare.com and sign in.
2. Left sidebar → **Workers & Pages**.
3. Click the **pusoy-now** project (it has a "Pages" tag).
4. Top tabs → **Custom domains**.
5. Click **Set up a domain**.
6. Type `prends.app` and click **Continue**, then **Activate domain**.
   - Because the `prends.app` zone is already on your Cloudflare account,
     Cloudflare creates the DNS record for you automatically. Do **not** add a
     CNAME by hand first — registering the domain on the project is what makes
     it work (a bare CNAME without this step returns a 522 error).
7. Wait 1–2 minutes for the certificate to issue (the row shows "Active").
8. Also add `www.prends.app` the same way if you want the www version to work
   (optional).

**After it's active, tell me** and I'll:
- flip `TRUSTED_ORIGINS` to include `https://prends.app` (already includes it),
  drop `pages.dev` once you're happy, and re-verify sign-in from the new domain.

### Option: let me drive it in the browser

If you'd rather I do the clicking, you have two paths:

- **Claude-in-Chrome (your real Chrome, already logged into Cloudflare):** open
  the Cloudflare tab yourself so you're signed in, then tell me "drive it" and
  paste this instruction to me:
  > Go to dash.cloudflare.com → Workers & Pages → pusoy-now → Custom domains →
  > Set up a domain → enter prends.app → Continue → Activate domain. Stop and
  > show me before clicking Activate.

  I'll do every step and pause at the final **Activate** so you can confirm.
- **I never type your password.** If a login screen appears, you sign in; I only
  handle the domain-setup clicks.

This is a safe, reversible action (you can remove the custom domain anytime from
the same screen), so either path is fine.

---

## 2. EAS build setup (the "doesn't open in PowerShell" fix)

The `eas` command usually fails in PowerShell for one of two reasons:

- **`eas` is not recognized** after `npm i -g eas-cli` — the npm global bin
  folder isn't on your PATH yet. Two fixes:
  - Close and reopen PowerShell (PATH refreshes), **or**
  - Skip the global install and use `npx` every time:
    ```
    npx eas-cli@latest login
    npx eas-cli@latest init
    npx eas-cli@latest build:configure
    ```
- **`eas login` seems to hang / "doesn't open"** — `eas login` is an
  *in-terminal* prompt (it asks for your Expo email + password right there), not
  a browser popup. Type them into the same PowerShell window. If you prefer a
  browser login, run `npx eas-cli login` and it will give you a link to paste.

Run everything from the project root (`D:\Claude\pusoy-now`). Order:
```
npx eas-cli@latest login            # your Expo account
npx eas-cli@latest init             # links the "prends" project, writes projectId into app.json
npx eas-cli@latest build:configure  # sanity-checks the eas.json already in the repo
npx eas-cli@latest build -p ios --profile preview   # first real build (uses your Apple account)
```

**When `eas init` writes the `projectId` into `app.json`, commit that change**
(or tell me and I'll commit it). After the first Android build, run
`npx eas-cli@latest credentials -p android` and send me the **SHA-256
fingerprint** — I need it to fill the placeholder in `assetlinks.json` so
Android invite links verify.

⚠️ **Back up the Android keystore** the moment EAS generates it
(`credentials -p android` → download). If you lose it before enrolling in Play
App Signing, the app can never be updated again.

---

## 3. Sign in with Apple (Apple Developer portal)

The code is done and dormant — it turns on the moment three secrets exist. You
need to create four things in the Apple portal, mint one token, and set three
secrets. Full JWT-minting script is in
[docs/AUTH-SETUP.md](AUTH-SETUP.md#apple-sign-in-with-apple) — this is the ordered checklist.

**In the Apple Developer portal (https://developer.apple.com/account):**

1. **Team ID** — Membership page (top of the account). Copy the 10-character
   Team ID. Send it to me — it also fills the `TEAMID` placeholder in the
   iOS universal-links file (`apple-app-site-association`).
2. **App ID** — Certificates, Identifiers & Profiles → Identifiers → **+** →
   App IDs → App. Description "Prends", Bundle ID **`app.prends`** (explicit).
   Scroll the capabilities list and check **Sign In with Apple**. Register.
3. **Services ID** — Identifiers → **+** → Services IDs. Description
   "Prends Web", Identifier **`app.prends.web`**. Register it, then click it,
   check **Sign In with Apple** → **Configure**:
   - Primary App ID: `app.prends` (from step 2)
   - Domains: `prends.app`
   - Return URLs: `https://api.prends.app/api/auth/callback/apple`
   - Save.
4. **Key** — Keys → **+**. Name "Prends Sign in with Apple", check
   **Sign In with Apple**, Configure → pick `app.prends`, Save → Register →
   **Download** the `.p8` file (you can only download it once). Note the
   **Key ID** shown on the page.

**Then mint the client secret** (a JWT signed with the .p8). The exact node
script is in [docs/AUTH-SETUP.md](AUTH-SETUP.md#apple-sign-in-with-apple); it needs Team ID,
Key ID, Services ID (`app.prends.web`), and the .p8. It expires in ≤6 months,
so set a calendar reminder to re-mint.

**Then set the three secrets** (from `D:\Claude\pusoy-now\server`):
```
printf '%s' "app.prends.web"    | npx wrangler secret put APPLE_CLIENT_ID
printf '%s' "<the JWT you minted>" | npx wrangler secret put APPLE_CLIENT_SECRET
printf '%s' "app.prends"        | npx wrangler secret put APPLE_APP_BUNDLE_IDENTIFIER
npx wrangler deploy
```

After deploy, `GET https://api.prends.app/api/providers` will list `apple` and
the Apple button appears on iOS + web automatically. Tell me and I'll verify the
web round-trip.

> Note: Google and Facebook login are also still dormant — their secrets were
> never set either. Same pattern (`printf ... | wrangler secret put`) if you
> want them; the buttons already fall back to a static list until then.

---

## 4. Google Play (you're on it)

Quick reference so nothing blocks you:
- $25 one-time developer registration + identity verification (1–2 days).
- **Critical path:** new personal accounts must run a **closed test with 12+
  testers for 14 continuous days** before you can publish to production. Start
  recruiting now — the invite-link multiplayer is a natural way to get testers
  in. This 2-week clock is the single longest lead time to launch.
- New apps must target **API level 35** (Expo SDK 57 already does); 36 becomes
  required for submissions after Aug 31, 2026.
- Fill the **Data Safety** form and declare the account-deletion **web URL** as
  `https://prends.app/delete-account` (the page is already live).

Full runbook with the exact submission commands: [docs/SHIP-NATIVE.md](SHIP-NATIVE.md).

---

## 5. App art (deferred — fine as is)

The logo/splash/icon still show the old "PUSOY NOW" wordmark. The icon itself is
technically store-compliant (no alpha channel), so this is cosmetic, not a
blocker. When you want it refreshed, `scripts/gen_assets.py` regenerates the art
but needs an OpenAI image API key — ping me and I'll run it.

---

## What's already done (for reference)

- ✅ API live at `https://api.prends.app` (custom domain)
- ✅ Web app live at `pusoy-now.pages.dev` (rebranded Prends)
- ✅ Account deletion (in-app + web page), consent capture, privacy/terms pages
- ✅ Universal-links / app-links files deployed (need your Team ID + Android
  fingerprint to fully verify — steps 2 and 3 above provide both)
- ✅ Sign in with Apple code shipped (dormant until step 3's secrets)
- ✅ `eas.json` in the repo (step 2 links the project)
- ✅ Both QA accounts purged from the database

## The two values I need back from you

Once you've done the portal/CLI steps, send me these and I'll finish the wiring:
1. **Apple Team ID** (from step 3.1) → fills `TEAMID` in the iOS links file
2. **Android SHA-256 fingerprint** (from step 2, after first Android build) →
   fills the Android links file

Then Android + iOS invite links will open the app, and I'll redeploy the web
build with both filled in.
