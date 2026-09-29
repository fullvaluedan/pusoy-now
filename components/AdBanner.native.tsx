// Real AdMob banner (iOS/Android). Web keeps the placeholder in AdBanner.tsx.
// Flow: UMP consent (GDPR/US states) -> initialize SDK -> render banner only
// if consent allows requesting ads. Renders nothing for premium players and
// collapses the slot's content if the ad fails to load (the row stays reserved
// so the table layout never shifts).
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import mobileAds, { AdsConsent, BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { useEntitlements, shouldShowAds } from '../lib/entitlements';
import { AD_BANNER_HEIGHT, bannerUnitId } from '../lib/adConfig';
import { colors, radii, withAlpha } from '../lib/theme';

export { AD_BANNER_HEIGHT };

// One init per app session, shared by every table that mounts a banner.
let ready: Promise<boolean> | null = null;
function initAds(): Promise<boolean> {
  ready ??= (async () => {
    try {
      const info = await AdsConsent.gatherConsent();
      if (!info.canRequestAds) return false;
      await mobileAds().initialize();
      return true;
    } catch {
      return false;
    }
  })();
  return ready;
}

export function AdBanner() {
  const { premium } = useEntitlements();
  const show = shouldShowAds(premium);
  const [canRequest, setCanRequest] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!show) return;
    let alive = true;
    initAds().then((ok) => alive && setCanRequest(ok));
    return () => {
      alive = false;
    };
  }, [show]);

  if (!show) return null;

  return (
    <View style={styles.slot}>
      {canRequest && !failed ? (
        <BannerAd
          unitId={bannerUnitId(Platform.OS === 'ios' ? 'ios' : 'android', __DEV__)}
          size={BannerAdSize.BANNER}
          onAdFailedToLoad={() => setFailed(true)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    height: AD_BANNER_HEIGHT,
    borderRadius: radii.sm,
    backgroundColor: withAlpha(colors.black, 0.25),
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
