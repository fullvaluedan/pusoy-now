// Tests for the pure decision logic behind the v3 "chunky" UI primitives
// (lib/uiState.ts, consumed by components/ui.tsx).
//
// The RN components themselves (Button/Card/CompactHeader/Field/BigStat)
// cannot be rendered here: this repo's tests run under tsx in plain node,
// with no react-native available. So this file imports ONLY the pure
// helpers, never react-native or components/ui.tsx itself, the same split
// as lib/profileTest.ts vs lib/auth.tsx. Same minimal ok() harness.
// Run: tsx components/ui.test.ts (or via npm test)

import {
  isButtonInert,
  resolveBackTarget,
  resolveButtonTokens,
  resolveCheckboxTokens,
  resolvePressedTokens,
  shouldShowFieldError,
  type ButtonVariant,
} from '../lib/uiState';
import { colors } from '../lib/theme';

let pass = 0;
let fail = 0;

function ok(name: string, cond: boolean, info?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}`, info ?? '');
  }
}

// Rough luminance from a hex color, good enough to assert "edge is darker
// than fill" without needing a full color-space conversion.
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return r + g + b;
}

function main() {
  // --- isButtonInert (loading must behave exactly like disabled) -----------
  ok('an idle button is not inert', isButtonInert({}) === false);
  ok('a disabled button is inert', isButtonInert({ disabled: true }) === true);
  ok('a loading button is inert (ignores presses)', isButtonInert({ loading: true }) === true);
  ok('disabled + loading together stays inert', isButtonInert({ disabled: true, loading: true }) === true);
  ok('an explicit disabled: false, loading: false is not inert', isButtonInert({ disabled: false, loading: false }) === false);

  // --- resolveButtonTokens per variant + state ------------------------------
  // Idle variants pick their normal chunky palette entry: a fill, a darker
  // edge, caps on for every variant except ghost.
  const primary = resolveButtonTokens({ variant: 'primary' });
  ok(
    'primary variant fills with felt + white text + caps',
    primary.fill === colors.felt && primary.text === colors.textOnFelt && primary.caps === true,
  );

  const secondary = resolveButtonTokens({ variant: 'secondary' });
  ok(
    'secondary variant fills white/cream with felt text + soft border + caps',
    secondary.fill === colors.white &&
      secondary.text === colors.felt &&
      secondary.caps === true &&
      secondary.borderColor === colors.overlay,
  );

  const danger = resolveButtonTokens({ variant: 'danger' });
  ok(
    'danger variant fills dangerBright + white text + caps',
    danger.fill === colors.dangerBright && danger.text === colors.textOnFelt && danger.caps === true,
  );

  const ghost = resolveButtonTokens({ variant: 'ghost' });
  ok(
    'ghost variant is transparent + bordered + felt text',
    ghost.fill === 'transparent' && ghost.borderColor === colors.border && ghost.text === colors.felt,
  );
  ok('ghost variant has no edge and no caps', ghost.edge === 'transparent' && ghost.edgeWidth === 0 && ghost.caps === false);

  // Every non-ghost, non-inert variant's edge is a distinct, darker color
  // than its fill (the 3D bottom-edge effect the chunky buttons are named
  // for).
  for (const variant of ['primary', 'secondary', 'danger'] as const) {
    const tokens = resolveButtonTokens({ variant });
    ok(
      `${variant} edge is darker than its fill`,
      tokens.edge !== tokens.fill && luminance(tokens.edge) < luminance(tokens.fill),
      tokens,
    );
    ok(`${variant} has a resting edgeWidth`, tokens.edgeWidth > 0);
  }

  const colorOverride = resolveButtonTokens({ variant: 'primary', color: '#4285F4' });
  ok('a `color` override wins over the variant default', colorOverride.fill === '#4285F4');
  ok(
    'a `color` override still derives a darker edge from the override',
    colorOverride.edge !== colorOverride.fill && luminance(colorOverride.edge) < luminance(colorOverride.fill),
  );

  // Disabled/loading wins over variant: every variant collapses to the same
  // pale-fill + darker-pale-edge + muted-text look, never a dimmed version
  // of its own palette. "Dims fill AND edge together" means both tokens
  // move to the disabled palette, not just the fill.
  for (const variant of ['primary', 'secondary', 'danger', 'ghost'] as const satisfies readonly ButtonVariant[]) {
    const disabledTokens = resolveButtonTokens({ variant, disabled: true });
    ok(
      `disabled ${variant} button uses the pale disabled fill + a darker pale edge, not a dimmed variant`,
      disabledTokens.fill === colors.disabledFill &&
        disabledTokens.text === colors.disabledText &&
        disabledTokens.edge !== colors.disabledFill &&
        luminance(disabledTokens.edge) < luminance(disabledTokens.fill),
    );

    const loadingTokens = resolveButtonTokens({ variant, loading: true });
    ok(
      `loading ${variant} button also uses the pale disabled fill + edge`,
      loadingTokens.fill === colors.disabledFill && loadingTokens.text === colors.disabledText && loadingTokens.edge === disabledTokens.edge,
    );
  }

  // --- resolvePressedTokens (pressed state swallows the edge) --------------
  const pressed = resolvePressedTokens();
  ok('pressed tokens zero the edge width', pressed.edgeWidth === 0);
  ok('pressed tokens add a downward offset equal to the resting edge width', pressed.translateY > 0);

  // --- shouldShowFieldError (Field's inline validation banner) -------------
  ok('a real error message shows the banner', shouldShowFieldError('Enter a valid email address.') === true);
  ok('no error prop hides the banner', shouldShowFieldError(undefined) === false);
  ok('a null error hides the banner', shouldShowFieldError(null) === false);
  ok('an empty string hides the banner', shouldShowFieldError('') === false);
  ok('a whitespace-only string hides the banner', shouldShowFieldError('   ') === false);

  // --- resolveCheckboxTokens (Checkbox) -------------------------------------
  const unchecked = resolveCheckboxTokens(false);
  ok(
    'an unchecked box is an empty surface with a faint border',
    unchecked.backgroundColor === colors.surface && unchecked.borderColor === colors.overlay && unchecked.showMark === false,
  );

  const checked = resolveCheckboxTokens(true);
  ok(
    'a checked box fills felt and shows the mark',
    checked.backgroundColor === colors.felt && checked.borderColor === colors.felt && checked.showMark === true,
  );

  // --- resolveBackTarget (CompactHeader's guaranteed-back fallback) --------
  ok('with router history, the back target is "back"', resolveBackTarget(true) === 'back');
  ok('with no router history, the back target falls back to "home"', resolveBackTarget(false) === 'home');

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
