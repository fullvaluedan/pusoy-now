// Shared themed UI primitives: Button, Card panel, ScreenContainer, plus the
// v2 "clean product" additions Header/Field/BigStat. Kept dependency-free
// (plain View/Text/Pressable/TextInput, RN's own Animated for the loading
// dots) so every screen can build on the same look without pulling in a UI
// kit or icon library.
import { useEffect, useRef, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, shadows, spacing, typography } from '../lib/theme';
import { isButtonInert, resolveButtonTokens, shouldShowFieldError, type ButtonVariant } from '../lib/uiState';

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
// Card: v2 soft, borderless, rounded panel used for stat rows, setup notes,
// empty states. No border; a faint shadow (shadows.card) lifts it off the
// cream background instead.
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
    borderRadius: radii.lg,
    ...shadows.card,
  },
});

// ---------------------------------------------------------------------------
// Button: themed Pressable with title + optional subtitle line. Renders as a
// v2 full-width pill (radii.pill). `variant` picks a background from the
// palette; `color` overrides it for one-off cases (e.g. provider-branded
// sign-in buttons). `loading` replaces the label with a three-dot indicator
// and, like `disabled`, makes the button inert; both render the same pale
// fill + muted text (resolveButtonTokens) instead of a dimmed opacity.
// ---------------------------------------------------------------------------
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
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ title, subtitle, onPress, variant = 'primary', align = 'center', color, disabled, loading, style }: ButtonProps) {
  const inert = isButtonInert({ disabled, loading });
  const tokens = resolveButtonTokens({ variant, disabled, loading, color });

  return (
    <Pressable
      style={[
        buttonStyles.btn,
        align === 'left' ? buttonStyles.alignLeft : buttonStyles.alignCenter,
        { backgroundColor: tokens.backgroundColor },
        tokens.bordered ? { borderWidth: 1, borderColor: tokens.borderColor } : null,
        style,
      ]}
      onPress={onPress}
      disabled={inert}
    >
      {loading ? (
        <LoadingDots color={tokens.textColor} />
      ) : (
        <>
          <Text style={[buttonStyles.text, { color: tokens.textColor }]}>{title}</Text>
          {subtitle ? <Text style={[buttonStyles.subtext, { color: tokens.textColor }]}>{subtitle}</Text> : null}
        </>
      )}
    </Pressable>
  );
}

// Three-dot loading indicator that replaces the label while `loading` is
// true. Built on RN's own Animated (no extra dependency): each dot pulses
// opacity on a staggered loop.
function LoadingDots({ color }: { color: string }) {
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current;

  useEffect(() => {
    const loops = dots.map((value, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(value, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(value, { toValue: 0.3, duration: 300, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [dots]);

  return (
    <View style={buttonStyles.dotsRow}>
      {dots.map((value, i) => (
        <Animated.View key={i} style={[buttonStyles.dot, { backgroundColor: color, opacity: value }]} />
      ))}
    </View>
  );
}

const buttonStyles = StyleSheet.create({
  btn: {
    padding: spacing.md + 4,
    borderRadius: radii.pill,
    minHeight: 56,
    justifyContent: 'center',
  },
  alignLeft: { alignItems: 'stretch' },
  alignCenter: { alignItems: 'center' },
  text: { fontSize: typography.bodyBold.fontSize, fontWeight: typography.bodyBold.fontWeight },
  subtext: { fontSize: typography.caption.fontSize, marginTop: 2, opacity: 0.75 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
});

// ---------------------------------------------------------------------------
// Header: v2 minimal header with a back chevron on the left, a centered
// title, and an optional right-side text action. The chevron is drawn with
// two borders rotated 45deg (no icon library, no emoji).
// ---------------------------------------------------------------------------
interface HeaderProps {
  title: string;
  onBack?: () => void;
  right?: { label: string; onPress: () => void };
}

export function Header({ title, onBack, right }: HeaderProps) {
  return (
    <View style={headerStyles.row}>
      <View style={headerStyles.side}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={10} style={headerStyles.backBtn}>
            <View style={headerStyles.chevron} />
          </Pressable>
        ) : null}
      </View>
      <Text style={headerStyles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={[headerStyles.side, headerStyles.sideRight]}>
        {right ? (
          <Pressable onPress={right.onPress} hitSlop={10}>
            <Text style={headerStyles.rightText}>{right.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const headerStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  side: { minWidth: 44, justifyContent: 'center' },
  sideRight: { alignItems: 'flex-end' },
  backBtn: { padding: spacing.xs, alignSelf: 'flex-start' },
  // Bottom-left corner of a square, rotated 45deg, reads as a left chevron.
  chevron: {
    width: 10,
    height: 10,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.textPrimary,
    transform: [{ rotate: '45deg' }],
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: typography.subheading.fontSize,
    fontWeight: typography.subheading.fontWeight,
    color: colors.textPrimary,
  },
  rightText: {
    color: colors.felt,
    fontSize: typography.body.fontSize,
    fontWeight: typography.bodyBold.fontWeight,
  },
});

// ---------------------------------------------------------------------------
// Field: labeled TextInput with an inline soft-red validation banner shown
// under it when `error` is set (shouldShowFieldError), hidden when falsy.
// Pass-through TextInput props (secureTextEntry, autoCapitalize, keyboardType,
// etc.) go through `...rest`.
// ---------------------------------------------------------------------------
interface FieldProps extends TextInputProps {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string | null;
}

export function Field({ label, value, onChangeText, error, style, ...rest }: FieldProps) {
  const showError = shouldShowFieldError(error);

  return (
    <View style={fieldStyles.wrap}>
      {label ? <Text style={fieldStyles.label}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={colors.textFaint}
        style={[fieldStyles.input, showError ? fieldStyles.inputError : null, style]}
        {...rest}
      />
      {showError ? (
        <View style={fieldStyles.errorBanner}>
          <Text style={fieldStyles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  wrap: { width: '100%' },
  label: {
    fontSize: typography.label.fontSize,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    fontSize: typography.body.fontSize,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.overlay,
  },
  inputError: {
    borderColor: colors.dangerSoftText,
  },
  errorBanner: {
    marginTop: spacing.xs,
    backgroundColor: colors.dangerSoftBg,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.dangerSoftBorder,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  errorText: {
    color: colors.dangerSoftText,
    fontSize: typography.caption.fontSize,
  },
});

// ---------------------------------------------------------------------------
// BigStat: a large bold numeral with a small caption label below, for
// profile/stats screens.
// ---------------------------------------------------------------------------
interface BigStatProps {
  value: string | number;
  label: string;
}

export function BigStat({ value, label }: BigStatProps) {
  return (
    <View style={bigStatStyles.wrap}>
      <Text style={bigStatStyles.value}>{value}</Text>
      <Text style={bigStatStyles.label}>{label}</Text>
    </View>
  );
}

const bigStatStyles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  value: {
    fontSize: typography.title.fontSize,
    fontWeight: typography.title.fontWeight,
    color: colors.felt,
  },
  label: {
    fontSize: typography.caption.fontSize,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
