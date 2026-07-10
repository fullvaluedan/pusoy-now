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
  apple: '#000000',
  google: '#4285F4',
  facebook: '#1877F2',
  twitter: '#000000',
  tiktok: '#010101',
} as const;

export const theme = { colors, spacing, radii, typography, providerBrand } as const;

export type Theme = typeof theme;
