// Shared design tokens for the classic-playing-card visual identity.
// Every screen should pull colors, spacing, radii, and type sizes from
// here instead of hardcoding hex values, so the whole app re-themes from
// one place.
//
// Palette: deep felt green table, paper cream background, card red and
// ink for accents (mirrors the red/black suit ink used on PlayingCard),
// and a small gold accent for highlights/badges.

const baseColors = {
  // Core palette
  felt: '#0e4a3a', // deep felt green (primary brand color, headers, primary buttons)
  feltLight: '#1c7a5d', // lighter felt, secondary buttons / hover states
  backdrop: '#06231b', // flat dark green-ink behind the bounded table panel
  cream: '#f4f1e8', // paper cream, screen background
  white: '#ffffff', // card panels
  cardRed: '#c0392b', // suit red, danger/alert accents
  ink: '#1a1a1a', // near-black suit ink, primary text on light surfaces
  gold: '#f1c40f', // accent highlights, badges, selected states

  // Text
  textPrimary: '#1a1a1a',
  textOnFelt: '#ffffff',
  textOnFeltMuted: 'rgba(255,255,255,0.7)',
  textMuted: '#666666',
  textFaint: '#999999',
  textBody: '#444444',

  // Surfaces & borders
  surface: '#ffffff',
  border: '#0e4a3a',
  overlay: 'rgba(0,0,0,0.05)',

  // Card component (PlayingCard / DealingAnimation / game table)
  cardFace: '#fdfdfb', // card face background, slightly warmer than cream
  cardBorder: '#2c3e50', // card face/back stroke, dark navy-ink
  black: '#000000', // true black, for shadows and dark translucent panels via withAlpha

  // Status text (in-game feedback)
  danger: '#ff6b6b', // error / illegal-play text
  dangerLight: '#ff8f8f', // secondary danger state (selection doesn't beat lead)
  success: '#7bed9f', // legal/selected-ok state text
  neutral: '#7f8c8d', // secondary action (Pass button)

  // v2 "clean product" tokens ------------------------------------------------
  // Disabled controls get a pale fill + muted text instead of a dimmed
  // opacity, so an inert Button/Field reads as switched off rather than
  // as its normal color washed out.
  disabledFill: '#e5e1d4',
  disabledText: '#a39c8a',
  // Inline validation banner shown under a Field when its `error` prop is
  // set: a soft/pale red, distinct from the brighter in-game `danger` used
  // on the table for illegal-play feedback.
  dangerSoftBg: '#fbe9e7',
  dangerSoftBorder: '#f2c6c0',
  dangerSoftText: '#b3261e',

  // v3 "Duolingo-style" tokens -------------------------------------------------
  // Vibrant accents layered on top of the felt/gold/cream identity for the
  // chunky button system: a brighter success green than the in-game
  // `success` text color, a warm danger red distinct from the softer
  // `cardRed`/`dangerSoft*` tones, and a new sky-blue secondary accent.
  successBright: '#58cc02',
  dangerBright: '#ff4b4b',
  skyBlue: '#1cb0f6',
} as const;

// Compose an rgba() string from a hex color token + alpha, so translucent
// panels/text/borders can be built from theme colors instead of hardcoding
// new hex or rgba literals at each call site.
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Darken a hex color token by a fraction (0-1), used to derive each chunky
// button's 3D bottom-edge color from its fill color at module load, so the
// two tones can never drift apart when a fill color is tuned later.
export function darken(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const factor = 1 - amount;
  const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const toHex = (n: number) => clampByte(n).toString(16).padStart(2, '0');
  return `#${toHex(r * factor)}${toHex(g * factor)}${toHex(b * factor)}`;
}

// EDGE_DARKEN sits in the 18-25% range the Duolingo-style chunky buttons use
// for their 3D bottom edge: dark enough to read as a distinct "side" of the
// button, not so dark it looks like an unrelated color.
const EDGE_DARKEN = 0.22;

export const colors = {
  ...baseColors,
  // One darker "edge" companion per button fill color, computed from the
  // fill above so edge and fill can never drift out of sync.
  feltEdge: darken(baseColors.felt, EDGE_DARKEN),
  goldEdge: darken(baseColors.gold, EDGE_DARKEN),
  successEdge: darken(baseColors.successBright, EDGE_DARKEN),
  dangerEdge: darken(baseColors.dangerBright, EDGE_DARKEN),
  skyEdge: darken(baseColors.skyBlue, EDGE_DARKEN),
  creamEdge: darken(baseColors.cream, EDGE_DARKEN),
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 10,
  md: 12,
  lg: 14,
  // v3: chunky Duolingo-style rounded corners for cards and the CompactHeader.
  xl: 16,
  // v2: fully rounded ends for full-width pill buttons (>= half the
  // control's height so it always renders as a stadium/pill shape).
  pill: 999,
} as const;

// v2 soft-shadow used on borderless rounded Cards (and other elevated
// surfaces) instead of a hard border, so panels read as gently lifted off
// the cream background. Spread as a style object: `style={[styles.x, shadows.card]}`.
export const shadows = {
  card: {
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3, // Android shadow equivalent; ignored on iOS/web
  },
} as const;

// Layout constraints shared across screens. The game table (and the dealing
// fan, which must land cards in the same spots) is capped to a phone-ish
// column on wide viewports so the seats, pool, and hand stay composed instead
// of drifting to the screen edges.
export const layout = {
  maxTableWidth: 560,
  // The panel is also height-capped so it does not stretch to fill a tall
  // desktop window (which left dead space down the middle); above the cap it
  // is centered vertically on the backdrop.
  maxTableHeight: 900,
  // On desktop the table renders as a bounded panel: capped to maxTableWidth,
  // inset from the top/bottom by panelMargin so the dark backdrop frames it,
  // with rounded corners of panelRadius. On narrow viewports the panel goes
  // full-bleed (margin and radius collapse to 0).
  panelMargin: 24,
  panelRadius: 22,
} as const;

export const typography = {
  // v3: hub headline size for the Duolingo-style Home hub, bolder than
  // `heading` and just shy of `title`.
  display: { fontSize: 34, fontWeight: '800' as const },
  title: { fontSize: 40, fontWeight: '800' as const },
  heading: { fontSize: 28, fontWeight: '800' as const },
  // Bumped to '800' alongside title/heading for the chunkier v3 type scale.
  subheading: { fontSize: 20, fontWeight: '800' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  bodyBold: { fontSize: 16, fontWeight: '700' as const },
  label: { fontSize: 14, fontWeight: '400' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
  tiny: { fontSize: 12, fontWeight: '400' as const },
} as const;

// Third-party brand colors for OAuth provider buttons on the sign-in
// screen. These are fixed brand identity colors (not part of the app's
// classic-cards palette), centralized here so no screen hardcodes hex.
export const providerBrand = {
  google: '#4285F4',
  facebook: '#1877F2',
  apple: '#000000',
  tiktok: '#010101',
} as const;

export const theme = { colors, spacing, radii, typography, providerBrand, shadows } as const;

export type Theme = typeof theme;
