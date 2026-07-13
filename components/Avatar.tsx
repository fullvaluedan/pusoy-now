// Social avatar or initials disc for player seats.
// Shows a real image when available; falls back to a themed initial disc if the image fails.
// Facebook CDN avatar URLs expire, so a broken image is an expected state, not an edge case.
import { memo, useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, Text, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import { colors, typography, withAlpha } from '../lib/theme';
import { avatarInitial } from '../lib/initials';

const SEAT_FRAME_IMG = require('../assets/art/seat-frame.png');
// The ring art extends this far past the photo on each side.
const FRAME_SCALE = 1.5;

interface AvatarProps {
  name: string;
  url?: string | null;
  // A bundled fallback image (e.g. the bot dealer art) shown when there is no
  // remote url. Initials remain the last resort if this also fails to load.
  localSource?: ImageSourcePropType;
  // The user's avatar-source preference. 'letter' forces the initial disc even
  // when a photo (url) exists; 'social' and 'preset:<id>' (art deferred) keep
  // the default precedence of photo, then letter. Undefined/null = default. This
  // is the single place the preference is honored, so every seat, list, and
  // ranking Avatar respects it without each caller reimplementing precedence.
  avatarPref?: string | null;
  size?: number;
  active?: boolean;
  // Wrap the avatar in the decorative gold seat-frame ring.
  framed?: boolean;
  style?: StyleProp<ViewStyle>;
}

// Memoized: four of these sit in the seat row and re-render on every game tick,
// though only the current-turn seat's `active` ring actually changes.
export const Avatar = memo(function Avatar({
  name,
  url,
  localSource,
  avatarPref,
  size = 40,
  active = false,
  framed = false,
  style,
}: AvatarProps) {
  const [imageError, setImageError] = useState(false);
  // Turn-ring pulse: a gold halo around the avatar that breathes gently while
  // it is this seat's turn. Driven by one Animated.Value looping between 0
  // and 1; the effect starts/stops the loop as `active` changes and stops it
  // on unmount, so no seat leaks a running animation once it is no longer
  // its turn or the screen goes away.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [active, pulse]);
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });

  // 'letter' forces the initial disc; any other pref keeps the default
  // photo-then-letter precedence. The bundled localSource (bot art) is unaffected
  // since bots never carry a preference.
  const forceLetter = avatarPref === 'letter';
  const source = forceLetter ? undefined : url ? { uri: url } : localSource;
  const showImage = source && !imageError;

  const circle = (
    <View
      style={[
        styles.container,
        { width: size, height: size, borderRadius: size / 2 },
        active && styles.active,
      ]}
    >
      {showImage ? (
        <Image
          source={source}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          onError={() => setImageError(true)}
        />
      ) : (
        <Text style={styles.initial}>{avatarInitial(name)}</Text>
      )}
    </View>
  );

  if (!framed) {
    return (
      <View style={[styles.plainWrap, { width: size, height: size }, style]}>
        {active && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.turnRing,
              {
                width: size + 10,
                height: size + 10,
                borderRadius: (size + 10) / 2,
                opacity: ringOpacity,
                transform: [{ scale: ringScale }],
              },
            ]}
          />
        )}
        {circle}
      </View>
    );
  }

  // Framed: an unclipped wrapper holds the ring art (behind, larger than the
  // photo so the ornamental band shows around it) and the circular avatar on
  // top. contain keeps the ring undistorted; pointerEvents none keeps it inert.
  // The turn-ring pulse (when active) sits between the two, its own circle
  // slightly larger than the photo -- this is the primary "whose turn is it"
  // cue now; the seat plate itself only carries a faint wash (see
  // app/game-local.tsx's oppBoxActive).
  const ring = Math.round(size * FRAME_SCALE);
  return (
    <View style={[styles.frameWrap, { width: ring, height: ring }, style]}>
      <Image
        source={SEAT_FRAME_IMG}
        style={[styles.frameRing, { width: ring, height: ring }]}
        resizeMode="contain"
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      {active && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.turnRing,
            {
              width: size + 14,
              height: size + 14,
              borderRadius: (size + 14) / 2,
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            },
          ]}
        />
      )}
      {circle}
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
  // Wraps a non-framed avatar so the turn-ring pulse (sized larger than the
  // photo) has somewhere to live without affecting layout: this box stays
  // exactly `size` x `size`, same as the old unwrapped avatar, so callers'
  // spacing/margins (passed via `style`) still land on the right element.
  plainWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Pulsing turn-ring halo. Positioned absolutely so it never affects layout;
  // centers on its parent (frameWrap/plainWrap) the same way frameRing does,
  // via the parent's alignItems/justifyContent rather than explicit offsets.
  turnRing: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: colors.gold,
  },
  frameRing: {
    position: 'absolute',
    pointerEvents: 'none',
  },
});
