# Shipping Pusoy Now to the App Store and Google Play

Current state: an Expo (SDK 57 / RN 0.86) app that already runs on the web
(Cloudflare Pages) against a Cloudflare Workers + D1 + Durable Objects backend.
Going native means EAS Build/Submit, store accounts, native config, and a set of
compliance items that are **blockers** if skipped. Production domain: `prends.app`
(Cloudflare).

Legend: 🔴 blocker (store will reject without it) · 🟡 needed for launch · 🟢 polish.

---

## Phase 0 — Decisions (do first, everything hangs off these)

- [ ] 🔴 **App name + rebrand.** Domain is `prends.app` but the code/app is
      "Pusoy Now". Decide the store name (e.g. "Prends") and whether to rename in
      code. Touchpoints if rebranding: app title, `app.json` name/slug, splash,
      icon, deep-link scheme (`pusoynow://` → `prends://`), auth email templates,
      the `Pusoy Now - ad space` placeholder.
- [ ] 🔴 **Bundle identifiers** (permanent, cannot change after first submit):
      iOS `bundleIdentifier` and Android `package`. Reverse-DNS of the domain →
      `app.prends` (suggest `app.prends` or `app.prends.game`).
- [ ] 🟡 **One production domain for the API.** Today the app points at
      `pusoy-now-auth.fullvaluedan.workers.dev`. Move it behind
      `api.prends.app` (Cloudflare custom domain on the Worker) so URLs are
      stable and brand-consistent. Update `EXPO_PUBLIC_AUTH_URL`, `TRUSTED_ORIGINS`,
      and better-auth's `BETTER_AUTH_URL`.

## Phase 1 — Store accounts & fees

- [ ] 🔴 **Apple Developer Program** — $99/year. Enroll as individual or the
      LLC/company. 24–48h approval. Needed before any TestFlight/submit.
- [ ] 🔴 **Google Play Developer** — $25 one-time. New accounts now require a
      closed test with 12+ testers for 14 days before you can go to production
      (personal accounts) — start this early, it's a 2-week clock.
- [ ] 🟡 Decide the legal seller entity + support email + physical address
      (required on both listings).

## Phase 2 — Expo / EAS setup

`eas.json` already exists at the repo root (development / preview / production
build profiles + a production submit profile, `appVersionSource: "remote"`).
`app.json` already carries `slug: "prends"`, `ios.bundleIdentifier: "app.prends"`,
and `android.package: "app.prends"` — these are permanent once the first build
links a project, so they must not change after this point. These are operator
steps (interactive login / device auth); run them at the keyboard, not from CI.

- [ ] 🟡 **Install the CLI and log in:**
      ```
      npm i -g eas-cli
      eas login
      ```
      Use (or create) the Expo account that will own the `prends` project.
- [ ] 🟡 **Link the project:**
      ```
      eas init
      ```
      This creates the EAS project for slug `prends` and writes
      `extra.eas.projectId` into `app.json` — do not hand-write that field,
      let `eas init` do it, and commit the resulting `app.json` change.
- [ ] 🟡 **Validate the build config:**
      ```
      eas build:configure
      ```
      Confirms `eas.json` matches the linked project (it already exists in
      this repo, so this step mainly sanity-checks it rather than creating it).
- [ ] 🟡 **Credentials — let EAS manage signing:**
      - iOS: EAS generates/holds the distribution certificate and provisioning
        profile against the Apple Developer account (`eas credentials` to
        inspect/rotate). Requires the Apple Developer Program enrollment from
        Phase 1.
      - Android: EAS generates and stores the upload keystore on first build
        unless one is supplied. **🔴 BACK UP THE KEYSTORE** (`eas credentials`
        → Android → download). Losing it before enrolling in Play App Signing
        means the app can never be updated again — download and store it
        somewhere durable (password manager / offline backup) the moment it's
        generated, before the first Play upload.
- [ ] 🟡 **Run builds per profile** (from the repo root, after the above):
      ```
      eas build -p ios --profile development     # dev client, internal
      eas build -p android --profile development
      eas build -p ios --profile preview          # internal distribution, no store
      eas build -p android --profile preview
      eas build -p ios --profile production       # store-ready, autoIncrement
      eas build -p android --profile production
      ```
      `production` uses `autoIncrement: true` (from `eas.json`), so
      `ios.buildNumber` / `android.versionCode` are never hand-edited or
      committed — EAS bumps them remotely per build.

