// Shared themed UI primitives: Button, Card panel, ScreenContainer.
// Kept dependency-free (plain View/Text/Pressable) so every screen can
// build on the same look without pulling in a UI kit.
import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '../lib/theme';

// ---------------------------------------------------------------------------
// ScreenContainer: SafeAreaView + cream background + standard padding.
// Pass `scroll` for screens with more content than fits (mirrors the old
// ScrollView + contentContainerStyle pattern used on sign-in).
// ---------------------------------------------------------------------------
interface ScreenContainerProps {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  // Cap the centered content column; defaults to MAX_CONTENT_WIDTH.
  maxWidth?: number;
}

export function ScreenContainer({ children, scroll, style, maxWidth = MAX_CONTENT_WIDTH }: ScreenContainerProps) {
  if (scroll) {
    return (
      <SafeAreaView style={[screenStyles.container, style]}>
        <ScrollView contentContainerStyle={screenStyles.scrollContent}>
          <View style={[screenStyles.columnScroll, { maxWidth }]}>{children}</View>
        </ScrollView>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={[screenStyles.container, style]}>
      <View style={[screenStyles.columnPadded, { maxWidth }]}>{children}</View>
    </SafeAreaView>
  );
}

// Shared max content width so menu screens read as a centered column on wide
// desktop viewports instead of stretching edge to edge. Matches home's cap.
const MAX_CONTENT_WIDTH = 480;

const screenStyles = StyleSheet.create({
  // userSelect none so web drags never paint a text-selection highlight; it
  // inherits to all screen children. Matches the game screen root.
  container: { flex: 1, backgroundColor: colors.cream, userSelect: 'none' },
  // Full-bleed cream background; children are centered in a capped column.
  scrollContent: { padding: spacing.lg, alignItems: 'center' },
  columnScroll: { width: '100%', gap: spacing.sm + 4, alignSelf: 'center' },
  columnPadded: { flex: 1, width: '100%', alignSelf: 'center', padding: spacing.lg },
});

// ---------------------------------------------------------------------------
// Card: white panel used for stat rows, setup notes, empty states.
// ---------------------------------------------------------------------------
interface CardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, style }: CardProps) {
  return <View style={[cardStyles.card, style]}>{children}</View>;
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    padding: spacing.lg - 4,
    borderRadius: radii.sm,
  },
});

// ---------------------------------------------------------------------------
// Button: themed Pressable with title + optional subtitle line.
// `variant` picks a background from the palette; `color` overrides it for
// one-off cases (e.g. provider-branded sign-in buttons).
// ---------------------------------------------------------------------------
type ButtonVariant = 'primary' | 'secondary' | 'ghost';
// 'center' matches the sign-in/settings/stats/leaderboard buttons;
// 'left' matches the home/bot-select buttons (full-width, text + subtitle
// stacked at the left edge). Kept explicit so this refactor changes no
// existing layout.
type ButtonAlign = 'left' | 'center';

interface ButtonProps {
  title: string;
  subtitle?: string;
  onPress: () => void;
  variant?: ButtonVariant;
  align?: ButtonAlign;
  color?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ title, subtitle, onPress, variant = 'primary', align = 'center', color, disabled, style }: ButtonProps) {
  const isGhost = variant === 'ghost';
  const backgroundColor = color ?? (variant === 'secondary' ? colors.feltLight : colors.felt);

  return (
    <Pressable
      style={[
        buttonStyles.btn,
        align === 'left' ? buttonStyles.alignLeft : buttonStyles.alignCenter,
        isGhost ? buttonStyles.ghost : { backgroundColor },
        disabled && buttonStyles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={isGhost ? buttonStyles.ghostText : buttonStyles.text}>{title}</Text>
      {subtitle ? (
        <Text style={isGhost ? buttonStyles.ghostSubtext : buttonStyles.subtext}>{subtitle}</Text>
      ) : null}
    </Pressable>
  );
}

const buttonStyles = StyleSheet.create({
  btn: {
    padding: spacing.md + 4,
    borderRadius: radii.lg,
    minHeight: 56,
    justifyContent: 'center',
  },
  alignLeft: { alignItems: 'stretch' },
  alignCenter: { alignItems: 'center' },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  disabled: {
    opacity: 0.5,
  },
  text: { color: colors.textOnFelt, fontSize: typography.bodyBold.fontSize, fontWeight: typography.bodyBold.fontWeight },
  subtext: { color: colors.textOnFeltMuted, fontSize: typography.caption.fontSize, marginTop: 2 },
  ghostText: { color: colors.felt, fontSize: typography.bodyBold.fontSize, fontWeight: typography.bodyBold.fontWeight },
  ghostSubtext: { color: colors.textMuted, fontSize: typography.caption.fontSize, marginTop: 2 },
});
