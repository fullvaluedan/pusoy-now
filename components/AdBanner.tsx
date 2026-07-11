// House-ad placeholder: a plain styled banner reserving the real estate a
// future ad SDK will fill. Not a real ad network integration and not an
// external image asset -- just a static plate until that milestone lands.
// Bottom-anchored; the parent (app/game-local.tsx) decides where it sits
// outside the play area. Renders nothing for premium players.
import { StyleSheet, Text, View } from 'react-native';
import { useEntitlements, shouldShowAds } from '../lib/entitlements';
import { colors, radii, spacing, typography, withAlpha } from '../lib/theme';

// Fixed height so callers can reserve exactly this much space alongside the
// play area (see AD_BANNER_HEIGHT usage in app/game-local.tsx).
export const AD_BANNER_HEIGHT = 44;

export function AdBanner() {
  const { premium } = useEntitlements();
  if (!shouldShowAds(premium)) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text} numberOfLines={1}>Prends - ad space</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    height: AD_BANNER_HEIGHT,
    borderRadius: radii.sm,
    backgroundColor: withAlpha(colors.black, 0.25),
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    ...typography.caption,
    color: colors.textOnFeltMuted,
  },
});
