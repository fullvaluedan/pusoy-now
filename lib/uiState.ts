// Pure decision logic behind the v2 UI primitives in components/ui.tsx.
//
// This file imports only lib/theme (plain objects, no react-native), so
// components/ui.test.ts can exercise it under plain node/tsx the same way
// lib/profileTest.ts exercises lib/profile.ts. The RN components in ui.tsx
// call these helpers rather than re-deriving the same decisions inline.

import { colors, darken } from './theme';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface ButtonStateInput {
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  color?: string;
}

// A button is inert (ignores presses, and is styled as switched off) when it
// is either explicitly disabled or busy loading. Loading must behave exactly
// like disabled: no press handling while a request is in flight.
export function isButtonInert({ disabled, loading }: { disabled?: boolean; loading?: boolean }): boolean {
  return Boolean(disabled || loading);
}

// Chunky (Duolingo-style) button tokens: a fill, a darker "edge" color
// rendered as the button's bottom border (the 3D-tactile look), the label
// color/caps treatment, and the edge's resting thickness. `edgeWidth` is 0
// for variants with no 3D edge (ghost) so Button never has to special-case
// which variants get the border-bottom treatment.
export interface ButtonTokens {
  fill: string;
  edge: string;
  text: string;
  caps: boolean;
  edgeWidth: number;
  borderColor?: string;
}

// Resting edge thickness for every variant that has a 3D edge (all but
// ghost/disabled... disabled keeps it too, dimmed, so an inert button still
// reads as a button rather than a flat swatch).
const EDGE_WIDTH = 4;

// Resolves the chunky fill/edge/text/caps tokens for a Button given its
// variant + disabled/loading/color state. Inert state wins over variant: a
// disabled or loading button of any variant renders with the same pale-fill
// + muted-text look (edge included, dimmed alongside the fill) rather than a
// dimmed version of its own palette.
export function resolveButtonTokens({ variant = 'primary', disabled, loading, color }: ButtonStateInput): ButtonTokens {
  if (isButtonInert({ disabled, loading })) {
    return {
      fill: colors.disabledFill,
      edge: darken(colors.disabledFill, 0.22),
      text: colors.disabledText,
      caps: false,
      edgeWidth: EDGE_WIDTH,
    };
  }

  if (variant === 'ghost') {
    // No 3D edge, no shouting caps: a ghost button reads as a plain
    // outlined text action, not a chunky tactile one.
    return { fill: 'transparent', edge: 'transparent', text: colors.felt, caps: false, edgeWidth: 0, borderColor: colors.border };
  }

  if (variant === 'secondary') {
    const fill = color ?? colors.white;
    return { fill, edge: colors.creamEdge, text: colors.felt, caps: true, edgeWidth: EDGE_WIDTH, borderColor: colors.overlay };
  }

  if (variant === 'danger') {
    const fill = color ?? colors.dangerBright;
    const edge = color ? darken(color, 0.22) : colors.dangerEdge;
    return { fill, edge, text: colors.textOnFelt, caps: true, edgeWidth: EDGE_WIDTH };
  }

  // primary
  const fill = color ?? colors.felt;
  const edge = color ? darken(color, 0.22) : colors.feltEdge;
  return { fill, edge, text: colors.textOnFelt, caps: true, edgeWidth: EDGE_WIDTH };
}

// Pressed-state tokens: swallow the 3D edge and nudge the button down by the
// same distance so it visually "presses into" the surface it sits on.
// Variant-independent (every variant that has an edge loses it the same
// way), kept as its own function so Button doesn't inline this decision.
export interface PressedTokens {
  translateY: number;
  edgeWidth: number;
}

export function resolvePressedTokens(): PressedTokens {
  return { translateY: EDGE_WIDTH, edgeWidth: 0 };
}

// Whether a Field's inline soft-red validation banner should render. A
// falsy, empty, or whitespace-only error means "no error" (banner hidden).
export function shouldShowFieldError(error?: string | null): boolean {
  return Boolean(error && error.trim().length > 0);
}

export interface CheckboxTokens {
  backgroundColor: string;
  borderColor: string;
  showMark: boolean;
}

// Resolves the fill/border/mark state for a Checkbox given whether it is
// checked. Unchecked is an empty surface box with the same faint border
// Field uses for its input; checked fills solid felt with the mark drawn on
// top. Every consent checkbox in this app starts unchecked (a pre-ticked box
// is not lawful consent in several jurisdictions) - that default lives at the
// call site, not here.
export function resolveCheckboxTokens(checked: boolean): CheckboxTokens {
  return checked
    ? { backgroundColor: colors.felt, borderColor: colors.felt, showMark: true }
    : { backgroundColor: colors.surface, borderColor: colors.overlay, showMark: false };
}

export type BackTarget = 'back' | 'home';

// CompactHeader's guaranteed-back-chevron decision (R6): when the router has
// history to pop, go back to it; otherwise (a screen opened directly, e.g. a
// deep link) fall back to the Home tab rather than leaving the chevron with
// nowhere to go. Pure so it is testable without expo-router/react-native.
export function resolveBackTarget(canGoBack: boolean): BackTarget {
  return canGoBack ? 'back' : 'home';
}
