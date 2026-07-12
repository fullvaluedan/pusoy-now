// Pure layout-budget helpers for the shared table kit. Extracted verbatim from
// app/game-local.tsx so both the bot table and the online table derive the
// exact same compact-mode budget.
//
// This module is deliberately node-safe: it imports only lib/theme (which has
// no react-native dependency) so the budget math can be unit-tested under tsx
// (see lib/tableLayout.test.ts), matching the repo convention that test files
// never pull in a react-native module. The two dimensions it needs from the
// react-native-world components are mirrored here as local constants rather
// than imported, to keep that node-safety. They are stable, load-bearing sizes
// -- keep them in sync with their source of truth if those ever change:
//   CARD_HEIGHT_PX   === components/PlayingCard CARD_HEIGHT (card art height)
//   AD_BANNER_H_PX   === components/AdBanner   AD_BANNER_HEIGHT (reserved row)
const CARD_HEIGHT_PX = 92;
const AD_BANNER_H_PX = 44;

import { layout, spacing } from '../../lib/theme';

// Height threshold (in usable panel px, after the ad row is reserved) below
// which the in-progress table switches to its compact layout: smaller
// opponent seats, a tighter center pool, and slimmer control margins, so the
// hand fan and the Pass/Play controls always stay on-screen on short phones.
// At 360x640 the panel resolves to ~588px (640 - 44 ad - 8), which sits under
// this line; at 412x915 it is ~863px and stays in the roomy default layout.
export const COMPACT_PANEL_HEIGHT = 640;

// Protected minimum height for the center pool region. The pool never shrinks
// (owner requirement): it reserves room for a full-size PlayingCard
// (CARD_HEIGHT) plus its caption line above and combo-name line below, so the
// trick display can never clip even on the shortest phone. All the height on a
// short viewport is reclaimed from the controls, opponent seats, and margins
// instead -- never from this. Value = CARD_HEIGHT (92) + caption + name + the
// tight compact margins between them.
export const POOL_MIN_HEIGHT = CARD_HEIGHT_PX + 40;

// Compact PASS/PLAY shrink to a 36px visual height; this hitSlop restores a
// >=44px effective tap target (36 + 4 top + 4 bottom = 44) so the smaller-
// looking controls stay just as easy to hit.
export const CENTER_ACTION_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 } as const;

// Usable panel height for a given window height, mirroring TablePanel's
// reservation (narrow phones have no side margin, so vMargin drops out). Kept
// as a pure helper so the in-progress screen derives the exact same budget the
// panel is drawn at.
export function usablePanelHeight(windowHeight: number, isWide: boolean): number {
  const vMargin = isWide ? layout.panelMargin : 0;
  return Math.min(
    windowHeight - vMargin * 2 - AD_BANNER_H_PX - spacing.sm,
    layout.maxTableHeight,
  );
}
