// BlockTileDrawer.tsx - Block-mode tile drawer (right sidebar): DrawerDock with
// the compact shared head (Tiles|Objects segmented control, grid/list toggle,
// hoisted tileset-config toggle, collapse) above the Tiles or Objects pane.

import type { VNode } from 'preact';
import { DrawerDock } from '../panels/DrawerDock';
import { ObjectSidebar } from '../panels/ObjectSidebar';
import { Icon } from '../shared/Icon';
import { tooltipRef } from '../shared/obsidianTooltip';
import { TileBrowserHost } from './TileBrowserHost';
import type { DrawerDockBag, ObjectsPaneBag, TileBrowserBag } from './panelBags';

type DrawerPane = 'tiles' | 'objects';
type DrawerViewMode = 'grid' | 'list';

interface CompactDrawerHeadProps {
  pane: DrawerPane;
  onSelectPane: (pane: DrawerPane) => void;
  tilesEnabled: boolean;
  /** The grid/list toggle serves whichever pane is active. */
  viewMode: DrawerViewMode;
  onViewModeChange: (mode: DrawerViewMode) => void;
  showTilesetConfigToggle: boolean;
  tilesetConfigOpen: boolean;
  onToggleTilesetConfig: () => void;
  onCollapse: () => void;
}

const CompactDrawerHead = ({ pane, onSelectPane, tilesEnabled, viewMode, onViewModeChange, showTilesetConfigToggle, tilesetConfigOpen, onToggleTilesetConfig, onCollapse }: CompactDrawerHeadProps): VNode => (
  <div className="windrose-cd-head">
    <div className="windrose-cd-paneseg interactive-child" role="group" aria-label="Tiles or Objects">
      {tilesEnabled && (
        <button
          className={`windrose-cd-segbtn ${pane === 'tiles' ? 'active' : ''}`}
          onClick={() => onSelectPane('tiles')}
        >Tiles</button>
      )}
      <button
        className={`windrose-cd-segbtn ${pane === 'objects' ? 'active' : ''}`}
        onClick={() => onSelectPane('objects')}
      >Objects</button>
    </div>
    <div className="windrose-cd-vtog interactive-child" role="group" aria-label="View mode">
      <button
        className={`windrose-tb-iconbtn ${viewMode === 'grid' ? 'active' : 'ghost'}`}
        ref={tooltipRef('Grid view')}
        aria-pressed={viewMode === 'grid'}
        onClick={() => onViewModeChange('grid')}
      ><Icon icon="lucide-layout-grid" size={14} /></button>
      <button
        className={`windrose-tb-iconbtn ${viewMode === 'list' ? 'active' : 'ghost'}`}
        ref={tooltipRef('List view')}
        aria-pressed={viewMode === 'list'}
        onClick={() => onViewModeChange('list')}
      ><Icon icon="lucide-list" size={14} /></button>
    </div>
    {showTilesetConfigToggle && (
      <button
        className={`windrose-tb-iconbtn interactive-child ${tilesetConfigOpen ? 'active' : 'ghost'}`}
        ref={tooltipRef('Tileset settings')}
        onClick={onToggleTilesetConfig}
      ><Icon icon="lucide-sliders-horizontal" size={14} /></button>
    )}
    <button
      className="windrose-tb-iconbtn ghost interactive-child windrose-cd-collapse"
      ref={tooltipRef('Collapse to edge')}
      onClick={onCollapse}
    ><Icon icon="lucide-panel-left-open" size={15} /></button>
  </div>
);

interface BlockTileDrawerProps {
  drawer: DrawerDockBag;
  tileBrowser: TileBrowserBag;
  objectsPane: ObjectsPaneBag;
  tileViewMode: DrawerViewMode;
  onTileViewModeChange: (mode: DrawerViewMode) => void;
  objectViewMode: DrawerViewMode;
  onObjectViewModeChange: (mode: DrawerViewMode) => void;
  hasTilesets: boolean;
  /** Block mode hides the tile browser's internal header, so the tileset-config
   *  toggle is hoisted into the compact drawer head (windrose-48j). Host-owned
   *  so it survives the drawer unmounting (picture frame, pane swap). */
  tilesetConfigOpen: boolean;
  onTilesetConfigOpenChange: (open: boolean) => void;
}

const BlockTileDrawer = ({ drawer, tileBrowser, objectsPane, tileViewMode, onTileViewModeChange, objectViewMode, onObjectViewModeChange, hasTilesets, tilesetConfigOpen, onTilesetConfigOpenChange }: BlockTileDrawerProps): VNode => {
  const pane = drawer.pane ?? 'tiles';
  const tilesEnabled = drawer.tilesEnabled ?? true;
  const onPane = drawer.onPane;
  return (
    <DrawerDock {...drawer} drawerWidth={240} ribbonWidth={46} fold compact>
      <div className="windrose-cd">
        <CompactDrawerHead
          pane={pane}
          onSelectPane={(p) => onPane?.(p)}
          tilesEnabled={tilesEnabled}
          viewMode={pane === 'tiles' ? tileViewMode : objectViewMode}
          onViewModeChange={pane === 'tiles' ? onTileViewModeChange : onObjectViewModeChange}
          showTilesetConfigToggle={pane === 'tiles' && hasTilesets}
          tilesetConfigOpen={tilesetConfigOpen}
          onToggleTilesetConfig={() => onTilesetConfigOpenChange(!tilesetConfigOpen)}
          onCollapse={drawer.onCollapse}
        />
        <div className="windrose-cd-main">
          {pane === 'objects' ? (
            <ObjectSidebar {...objectsPane} hideHeader />
          ) : (
            <TileBrowserHost
              bag={tileBrowser}
              variant="block"
              tilesetConfigOpen={tilesetConfigOpen}
              onTilesetConfigOpenChange={onTilesetConfigOpenChange}
            />
          )}
        </div>
      </div>
    </DrawerDock>
  );
};

export { BlockTileDrawer };
