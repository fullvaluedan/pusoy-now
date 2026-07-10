// Social avatar or initials disc for player seats.
// Shows a real image when available; falls back to a themed initial disc if the image fails.
// Facebook CDN avatar URLs expire, so a broken image is an expected state, not an edge case.
import { memo, useState } from 'react';
import { Image, StyleSheet, Text, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import { colors, typography, withAlpha } from '../lib/theme';
import { avatarInitial } from '../lib/initials';

interface AvatarProps {
  name: string;
  url?: string | null;
  // A bundled fallback image (e.g. the bot dealer art) shown when there is no
  // remote url. Initials remain the last resort if this also fails to load.
  localSource?: ImageSourcePropType;
  size?: number;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}

// Memoized: four of these sit in the seat row and re-render on every game tick,
// though only the current-turn seat's `active` ring actually changes.
export const Avatar = memo(function Avatar({
  name,
  url,
  localSource,
  size = 40,
  active = false,
  style,
}: AvatarProps) {
  const [imageError, setImageError] = useState(false);

  const source = url ? { uri: url } : localSource;
  const showImage = source && !imageError;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        active && styles.active,
        style,
      ]}
    >
      {showImage ? (
        <Image
          source={source}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
          }}
          onError={() => setImageError(true)}
        />
      ) : (
        <Text style={styles.initial}>{avatarInitial(name)}</Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.feltLight,
    borderWidth: 1,
    borderColor: withAlpha(colors.white, 0.3),
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  active: {
    borderColor: colors.gold,
  },
  initial: {
    color: colors.textOnFelt,
    fontSize: typography.caption.fontSize,
    fontWeight: '700',
  },
});
