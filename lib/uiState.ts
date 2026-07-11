// Pure decision logic behind the v2 UI primitives in components/ui.tsx.
//
// This file imports only lib/theme (plain objects, no react-native), so
// components/ui.test.ts can exercise it under plain node/tsx the same way
// lib/profileTest.ts exercises lib/profile.ts. The RN components in ui.tsx
// call these helpers rather than re-deriving the same decisions inline.

import { colors } from './theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

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

export interface ButtonTokens {
  backgroundColor: string;
  textColor: string;
  bordered: boolean;
  borderColor?: string;
}

// Resolves the background/text (and optional border) tokens for a Button
// given its variant + disabled/loading/color state. Inert state wins over
// variant: a disabled or loading ghost/secondary/primary button all render
// with the same pale-fill + muted-text look rather than a dimmed variant.
export function resolveButtonTokens({ variant = 'primary', disabled, loading, color }: ButtonStateInput): ButtonTokens {
  if (isButtonInert({ disabled, loading })) {
    return { backgroundColor: colors.disabledFill, textColor: colors.disabledText, bordered: false };
  }
  if (variant === 'ghost') {
    return { backgroundColor: 'transparent', textColor: colors.felt, bordered: true, borderColor: colors.border };
  }
  const backgroundColor = color ?? (variant === 'secondary' ? colors.feltLight : colors.felt);
  return { backgroundColor, textColor: colors.textOnFelt, bordered: false };
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
