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
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { colors, radii, shadows, spacing, typography } from '../lib/theme';
import {
  isButtonInert,
  resolveBackTarget,
  resolveButtonTokens,
  resolveCheckboxTokens,
  resolveListRowTokens,
  resolvePressedTokens,
  shouldShowFieldError,
  type ButtonVariant,
  type ListRowTone,
} from '../lib/uiState';

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
// Card: v3 soft, rounded panel used for stat rows, setup notes, empty
// states. A faint shadow (shadows.card) lifts it off the cream background,
// plus a hairline creamEdge-toned border so it reads as a distinct surface
// even where shadows don't render (some web contexts).
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
    borderRadius: radii.xl,
    borderWidth: 2,
    borderColor: colors.creamEdge,
    ...shadows.card,
  },
});

// ---------------------------------------------------------------------------
// Button: themed Pressable with title + optional subtitle line. Renders as a
// v3 chunky full-width rounded-rect (radii.xl): a solid fill plus a darker
// bottom "edge" border that reads as the button's 3D side. Pressing it
// swallows the edge and nudges the button down by the same distance
// (resolvePressedTokens) so it visually presses into the surface.
// `variant` picks fill/edge/text/caps from resolveButtonTokens; `color`
// overrides the fill for one-off cases (e.g. provider-branded sign-in
// buttons), and its edge is derived automatically. `loading` replaces the
// label with a three-dot indicator and, like `disabled`, makes the button
// inert; both render the same pale fill + edge + muted text instead of a
// dimmed opacity.
// ---------------------------------------------------------------------------
// 'center' matches the sign-in/settings/stats/leaderboard buttons;
// 'left' matches the home/bot-select buttons (full-width, text + subtitle
// stacked at the left edge). Kept explicit so this refactor changes no
// existing layout.
type ButtonAlign = 'left' | 'center';

// 'default' is the standard 56px-tall chunky button used everywhere.
// 'big' is the Duolingo-hard hero size (Round 10 U5): taller, bigger type,
// for the one standout action on a screen (Home's PLAY).
type ButtonSize = 'default' | 'big';

interface ButtonProps {
  title: string;
  subtitle?: string;
  onPress: () => void;
  variant?: ButtonVariant;
  align?: ButtonAlign;
  size?: ButtonSize;
  color?: string;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  // Overrides the label Text style (e.g. a smaller fontSize/letterSpacing so
  // a longer label fits a tight equal-width slot, like Home's one-line
  // PLAY | QUICK MATCH | PRIVATE row on a 360px screen -- Round 9 U2).
  textStyle?: StyleProp<TextStyle>;
}