## Phase 3 — Native features & config plugins

The app uses native modules that need config plugins / native builds (they don't
exist in the web bundle):

- [ ] 🟡 `expo-secure-store` (already used for stats) — fine on native.
- [ ] 🔴 **In-app purchases** — see Phase 5 (this is the big one).
- [ ] 🟡 **Ads (AdMob)** — the current `AdBanner` is a placeholder. Real ads need
      `react-native-google-mobile-ads` + AdMob app IDs (iOS + Android) in the
      config plugin, plus the App Tracking Transparency prompt on iOS
      (`expo-tracking-transparency`).
- [ ] 🟡 **Social login on native** — Google/Facebook OAuth need native redirect
      handling (`expo-auth-session` / `@better-auth/expo`), native client IDs,
      and URL schemes registered. Facebook login requires the FB SDK + app review.
- [ ] 🔴 **Sign in with Apple** — Apple guideline 4.8: if you offer any
      third-party social login (you offer Google/Facebook), you **must** also
      offer Sign in with Apple on iOS. Add `expo-apple-authentication` +
      better-auth Apple provider.

## Phase 4 — Deep links / invite links (prends.app)

Invite links (`/join/CODE`) must open the installed app, not just the web:

- [ ] 🟡 **iOS Universal Links**: host `apple-app-site-association` (JSON, no
      extension) at `https://prends.app/.well-known/apple-app-site-association`;
      add the Associated Domains entitlement (`applinks:prends.app`).
- [ ] 🟡 **Android App Links**: host `assetlinks.json` at
      `https://prends.app/.well-known/assetlinks.json` with the app's SHA-256
      signing fingerprint; add the intent filter + `autoVerify`.
- [ ] 🟢 Both files can be served by a Cloudflare Worker/Pages route. Verify with
      Apple's AASA validator and `adb` App Links verification.

## Phase 5 — Monetization compliance (🔴 the #1 rework)

- [ ] 🔴 **Digital goods must use native IAP.** Apple (3.1.1) and Google both
      **forbid** unlocking in-app features via external payment (your Stripe
      checkout) inside the app. The "$9.99/year, remove ads" entitlement must go
      through **StoreKit (iOS) / Play Billing (Android)**, which take 15–30%.
      - Recommended: **RevenueCat** to wrap both stores + your existing D1
        entitlement. Keep Stripe **only** for the web build.
      - Create the auto-renewing subscription product in App Store Connect and
        Play Console; wire the purchase → server receipt validation → D1
        entitlement (reuse the existing entitlements table; add store receipt
        verification alongside the Stripe webhook).
- [ ] 🟡 Free-game limit (currently dark-launched at 20, unenforced) — decide if
      it gates the paywall, and make sure the paywall offers the IAP, not Stripe,
      on native.
- [ ] 🟡 **Gambling review note.** Pusoy Dos is a real-money game in real life.
      As long as the app has **no real-money wagering and no purchasable chips
      with monetary value**, it's a normal card game. Rate it correctly and don't
      use casino/gambling framing in the listing to avoid reviewer friction.

## Phase 6 — Legal & privacy (🔴 gate review on both stores)

- [ ] 🔴 **Privacy Policy + Terms** hosted at stable URLs (e.g.
      `https://prends.app/privacy`, `/terms`). Required by both stores.
- [ ] 🔴 **In-app account deletion.** Both stores require it if users can create
      accounts (they can, via email). Add a "Delete account" flow (client screen
      + Worker endpoint that purges the user from D1/auth).
- [ ] 🔴 **Apple App Privacy ("nutrition label")** in App Store Connect + Apple
      **privacy manifest** (`PrivacyInfo.xcprivacy`) — declare data collected
      (email, gameplay, ad identifiers) and reasons. Expo scaffolds this; SDKs
      (AdMob) add required-reason API entries.
- [ ] 🔴 **Google Play Data Safety form** — mirror of the above.
- [ ] 🟡 **Age rating / content questionnaire** on both stores.
- [ ] 🟡 If ads + EU users: a consent management platform (UMP/CMP) for GDPR.

