# Prends store setup runbook (iOS + Android)

Every value here is exact and copy-paste ready. Where a field is your choice, it says so.

## Canonical facts (never change these once submitted)

| Field | Value |
|---|---|
| App name | Prends |
| Android package name | app.prends |
| iOS bundle ID | app.prends |
| Marketing / display version | 1.0.0 |
| Android versionCode / iOS build number | 2 |
| EAS project | @fullvaluedan/prends (id 5978af40-b62c-42c0-ba9b-e4ccfe9e45a3) |
| Apple Team ID | AR885BVBSK |
| Apple Sign-in Key ID | M9DB6CL6HK |
| Android app bundle (.aab) | https://expo.dev/artifacts/eas/ByD7NkdXCkBFEoBo8XXOPGrPA-RUO_Tkqyomq5ue2bQ.aab |
| iOS app (.ipa) | https://expo.dev/artifacts/eas/zi5rT_Dwucnx-79H3yq1PlQVMsw8wZTD6WH-C8kS31o.ipa |
| Privacy policy URL | https://prends.app/privacy |
| Terms of service URL | https://prends.app/terms |
| Account deletion URL | https://prends.app/delete-account |
| Support email | danreola@gmail.com |
| Website | https://prends.app |
| Category | Games > Card |

The `.aab`/`.ipa` above are versionCode/build 2. Every future EAS build auto-increments (3, 4, ...); always upload the newest artifact.

---

## What data the app collects (both privacy forms use this)

Collected:
- Email address (account sign-up and Google / Facebook / Apple sign-in) - account management, linked to the user, NOT shared, NOT used for tracking.
- Name / username (display name shown at the table) - app functionality, linked to user.
- Profile photo URL (only if you sign in with Google / Facebook and it carries one) - app functionality, linked to user.
- Game activity (games played, finishing places, best win time) - app functionality, linked to user.
- Optional marketing email opt-in (unchecked by default) - the ONLY optional data use.

NOT collected / NOT present IN THE v1 BUILD BEING SUBMITTED: no ads SDK, no analytics, no tracking pixels, no advertising ID (IDFA/GAID), no location, no contacts, no device fingerprinting, no data sold or shared. Account deletion is in-app and at the web URL above.

ADS ARE PLANNED (not in v1). The moment an ad SDK ships in a build, BOTH privacy forms must be updated BEFORE that build goes live: Google Data Safety must declare the advertising ID + any data shared with the ad network; Apple App Privacy must declare "Data used to track you" + the ad identifier + App Tracking Transparency (ATT) prompt if tracking across apps. Do NOT claim "no ads" in the store listing (already removed from STORE-LISTING.md). The v1 declarations below are accurate only while no ad SDK is present.

---

## GOOGLE PLAY CONSOLE (you have the account)

### 1. Create the app
Play Console > All apps > Create app.
- App name: Prends
- Default language: English (United States)
- App or game: Game
- Free or paid: Free
- Declarations: check both (Play policies, US export laws).

