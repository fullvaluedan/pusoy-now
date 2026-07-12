# Prends - AdMob setup runbook

This guide walks you through enabling ads in Prends after the store launch is complete. Ads are post-launch work and only ship once the app is listed on the App Store and Google Play.

## Current state

v1 ships ad-free. The plumbing is in place but dormant:

- **AdBanner component** (`components/AdBanner.tsx`) is a placeholder. It reserves 44px of vertical space and checks the premium entitlement (free players see it, premium players see nothing).
- **Entitlement system** (`lib/entitlements.tsx`, `lib/entitlementRules.ts`) tracks whether a player is premium. The free-game limit config is dark-launched with `enforced: false`, so no gates are active yet.
- **Server endpoint** (`server/src/entitlements.ts`, `GET /api/entitlement`) returns the player's premium status, synced with Stripe webhooks for checkout completions.
- **AdBanner is not rendered** anywhere in the app yet. Step 5 below re-enables it.

## Step 1: Create an AdMob account and register the app

Visit https://admob.google.com and sign in with a Google account that has payment details on file.

1. Click **Create an app** or **Add app**.
2. Register the app twice: once for iOS, once for Android. You need the app to be listed on both stores first (App Store Connect and Google Play Console must have real listings; TestFlight/beta listings work too).
3. For each app, AdMob generates a **Publisher ID** (format `pub-XXXXXXXXXXXX`). Save both Publisher IDs - you'll need them in the next steps.
4. Create ad units for each app. Start with test ad unit IDs so you don't generate impressions against real inventory:
   - One **Banner** ad unit per app (the size Prends uses in AdBanner).
   - Optional: one **Interstitial** ad unit per app if you want transition ads later.
5. Note the **Ad Unit IDs** for each test ad unit. The react-native-google-mobile-ads SDK will reference these.

Do NOT add the app-ads.txt file yet. See Step 2.

## Step 2: Set up app-ads.txt (only after Publisher ID exists)

Once you have the Publisher ID from Step 1, add a file to the web app's public assets:

**File path:** `public/app-ads.txt`

**Content:** (replace `pub-XXXXXXXXXXXX` with your actual Publisher ID)
```
google.com, pub-XXXXXXXXXXXX, DIRECT, f08c47fec0942fa0
```

The domain and ID format must match exactly. AdMob provides the last two values (reseller type and signature); Google's documentation is at https://support.google.com/publishersconsole/answer/3738485.

After you add this file, redeploy the web app to Pages:
```
npm run export:web
wrangler pages deploy
```

The file will be publicly accessible at `https://prends.app/app-ads.txt`. Google crawls it as part of the compliance check when ads are running.

**Important:** Do NOT commit a placeholder app-ads.txt during development. An invalid file is worse than none. Only add it once the Publisher ID is real and verified.

## Step 3: Install the Google Mobile Ads SDK via Expo config plugin

The SDK runs only on native (iOS and Android). The web app serves text/images over the API; the native app renders banner ads locally.

From the `D:\Claude\pusoy-now` project root:

1. Install the SDK package:
   ```
   npm install react-native-google-mobile-ads
   ```

2. Update `app.json` to register the SDK plugin. Find the `plugins` array (or create one) and add:
   ```json
   [
     "react-native-google-mobile-ads",
     {
       "androidAppId": "ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX",
       "iosAppId": "ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX"
     }
   ]
   ```

   Replace the placeholders with the App IDs from your AdMob account (format: `ca-app-pub-...`). You get one App ID per platform.

3. Start with Google's test ad unit IDs so your dev builds don't generate real ad traffic. The SDK provides predefined constants for test environments; use those until you switch to production.

4. Build and deploy a new native binary. Test ads will appear as "Test Banner" placeholders in the app.

   ```
   eas build:configure
   eas build -p ios --profile preview
   eas build -p android --profile preview
   ```

5. Install the preview build and verify the ad space renders (even as a placeholder).

**If the build fails:** Check that the plugin syntax is valid JSON and that the App IDs match the format from your AdMob account.

## Step 4: iOS App Tracking Transparency (only if you enable personalized ads later)