## Phase 7 — Store listings (assets)

- [ ] 🟡 iOS screenshots: 6.7" and 6.5" iPhone (required), 12.9" iPad if you ship
      iPad. Android: phone + 7"/10" tablet, plus a 1024×500 feature graphic.
- [ ] 🟡 App icon (already needed in Phase 2), title, subtitle, description,
      keywords, promo text, category (Games → Card).
- [ ] 🟢 Optional preview video.

## Phase 8 — Build, test, submit

- [ ] 🟡 Run the production builds (see Phase 2's build commands):
      `eas build -p ios --profile production` and `-p android --profile production`.

**iOS submission (`eas submit -p ios`)**

- [ ] 🔴 **Prerequisite: an App Store Connect app record.** Create the app in
      App Store Connect (bundle ID `app.prends`, matching name/SKU) *before*
      the first `eas submit` — submit pushes a build to an existing app
      record, it does not create one.
- [ ] 🟡 **Prerequisite: an App Store Connect API key** (or interactive
      Apple ID sign-in). Recommended: generate an API key in App Store
      Connect (Users and Access → Integrations → App Store Connect API) and
      point `eas.json`'s `submit.production.ios` at it (`ascApiKeyPath` /
      `ascApiKeyId` / `ascApiKeyIssuerId`), or let `eas submit` prompt
      interactively the first time and cache the choice.
      `eas.json`'s `submit.production` block is intentionally minimal today —
      fill in `appleId` / `ascAppId` / API key fields once the ASC record and
      key exist.
- [ ] 🟡 `eas submit -p ios` → uploads the build to App Store Connect →
      TestFlight → internal test → submit for review (typically 1–3 days).

**Android submission (`eas submit -p android`)**

- [ ] 🔴 **Prerequisite: the first Play Console upload must be manual.**
      `eas submit` needs an existing app entry in Play Console with at least
      one release track populated; create the app and do the very first APK/AAB
      upload by hand in the Play Console UI, then `eas submit` can handle every
      release after that.
- [ ] 🔴 **Prerequisite: a Google Play service-account JSON key.** Create a
      service account in Google Cloud (linked to the Play Console via
      Setup → API access), grant it release-manager permissions, download the
      JSON key as `play-service-account.json`, keep it **out of git** (already
      covered by `.gitignore`), and point `eas.json`'s
      `submit.production.android.serviceAccountKeyPath` at its local path.
- [ ] 🔴 **The Google Play 12-tester/14-day closed-test clock.** New
      developer accounts must run a closed test with 12+ testers for 14
      continuous days before production access unlocks. Start recruiting
      testers and running the closed test the moment the first build exists —
      this is the schedule-critical path for Android, not the build itself.
- [ ] 🔴 **Target API level.** Google currently requires **target API 35**
      for new submissions/updates. **Target API 36 becomes required for
      submissions after August 31, 2026** — if this ships near or after that
      date, bump `targetSdkVersion` (via the Expo SDK's bundled Android build
      tools / an `expo-build-properties` override) before submitting.
- [ ] 🟡 `eas submit -p android` → internal testing → closed test (12
      testers / 14 days) → production.

- [ ] 🟢 Wire **EAS Update** (OTA) so JS-only fixes ship without a store review.
- [ ] 🟢 Crash/analytics (Sentry via `sentry-expo`, or similar).

---

## Critical-path summary (the things that will actually bite)

1. 🔴 **IAP rework** — Stripe can't unlock features inside the native apps;
   this is real engineering (RevenueCat + store products + receipt validation).
2. 🔴 **Sign in with Apple** — mandatory because Google/Facebook login exists.
3. 🔴 **In-app account deletion** — new endpoint + screen.
4. 🔴 **Privacy policy/terms + privacy manifests + data-safety forms.**
5. 🟡 **Universal Links / App Links** on `prends.app` so invites open the app.
6. 🟡 **Google Play's 14-day closed test** — start the clock early.
7. 🟡 **AdMob** to replace the placeholder banner (only if launching with ads).

Everything else (EAS config, icons, listings) is mechanical once the above are
decided.