### 2. Upload the build (closed testing track, first)
Because this is a newer personal developer account, Google requires a Closed test with 12+ testers running 14 days before you can go to Production. Do this first.
- Test and release > Testing > Closed testing > Create track (or use the default "Alpha").
- Create new release > upload the `.aab` from the table above.
- Google will show "App signing by Google Play" - accept it (this is what generates the Play App Signing key we need for step 6).
- Release name: 1.0.0 (2). Release notes: "First release of Prends. Play Pusoy Dos vs bots or friends."
- Testers: add a Google Group or email list of 12+ testers (your own + friends' Google accounts). Save.

### 3. Store listing (Main store listing)
- App name: Prends
- Short description (max 80 chars): `Pusoy Dos card game. Play vs smart bots or friends online. Fast, free, no ads.`
- Full description: see STORE-LISTING.md (draft) or write from that.
- App icon: 512x512 PNG (I can export one from assets/art/app-icon.png at that size if you need it).
- Feature graphic: 1024x500 PNG (needed; I can generate).
- Phone screenshots: 2-8, min 1080px. Capture from a real device or the deployed site at phone width.

### 4. Store settings
- App category: Game > Card
- Email: danreola@gmail.com
- Website: https://prends.app
- Privacy policy: https://prends.app/privacy

### 5. Data safety form (Play policy > App content > Data safety)
Answer exactly:
- Does your app collect or share user data? YES (collect only, no sharing).
- Data types:
  - Personal info > Email address: collected, not shared, required, purpose "Account management". Linked to user.
  - Personal info > Name: collected, not shared, required, "App functionality". Linked to user.
  - Photos (profile photo URL, only via social login): collected, not shared, optional, "App functionality". Linked to user. (If simpler, you may omit and instead note under "other" - the photo is a URL from the OAuth provider, not device photos.)
  - App activity > In-app actions (game stats): collected, not shared, "App functionality". Linked to user.
- Is all collected data encrypted in transit? YES (HTTPS).
- Do you provide a way to request data deletion? YES > https://prends.app/delete-account
- No advertising or analytics data types. Do NOT check any advertising/marketing tracking type.

### 6. AFTER the first upload - SEND ME two fingerprints
Play Console > Test and release > Setup > App integrity (or App signing).
Copy BOTH SHA-256 certificate fingerprints and send them to me:
- "App signing key certificate" SHA-256 (the Play App Signing key - the important one)
- "Upload key certificate" SHA-256
I will put both into public/.well-known/assetlinks.json and redeploy so Android App Links (prends.app/join/CODE opening the app) verify.

### 7. Content rating, target audience, ads declaration
- Content rating questionnaire: it's a card game, no violence/gambling-with-real-money. Answer honestly (likely Everyone / PEGI 3). NOTE: Pusoy Dos is a card game but there is NO real-money gambling - be clear on that question or it mis-rates.
- Target audience: 13+ (safe default given accounts/social; avoids the "designed for children" extra rules).
- Ads: declare NO ads (v1 has none).

---

## APPLE APP STORE CONNECT

### 1. Create the app record
appstoreconnect.apple.com > My Apps > + > New App.
- Platform: iOS
- Name: Prends
- Primary language: English (U.S.)
- Bundle ID: app.prends (select it; if it is not listed, create the App ID first at developer.apple.com > Identifiers, WITH the "Sign in with Apple" capability checked)
- SKU: prends-ios-001 (any unique string, your choice)
- User access: Full

### 2. Upload the .ipa
Two ways:
- Easiest now: download the `.ipa`, open Transporter (free Mac app / or the web uploader), sign in, drag the `.ipa`, Deliver.
- Or automated: I can set up `eas submit --platform ios` if you create an App Store Connect API key (Users and Access > Integrations > App Store Connect API > generate key, download the .p8, note Key ID + Issuer ID). Tell me if you want this route.
After upload it appears under TestFlight in ~10-30 min (processing).

### 3. TestFlight
- TestFlight tab > enable internal testing, add yourself + testers.
- First external testing needs a short Beta App Review (usually <1 day).

### 4. App privacy (App Store Connect > App privacy)
Mirror the data list above:
- Data used to track you: NONE.
- Data linked to you: Email address (App functionality + Account), Name (App functionality), User content > photos-or-videos ONLY if you count the social avatar URL (optional; can mark "not collected" since it is a provider URL, your call), Identifiers NONE, Usage data NONE, Contact info = email only.
- Data not linked to you: none.
- Uses no advertising identifier.

### 5. App Store listing
- Subtitle (30 chars): `Pusoy Dos, bots and friends`
- Promotional text / description: see STORE-LISTING.md draft.
- Keywords (100 chars): `pusoy dos,card game,big two,filipino,cards,multiplayer,online cards,bots`
- Support URL: https://prends.app
- Marketing URL (optional): https://prends.app
- Privacy Policy URL: https://prends.app/privacy
- Screenshots: 6.7" and 6.5" iPhone sizes required (I can produce from the deployed app at those pixel sizes).
- Sign in with Apple: because we offer Google/Facebook, Apple requires Sign in with Apple to be present - it IS (native, wired). If review asks, the demo path is: launch > Profile > Sign in > Continue with Apple.

### 6. Review notes (paste into App Review Information)
```
Prends is a Pusoy Dos (Filipino card game, similar to Big Two) app.
- Play solo vs AI bots with no account needed (Guest).
- Sign in (Apple / Google / Facebook / email) to save stats and add friends.
- Quick Match and Private rooms play online vs other people or bot-filled.
- No real-money gambling, no ads, no tracking.
To test online play, use Quick Match on the Home screen; empty seats fill with bots after ~30s.
Account deletion: in-app (Profile > Settings > Delete account) and at https://prends.app/delete-account.
```

---

## Sequencing (fastest path)
1. Play: create app + upload .aab to Closed testing + add 12 testers (starts the 14-day clock - do TODAY). Send me the two SHA-256s.
2. Apple: create app record + Transporter-upload the .ipa + TestFlight.
3. While those process: finish store listings, screenshots, privacy forms, content rating.
4. Create the Apple Services ID app.prends.web (only for website Apple sign-in; not blocking the apps).
5. Submit for review once TestFlight/closed test are healthy.

## What is already done (no action needed)
- Both signed production builds exist (links above).
- Apple sign-in secrets set; native Apple sign-in works.
- iOS universal links (AASA) live with the real Team ID.
- Privacy, terms, and web account-deletion pages live.
- Encryption export compliance declared (no per-build prompt).
