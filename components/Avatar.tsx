// Social avatar or initials disc for player seats.
// Shows a real image when available; falls back to a themed initial disc if the image fails.
// Facebook CDN avatar URLs expire, so a broken image is an expected state, not an edge case.
import * as React from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, spacing, typography, withAlpha } from '../lib/theme';
import { avatarInitial } from '../lib/initials';

interface AvatarProps {
  name: string;
  url?: string | null;
  size?: number;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Avatar({ name, url, size = 40, active = false, style }: AvatarProps) {
  const [imageError, setImageError] = React.useState(false);

  const showImage = url && !imageError;

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
          source={{ uri: url }}
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
}

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
