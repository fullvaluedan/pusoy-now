// Bounded table panel shared by every phase of the table screen (loading,
// dealing, in-progress, finished) so the game always sits on the same surface.
// Extracted from app/game-local.tsx unchanged so the online table (U2) renders
// on the exact same felt/gold/ad-banner frame.
import { type ReactNode } from 'react';
import { ImageBackground, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AdBanner } from '../AdBanner';
import { colors, layout, spacing, withAlpha } from '../../lib/theme';
import { usablePanelHeight } from './layout';

const FELT_IMG = require('../../assets/art/felt-tile.png');

// A flat dark backdrop fills the window; inside it a centered panel (capped to
// maxTableWidth, inset by panelMargin on desktop, rounded, framed with a
// code-drawn double gold border, and drop-shadowed) clips its children. The
// felt tile and vignette live inside the panel so decoration and content share
// one box and compose at every window size. On narrow viewports the panel goes
// full-bleed (margin and corners collapse). The SafeAreaView nests inside so
// content clears the safe-area insets while the felt itself fills the panel
// edge to edge.
export function TablePanel({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  const isWide = width > layout.maxTableWidth;
  const vMargin = isWide ? layout.panelMargin : 0;
  const radius = isWide ? layout.panelRadius : 0;
  // Cap the panel height so it does not stretch to fill a tall window; the
  // backdrop centers it vertically, giving equal breathing room above and
  // below. On short/narrow windows this resolves to the full available height
  // (effectively full-screen). The ad banner's row is reserved out of this
  // budget up front (rather than stacked on top of it) so the felt panel --
  // and the card fan inside it -- never gets pushed off-screen or overlapped.
  const panelHeight = usablePanelHeight(height, isWide);
  return (
    <View style={styles.backdrop}>
      <View
        style={[
          styles.panelShadow,
          { height: panelHeight, borderRadius: radius },
        ]}
      >
        <View style={[styles.panel, { borderRadius: radius }]}>
          <ImageBackground
            source={FELT_IMG}
            style={styles.panelFelt}
            imageStyle={styles.panelFeltImage}
            resizeMode="repeat"
          >
            <View style={styles.tableVignetteOuter} pointerEvents="none" />
            <View style={styles.tableVignetteMid} pointerEvents="none" />
            <View style={styles.tableVignetteInner} pointerEvents="none" />
            {/* Inner gold hairline, inset from the panel's outer gold edge, so
                the frame reads as a classic double-line table border. Drawn in
                code (not the fixed-aspect inlay PNG) so it hugs the panel at
                any size. pointerEvents none so it never blocks a tap. */}
            <View
              style={[styles.panelInnerFrame, { borderRadius: Math.max(0, radius - 6) }]}
              pointerEvents="none"
            />
            <SafeAreaView style={styles.container}>{children}</SafeAreaView>
          </ImageBackground>
        </View>
      </View>
      {/* House-ad placeholder, bottom-anchored and entirely outside the felt
          panel above (the play area), per the reserved row in panelHeight. */}
      <View style={[styles.adBannerSlot, { maxWidth: layout.maxTableWidth }]}>
        <AdBanner />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Flat dark backdrop filling the window behind the bounded table panel.
  // alignItems centers the width-capped panel horizontally and justifyContent
  // centers it vertically once its height is capped below the window height.
  backdrop: {
    flex: 1,
    backgroundColor: colors.backdrop,
    alignItems: 'center',
    justifyContent: 'center',
    // Suppress browser text selection on web: dragging a card must not paint a
    // blue text-selection highlight across the table. user-select inherits, so
    // setting it on the screen root covers the panel and every child.
    userSelect: 'none',
  },
  // Shadow host for the panel. Kept separate from the clipping panel because
  // the panel sets overflow:'hidden' (to round the felt into its corners),
  // which would otherwise clip its own drop shadow. Width-capped so the panel
  // never grows past a phone-ish column on wide viewports; height is set
  // inline (capped and centered by the backdrop).
  panelShadow: {
    width: '100%',
    maxWidth: layout.maxTableWidth,
    shadowColor: colors.black,
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  // Row below the felt panel that hosts the (house-ad-placeholder) AdBanner.
  // Width-matched to the panel above (maxWidth set inline) so the banner reads
  // as part of the same column instead of stretching edge to edge on wide
  // viewports; a small horizontal inset keeps it off the screen edges on
  // narrow phones.
  adBannerSlot: {
    width: '100%',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  // The visible table: felt-filled, gold-framed, rounded, clipping its
  // children so the felt and content share one box. Solid felt color base
  // shows through while the tile image loads.
  panel: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.felt,
    borderWidth: 3,
    borderColor: colors.gold,
  },
  // The felt tile fills the panel; ImageBackground with resizeMode="repeat"
  // tiles a seamless weave so there is no single-image seam at any size.
  panelFelt: { flex: 1 },
  // Kept semi-faint over the solid felt color base so the weave reads as
  // texture, not noise.
  panelFeltImage: { opacity: 0.55 },
  // Inner gold hairline of the double-line frame, inset from the panel's
  // outer gold border. Lower alpha so the two lines read as a frame, not a
  // solid band.
  panelInnerFrame: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: 5,
    bottom: 5,
    borderWidth: 1,
    borderColor: withAlpha(colors.gold, 0.55),
  },
  // Three concentric low-alpha frames stand in for a radial gradient (no
  // gradient lib in this project); alpha rises toward the outer band so the
  // edges darken gradually. The alpha steps stay under ~0.06 apart and the
  // bands wide, because a larger step reads as a stacked frame rather than
  // a vignette.
  tableVignetteOuter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 14,
    borderColor: withAlpha(colors.black, 0.16),
  },
  tableVignetteMid: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    bottom: 14,
    borderWidth: 24,
    borderColor: withAlpha(colors.black, 0.1),
  },
  tableVignetteInner: {
    position: 'absolute',
    top: 38,
    left: 38,
    right: 38,
    bottom: 38,
    borderWidth: 34,
    borderColor: withAlpha(colors.black, 0.04),
  },
  container: { flex: 1, backgroundColor: 'transparent' },
});
