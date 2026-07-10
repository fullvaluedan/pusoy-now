// Shared design tokens for the classic-playing-card visual identity.
// Every screen should pull colors, spacing, radii, and type sizes from
// here instead of hardcoding hex values, so the whole app re-themes from
// one place.
//
// Palette: deep felt green table, paper cream background, card red and
// ink for accents (mirrors the red/black suit ink used on PlayingCard),
// and a small gold accent for highlights/badges.

export const colors = {
  // Core palette
  felt: '#0e4a3a', // deep felt green (primary brand color, headers, primary buttons)
  feltLight: '#1c7a5d', // lighter felt, secondary buttons / hover states
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
} as const;

// Layout constraints shared across screens. The game table (and the dealing
// fan, which must land cards in the same spots) is capped to a phone-ish
// column on wide viewports so the seats, pool, and hand stay composed instead
// of drifting to the screen edges.
export const layout = {
  maxTableWidth: 560,
} as const;

export const typography = {
  title: { fontSize: 40, fontWeight: '800' as const },
  heading: { fontSize: 28, fontWeight: '800' as const },
  subheading: { fontSize: 20, fontWeight: '700' as const },
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
  tiktok: '#010101',
} as const;

export const theme = { colors, spacing, radii, typography, providerBrand } as const;

export type Theme = typeof theme;
