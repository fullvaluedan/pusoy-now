// Tests for the pure table-layout budget helpers in components/table/layout.ts.
//
// These are the numbers TablePanel is drawn at and the in-progress screen
// derives its compact flag from, so they are worth pinning: a regression here
// silently reshapes both the bot table and the online table. layout.ts is kept
// node-safe (imports only lib/theme, no react-native) precisely so it can be
// exercised here under tsx, the same plain ok() harness the other lib tests use.
//
// Run: tsx lib/tableLayout.test.ts (or via npm test)

import {
  COMPACT_PANEL_HEIGHT,
  POOL_MIN_HEIGHT,
  CENTER_ACTION_HIT_SLOP,
  usablePanelHeight,
} from '../components/table/layout';

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

// compact === the in-progress screen's own derivation:
//   usablePanelHeight(winHeight, winWidth > maxTableWidth) < COMPACT_PANEL_HEIGHT
// maxTableWidth is 560, so at the phone widths below isWide is always false.
function compactAt(width: number, height: number): boolean {
  const isWide = width > 560;
  return usablePanelHeight(height, isWide) < COMPACT_PANEL_HEIGHT;
}

function main() {
  // --- usablePanelHeight -----------------------------------------------------
  // Narrow phone: no side margin, so usable = height - 44 (ad) - 8 (spacing.sm).
  ok('360x570 usable height is 518', usablePanelHeight(570, false) === 518, usablePanelHeight(570, false));
  ok('360x640 usable height is 588', usablePanelHeight(640, false) === 588, usablePanelHeight(640, false));
  ok('412x915 usable height is 863', usablePanelHeight(915, false) === 863, usablePanelHeight(915, false));
  // Wide viewport reserves the 24px top+bottom panel margin (48 total).
  ok('wide 915 subtracts the panel margin', usablePanelHeight(915, true) === 815, usablePanelHeight(915, true));
  // Very tall windows clamp to maxTableHeight (900), never taller.
  ok('usable height clamps to maxTableHeight (900)', usablePanelHeight(4000, false) === 900, usablePanelHeight(4000, false));

  // --- compact flag (the R9-verified breakpoints) ----------------------------
  ok('360x570 is compact', compactAt(360, 570) === true);
  ok('360x640 is compact', compactAt(360, 640) === true);
  ok('412x915 is NOT compact', compactAt(412, 915) === false);

  // --- POOL_MIN_HEIGHT -------------------------------------------------------
  // The protected pool floor: full-size card (CARD_HEIGHT 92) + 40 for the
  // caption + name lines. The pure constant is 132; the R9 DOM measurement of
  // the rendered pool region reads ~138 once its own layout padding is added,
  // but the constant this helper exports -- and that trickWrap's minHeight is
  // drawn at -- is exactly CARD_HEIGHT + 40 = 132. Do not "fix" this to 138:
  // that would change the drawn minHeight and shift the table (a visual bug).
  ok('POOL_MIN_HEIGHT is 132 (CARD_HEIGHT 92 + 40)', POOL_MIN_HEIGHT === 132, POOL_MIN_HEIGHT);

  // --- CENTER_ACTION_HIT_SLOP ------------------------------------------------
  // Restores a >=44px tap target on the compact 36px PASS/PLAY (36 + 4 + 4).
  ok(
    'center action hitSlop is 4px on every edge',
    CENTER_ACTION_HIT_SLOP.top === 4 &&
      CENTER_ACTION_HIT_SLOP.bottom === 4 &&
      CENTER_ACTION_HIT_SLOP.left === 4 &&
      CENTER_ACTION_HIT_SLOP.right === 4,
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
