// panelBags.ts - One prop set per dockable panel (STRUCT-A-02 / DUP-02).
// DungeonMapTracker builds each bag ONCE per render; every host (block edge
// rail, full-pane dock column, floating panels) spreads the same bag, so a prop
// added to a panel is added in one place and the layouts cannot drift.

import type { ComponentProps } from 'preact';
import type { DockLayerListProps } from '../panels/DockLayerList';
import type { DockViewPanelProps } from '../panels/DockViewPanel';
import type { ColorPickerProps } from '../shared/ColorPicker';
import type { TileAssetBrowser } from '../panels/TileAssetBrowser';
import type { ObjectSidebar } from '../panels/ObjectSidebar';
import type { DrawerDock } from '../panels/DrawerDock';
import type { ToolPalette } from '../toolbars/ToolPalette';
import type { AlmanacPanelProps } from '../panels/AlmanacPanel';

type TileAssetBrowserProps = ComponentProps<typeof TileAssetBrowser>;

/** Tile browser props shared by every variant; layout-only props are added by TileBrowserHost. */
type TileBrowserBag = Omit<
  TileAssetBrowserProps,
  'compact' | 'hideHeader' | 'showRail' | 'ribbon' | 'tilesetConfigOpen' | 'onTilesetConfigOpenChange'
>;

/** Objects pane props shared by block and full-pane drawers (header/ribbon added per layout). */
type ObjectsPaneBag = Omit<ComponentProps<typeof ObjectSidebar>, 'hideHeader' | 'ribbon'>;

/** DrawerDock props shared by the block and full-pane tile drawers (sizing added per layout). */
type DrawerDockBag = Pick<
  ComponentProps<typeof DrawerDock>,
  'open' | 'onCollapse' | 'onExpand' | 'depth' | 'onDepthChange' | 'hidden' | 'onToggleHide'
  | 'flyoutRecent' | 'flyoutStarred' | 'onFlyoutSelect' | 'pane' | 'onPane' | 'tilesEnabled'
>;

/** Almanac props shared by the rail and dock copies (`active` is added per host). */
type AlmanacBag = Required<Pick<AlmanacPanelProps, 'areaId' | 'onAreaChange'>>;

/** ToolPalette props shared by the docked and floating palettes. */
type ToolPaletteBag = Omit<ComponentProps<typeof ToolPalette>, 'vertical' | 'dockButton'>;

interface PanelBags {
  layerList: DockLayerListProps;
  /** Docked/rail copy: onClose is a no-op; the floating copy overrides it. */
  colorPicker: ColorPickerProps;
  viewPanel: DockViewPanelProps;
  tileBrowser: TileBrowserBag;
  objectsPane: ObjectsPaneBag;
  drawer: DrawerDockBag;
  toolPalette: ToolPaletteBag;
  almanac: AlmanacBag;
}

export type { PanelBags, TileBrowserBag, ObjectsPaneBag, DrawerDockBag, ToolPaletteBag, AlmanacBag };