export function Button({ title, subtitle, onPress, variant = 'primary', align = 'center', size = 'default', color, disabled, loading, style, textStyle }: ButtonProps) {
  const inert = isButtonInert({ disabled, loading });
  const tokens = resolveButtonTokens({ variant, disabled, loading, color });

  return (
    <Pressable
      style={({ pressed }) => {
        const pressedTokens = pressed && !inert ? resolvePressedTokens() : null;
        return [
          buttonStyles.btn,
          size === 'big' ? buttonStyles.btnBig : null,
          align === 'left' ? buttonStyles.alignLeft : buttonStyles.alignCenter,
          { backgroundColor: tokens.fill },
          tokens.borderColor ? { borderWidth: 1, borderColor: tokens.borderColor } : null,
          {
            borderBottomWidth: pressedTokens ? pressedTokens.edgeWidth : tokens.edgeWidth,
            borderBottomColor: tokens.edge,
            transform: [{ translateY: pressedTokens ? pressedTokens.translateY : 0 }],
          },
          style,
        ];
      }}
      onPress={onPress}
      disabled={inert}
    >
      {loading ? (
        <LoadingDots color={tokens.text} />
      ) : (
        <>
          <Text
            style={[
              buttonStyles.text,
              size === 'big' ? buttonStyles.textBig : null,
              { color: tokens.text },
              tokens.caps ? buttonStyles.textCaps : null,
              textStyle,
            ]}
          >
            {title}
          </Text>
          {subtitle ? <Text style={[buttonStyles.subtext, { color: tokens.text }]}>{subtitle}</Text> : null}
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
    // v3: chunky rounded-rect corners (Duolingo-style), not the old
    // full-pill stadium shape - the bottom edge border reads as a 3D side,
    // which only looks right on a rectangle with modest corner rounding.
    borderRadius: radii.xl,
    minHeight: 56,
    justifyContent: 'center',
  },
  // Duolingo-hard hero size (Round 10 U5): taller than the 56px default and
  // bigger type, for the one standout action on a screen (Home's PLAY).
  btnBig: { minHeight: 76, padding: spacing.lg },
  alignLeft: { alignItems: 'stretch' },
  alignCenter: { alignItems: 'center' },
  text: { fontSize: typography.bodyBold.fontSize, fontWeight: typography.bodyBold.fontWeight },
  textBig: { fontSize: typography.subheading.fontSize },
  textCaps: { textTransform: 'uppercase', letterSpacing: 0.5 },
  subtext: { fontSize: typography.caption.fontSize, marginTop: 2, opacity: 0.75 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
});

// ---------------------------------------------------------------------------
// ListRow (Round 10 U6, "Duolingo, executed hard"): a full-width tappable
// row styled as a chunky bordered card, replacing the old thin
// divider-separated rows on the menu screens. Every row is its own
// 2px-bordered white card with a darker 4px bottom "edge" (resolveListRowTokens,
// the same visual language as the chunky Button), a bold label, and three
// optional slots: `leading` (emoji/icon/avatar), `trailing` (chevron / a
// Switch / value text / a cluster of action buttons), and `children` (an
// override for the label/subtitle text block when a row needs richer
// multi-line content than one label + one subtitle, e.g. a leaderboard row's
// username + name + stats). Pass `onPress` to make it tappable - it presses
// down and swallows the edge exactly like Button (resolvePressedTokens);
// omit it for a static row whose interaction lives in `trailing` instead
// (e.g. a friend row with its own Accept/Remove buttons), so taps on those
// buttons never fight a row-level press.
// ---------------------------------------------------------------------------
interface ListRowProps {
  label?: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  // Shows the default ">" chevron in the trailing slot when true and no
  // explicit `trailing` node is passed (nav rows like Settings > Profile).
  chevron?: boolean;
  children?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  tone?: ListRowTone;
  style?: StyleProp<ViewStyle>;
}

export function ListRow({ label, subtitle, leading, trailing, chevron, children, onPress, disabled, tone, style }: ListRowProps) {
  const tokens = resolveListRowTokens({ disabled, tone });

  const textBlock = children ?? (
    <View style={listRowStyles.textGroup}>
      {label ? (
        <Text style={[listRowStyles.label, { color: tokens.text }]} numberOfLines={1} ellipsizeMode="tail">
          {label}
        </Text>
      ) : null}
      {subtitle ? (
        <Text style={listRowStyles.subtitle} numberOfLines={1} ellipsizeMode="tail">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );

  const content = (
    <>
      {leading ? <View style={listRowStyles.leading}>{leading}</View> : null}
      {textBlock}
      {trailing ? (
        <View style={listRowStyles.trailing}>{trailing}</View>
      ) : chevron ? (
        <View style={listRowStyles.chevron} />
      ) : null}
    </>
  );

  const restingStyle = {
    backgroundColor: tokens.fill,
    borderColor: tokens.borderColor,
    borderBottomWidth: tokens.edgeWidth,
    borderBottomColor: tokens.edge,
  };

  if (!onPress) {
    return <View style={[listRowStyles.row, restingStyle, style]}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => {
        const pressedTokens = pressed && !disabled ? resolvePressedTokens() : null;
        return [
          listRowStyles.row,
          restingStyle,
          pressedTokens
            ? {
                borderBottomWidth: pressedTokens.edgeWidth,
                transform: [{ translateY: pressedTokens.translateY }],
              }
            : null,
          style,
        ];
      }}
    >
      {content}
    </Pressable>
  );
}

const listRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 60,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 2,
    marginBottom: spacing.sm,
  },
  leading: { marginRight: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  textGroup: { flex: 1, minWidth: 0 },
  label: { fontSize: typography.bodyBold.fontSize, fontWeight: typography.bodyBold.fontWeight },
  subtitle: { fontSize: typography.caption.fontSize, color: colors.textMuted, marginTop: 2 },
  trailing: { marginLeft: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  // Bottom-left... top-right corner of a square, rotated 45deg: reads as a
  // right-pointing ">" chevron (the mirror of CompactHeader's back "<").
  chevron: {
    width: 10,
    height: 10,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: colors.textMuted,
    transform: [{ rotate: '45deg' }],
  },
});

// ---------------------------------------------------------------------------
// CompactHeader: v3 slim (~48px) header with a guaranteed back chevron, a
// centered bold title, and an optional right-side slot. The chevron is
// drawn with two borders rotated 45deg (no icon library, no emoji), inside
// a 44x44 tappable area (the platform's minimum touch-target floor).
//
// Back behavior (R6): pass `onBack` for a custom action (e.g. a room screen
// that always replaces to home instead of popping). Omit it and the chevron
// falls back to router.back() when there is navigation history, else
// router.replace('/') - so a screen opened directly (deep link, browser
// refresh) never shows a chevron with nowhere to go. Pass `back={false}` to
// hide the chevron area entirely (e.g. a screen that is never pushed).
// resolveBackTarget in lib/uiState.ts is the pure decision behind the
// fallback, kept testable outside react-native.
// ---------------------------------------------------------------------------
interface CompactHeaderProps {
  title: string;
  onBack?: () => void;
  back?: boolean;
  right?: ReactNode;
}

function defaultHeaderBack() {
  const target = resolveBackTarget(router.canGoBack());
  if (target === 'back') {
    router.back();
  } else {
    router.replace('/');
  }
}

export function CompactHeader({ title, onBack, back = true, right }: CompactHeaderProps) {
  const handleBack = onBack ?? defaultHeaderBack;
  return (
    <View style={compactHeaderStyles.row}>
      <View style={compactHeaderStyles.side}>
        {back ? (
          <Pressable onPress={handleBack} hitSlop={8} style={compactHeaderStyles.backBtn}>
            <View style={compactHeaderStyles.chevron} />
          </Pressable>
        ) : null}
      </View>
      <Text style={compactHeaderStyles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={[compactHeaderStyles.side, compactHeaderStyles.sideRight]}>{right ?? null}</View>
    </View>
  );
}

const compactHeaderStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
  },
  side: { minWidth: 44, justifyContent: 'center' },
  sideRight: { alignItems: 'flex-end' },
  // Fixed 44x44 tappable area regardless of the chevron's small visual size.
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
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
});

