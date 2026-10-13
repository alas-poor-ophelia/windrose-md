// TileBrowserHost.tsx - The one place TileAssetBrowser is rendered (STRUCT-A-02).
// Every variant spreads the same TileBrowserBag; the variant adds layout-only props.
//
// Floating variant (explicit decision, wave 8): it now publishes starred tiles
// (onStarredChange) and shares the per-map grid/list view mode, which the old
// floating copy silently dropped. It does NOT take the host's rail selection:
// the Recent/Starred filters live on the drawer ribbon, which the floating
// panel does not show, so a shared selection could strand it on a filter.
// It has no collapse and is always visible, so onCollapse/active are dropped.

import type { VNode } from 'preact';
import { TileAssetBrowser } from '../panels/TileAssetBrowser';
import type { TileBrowserBag } from './panelBags';

type TileBrowserVariant = 'block' | 'fullpane' | 'floating';

interface TileBrowserHostProps {
  bag: TileBrowserBag;
  variant: TileBrowserVariant;
  /** Full-pane only: the vertical drawer ribbon (memoized by the host). */
  ribbon?: VNode;
  /** Block only: tileset-config toggle hoisted into the compact drawer head. */
  tilesetConfigOpen?: boolean;
  onTilesetConfigOpenChange?: (open: boolean) => void;
}

const TileBrowserHost = ({ bag, variant, ribbon, tilesetConfigOpen, onTilesetConfigOpenChange }: TileBrowserHostProps): VNode => {
  if (variant === 'floating') {
    const { onCollapse: _collapse, active: _active, railSel: _railSel, onRailSelChange: _onRailSel, ...rest } = bag;
    return <TileAssetBrowser {...rest} />;
  }
  if (variant === 'block') {
    return (
      <TileAssetBrowser
        {...bag}
        tilesetConfigOpen={tilesetConfigOpen}
        onTilesetConfigOpenChange={onTilesetConfigOpenChange}
        compact
        hideHeader
      />
    );
  }
  return <TileAssetBrowser {...bag} showRail ribbon={ribbon} />;
};

export { TileBrowserHost };