Personalized ads require explicit user consent on iOS. This step is only needed once you serve ads that are customized per user (behavioral targeting, etc.). Non-personalized ads do not require this prompt.

If you want personalized ads in the future:

1. Install the tracking consent library:
   ```
   npx expo install expo-tracking-transparency
   ```

2. Add the required privacy string to `app.json`:
   ```json
   "ios": {
     "infoPlist": {
       "NSUserTrackingUsageDescription": "This app uses your advertising ID to show relevant ads. You can opt out in Settings > Privacy > Tracking."
     }
   }
   ```

3. Call the consent prompt at app startup (or before the first ad loads):
   ```javascript
   import * as TrackingTransparency from 'expo-tracking-transparency';
   
   const status = await TrackingTransparency.requestTrackingPermissionsAsync();
   // status.granted is true if user consents; false otherwise.
   // Pass this to the ad SDK so it knows whether to serve personalized or non-personalized ads.
   ```

4. Update your app privacy labels:
   - **App Store:** In App Privacy label, declare "Identifiers" and "Advertising Data" under "Data Used to Track You".
   - **Google Play:** In the Data Safety form, declare the same under "Advertising".

For now, start with non-personalized ads and skip this step. Revisit it only if user targeting is needed.

## Step 5: Wire the AdBanner component and entitlement gate

Once the SDK is live in a production build, turn on the ads rendering and enforcement:

1. **Re-enable AdBanner rendering** in `app/game-local.tsx`:
   - Import the component: `import { AdBanner, AD_BANNER_HEIGHT } from '../components/AdBanner';`
   - Add it to the layout where reserved space exists (check the component's height constant).
   - It will render only for free players (the component checks `shouldShowAds(premium)` internally).

2. **Enable the free-game limit** in `lib/entitlementRules.ts`:
   - Change `enforced: false` to `enforced: true`.
   - Now `canStartGame` will block players who have completed 20 free games (unless they are premium).
   - Pair this with a paywall screen that offers premium subscription in `app/game-local.tsx` or a dedicated `app/paywall.tsx`.

3. **Optional: add an interstitial ad hook** for transition moments:
   - The function `maybeShowInterstitial()` is stubbed in `game-local.tsx` (or create it).
   - Call it before major navigation (between rounds, after a win, before a ranked match).
   - The SDK method is `interstitialAd.show()` with frequency capping so users don't see an ad every 30 seconds.

4. Redeploy the app and run a full end-to-end test:
   - Verify free players see the ad banner.
   - Verify premium players don't see ads.
   - Verify the game-start gate works if you enable enforcement.
   - Verify interstitials fire at the right moments (if implemented).

5. Once you're satisfied, switch from test ad unit IDs to production ad unit IDs in the SDK config and rebuild.

## Revenue expectations and tuning

Banner ads (the format Prends uses) typically generate low single-digit dollar eCPM (earnings per thousand impressions) for casual games. For a game that sees 1000 impressions per day, expect $2-8/day in ad revenue at scale, though initial revenue is much lower as your publisher account builds history.

To improve revenue, you can:

- **Increase ad frequency:** add interstitial ads between games. However, excessive ads hurt retention; test different cadences (e.g., every 3rd game, after a loss, before ranked play).
- **Target higher-value regions:** AdMob accounts that reach users in the US, UK, and Canada earn more per impression than regions with lower ad budgets.
- **Encourage premium conversion:** a 2-5% premium conversion rate at $2.99/month can exceed ad revenue. Use the free-game limit to create urgency without annoying users.

Keep ad inventory reasonable. The goal is sustainable monetization without degrading the player experience. Monitor the AdMob dashboard weekly once live.

## References

- Google Mobile Ads SDK docs: https://developers.google.com/admob/android/quick-start and https://developers.google.com/admob/ios/quick-start
- react-native-google-mobile-ads on Expo: https://docs.expo.dev/build/eas-json/ (search "react-native-google-mobile-ads")
- AdMob app registration: https://admob.google.com
- App Tracking Transparency: https://docs.expo.dev/versions/v57.0.0/sdk/tracking-transparency/
- Better-auth for premium status: the entitlement endpoint is protected by the session check in `lib/auth.tsx`
