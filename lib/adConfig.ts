// Shared ad constants. Node-safe (no react-native import).
//
// Banner ad unit IDs come from EXPO_PUBLIC_ADMOB_BANNER_ANDROID / _IOS (set in
// EAS env for production builds). When unset -- or in __DEV__ -- Google's
// official TEST unit IDs are used, so dev/preview builds never serve live ads
// (clicking your own live ads can get the AdMob account suspended).
export const AD_BANNER_HEIGHT = 50; // standard 320x50 banner

export const TEST_BANNER_ANDROID = 'ca-app-pub-3940256099942544/6300978111';
export const TEST_BANNER_IOS = 'ca-app-pub-3940256099942544/2934735716';

export function bannerUnitId(platform: 'android' | 'ios', isDev: boolean): string {
  const test = platform === 'android' ? TEST_BANNER_ANDROID : TEST_BANNER_IOS;
  if (isDev) return test;
  const live =
    platform === 'android'
      ? process.env.EXPO_PUBLIC_ADMOB_BANNER_ANDROID
      : process.env.EXPO_PUBLIC_ADMOB_BANNER_IOS;
  return live || test;
}
