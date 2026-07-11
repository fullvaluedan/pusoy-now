// Tests for the pure decision logic behind the v2 UI primitives
// (lib/uiState.ts, consumed by components/ui.tsx).
//
// The RN components themselves (Button/Card/Header/Field/BigStat) cannot be
// rendered here: this repo's tests run under tsx in plain node, with no
// react-native available. So this file imports ONLY the pure helpers, never
// react-native or components/ui.tsx itself, the same split as
// lib/profileTest.ts vs lib/auth.tsx. Same minimal ok() harness.
// Run: tsx components/ui.test.ts (or via npm test)

import { isButtonInert, resolveButtonTokens, shouldShowFieldError } from '../lib/uiState';
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

function main() {
  // --- isButtonInert (loading must behave exactly like disabled) -----------
  ok('an idle button is not inert', isButtonInert({}) === false);
  ok('a disabled button is inert', isButtonInert({ disabled: true }) === true);
  ok('a loading button is inert (ignores presses)', isButtonInert({ loading: true }) === true);
  ok('disabled + loading together stays inert', isButtonInert({ disabled: true, loading: true }) === true);
  ok('an explicit disabled: false, loading: false is not inert', isButtonInert({ disabled: false, loading: false }) === false);

  // --- resolveButtonTokens per variant + state ------------------------------
  // Idle variants pick their normal palette entry.
  const primary = resolveButtonTokens({ variant: 'primary' });
  ok('primary variant fills with felt + text-on-felt', primary.backgroundColor === colors.felt && primary.textColor === colors.textOnFelt && !primary.bordered);

  const secondary = resolveButtonTokens({ variant: 'secondary' });
  ok('secondary variant fills with feltLight', secondary.backgroundColor === colors.feltLight && secondary.textColor === colors.textOnFelt);

  const ghost = resolveButtonTokens({ variant: 'ghost' });
  ok(
    'ghost variant is transparent + bordered + felt text',
    ghost.backgroundColor === 'transparent' && ghost.bordered === true && ghost.borderColor === colors.border && ghost.textColor === colors.felt,
  );

  const colorOverride = resolveButtonTokens({ variant: 'primary', color: '#4285F4' });
  ok('a `color` override wins over the variant default', colorOverride.backgroundColor === '#4285F4');

  // Disabled/loading wins over variant: every variant collapses to the same
  // pale-fill + muted-text look, never a dimmed version of its own palette.
  for (const variant of ['primary', 'secondary', 'ghost'] as const) {
    const disabledTokens = resolveButtonTokens({ variant, disabled: true });
    ok(
      `disabled ${variant} button uses the pale disabled fill, not a dimmed variant`,
      disabledTokens.backgroundColor === colors.disabledFill && disabledTokens.textColor === colors.disabledText && disabledTokens.bordered === false,
    );

    const loadingTokens = resolveButtonTokens({ variant, loading: true });
    ok(
      `loading ${variant} button also uses the pale disabled fill`,
      loadingTokens.backgroundColor === colors.disabledFill && loadingTokens.textColor === colors.disabledText,
    );
  }

  // --- shouldShowFieldError (Field's inline validation banner) -------------
  ok('a real error message shows the banner', shouldShowFieldError('Enter a valid email address.') === true);
  ok('no error prop hides the banner', shouldShowFieldError(undefined) === false);
  ok('a null error hides the banner', shouldShowFieldError(null) === false);
  ok('an empty string hides the banner', shouldShowFieldError('') === false);
  ok('a whitespace-only string hides the banner', shouldShowFieldError('   ') === false);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