// ---------------------------------------------------------------------------
// Header: the old v2 header API, now a thin wrapper around CompactHeader so
// every existing `<Header title=.. onBack=.. right=..>` call site keeps
// compiling and rendering exactly as before (back chevron only when
// `onBack` is passed - matchmaking's headerless "Finding players" title
// relies on that). U5 sweeps screens over to CompactHeader directly.
// ---------------------------------------------------------------------------
interface HeaderProps {
  title: string;
  onBack?: () => void;
  right?: { label: string; onPress: () => void };
}

export function Header({ title, onBack, right }: HeaderProps) {
  return (
    <CompactHeader
      title={title}
      onBack={onBack}
      back={Boolean(onBack)}
      right={
        right ? (
          <Pressable onPress={right.onPress} hitSlop={10}>
            <Text style={headerStyles.rightText}>{right.label}</Text>
          </Pressable>
        ) : undefined
      }
    />
  );
}

const headerStyles = StyleSheet.create({
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
// Checkbox: pressable box + checkmark, with an inline label. Every usage in
// this app starts unchecked (see the marketing-consent box on sign-up) - the
// mark is two rotated borders, the same icon-free trick Header uses for its
// back chevron.
// ---------------------------------------------------------------------------
interface CheckboxProps {
  checked: boolean;
  onToggle: (next: boolean) => void;
  label: string;
  style?: StyleProp<ViewStyle>;
}

export function Checkbox({ checked, onToggle, label, style }: CheckboxProps) {
  const tokens = resolveCheckboxTokens(checked);
  return (
    <Pressable style={[checkboxStyles.row, style]} onPress={() => onToggle(!checked)} hitSlop={6}>
      <View style={[checkboxStyles.box, { backgroundColor: tokens.backgroundColor, borderColor: tokens.borderColor }]}>
        {tokens.showMark ? <View style={checkboxStyles.mark} /> : null}
      </View>
      <Text style={checkboxStyles.label}>{label}</Text>
    </Pressable>
  );
}

const checkboxStyles = StyleSheet.create({
  // minHeight brings the tappable row (a 22px box + hitSlop 6) up to the
  // 44px tap-target floor without growing the visible checkbox.
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  box: {
    width: 22,
    height: 22,
    borderRadius: radii.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Bottom-left corner of a square, rotated 45deg, reads as a checkmark.
  mark: {
    width: 10,
    height: 6,
    marginTop: -2,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.textOnFelt,
    transform: [{ rotate: '-45deg' }],
  },
  label: { flex: 1, fontSize: typography.label.fontSize, color: colors.textBody },
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
