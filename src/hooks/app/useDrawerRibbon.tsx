// useDrawerRibbon.tsx - The full-pane drawer's vertical left ribbon: Tiles /
// Objects tabs, Recent / Starred view filters, and (on Tiles with a tile
// selected) the placement subtools.
// Memoized (STRUCT-A-06): a fresh VNode every render defeated TileAssetBrowser's
// memo(). The tooltipRef closures are captured once per dep change; their text
// is static, so that is safe.

import type { VNode } from 'preact';
import { useMemo } from 'preact/hooks';
import type { TileForm } from '#types/tiles/tile.types';
import type { TileSubtoolId } from '#types/tiles/tile.types';
import type { RailSelection } from '../../components/panels/TileAssetBrowser';
import { TileSubtoolRibbon } from '../../components/panels/TileSubtoolRibbon';
import { Icon } from '../../components/shared/Icon';
import { tooltipRef } from '../../components/shared/obsidianTooltip';

interface UseDrawerRibbonOptions {
  tilesEnabled: boolean;
  tilePane: 'tiles' | 'objects';
  selectPane: (pane: 'tiles' | 'objects') => void;
  tileRailSel: RailSelection;
  setTileRailSel: (sel: RailSelection) => void;
  selectedTileForm: TileForm | null;
  tileSubtool: TileSubtoolId | null;
  setTileSubtool: (id: TileSubtoolId) => void;
  handleThreshold: () => void;
  bareThresholdArmed: boolean;
}

function useDrawerRibbon({ tilesEnabled, tilePane, selectPane, tileRailSel, setTileRailSel, selectedTileForm, tileSubtool, setTileSubtool, handleThreshold, bareThresholdArmed }: UseDrawerRibbonOptions): VNode {
  return useMemo((): VNode => (
    <div className="windrose-fd-subrib">
      {tilesEnabled && <button className={`windrose-fd-ribtab interactive-child ${tilePane === 'tiles' ? 'on' : ''}`} ref={tooltipRef('Tiles')} onClick={() => selectPane('tiles')}><Icon icon="lucide-layout-dashboard" size={16} /></button>}
      <button className={`windrose-fd-ribtab interactive-child ${tilePane === 'objects' ? 'on' : ''}`} ref={tooltipRef('Objects')} onClick={() => selectPane('objects')}><Icon icon="lucide-sofa" size={16} /></button>
      {tilePane === 'tiles' && (
        <>
          <div className="windrose-fd-subrib-div" />
          <button className={`windrose-fd-ribtab interactive-child ${tileRailSel === 'recent' ? 'on' : ''}`} ref={tooltipRef('Recent')} onClick={() => setTileRailSel(tileRailSel === 'recent' ? 'all' : 'recent')}><Icon icon="lucide-clock" size={16} /></button>
          <button className={`windrose-fd-ribtab interactive-child ${tileRailSel === 'starred' ? 'on' : ''}`} ref={tooltipRef('Starred')} onClick={() => setTileRailSel(tileRailSel === 'starred' ? 'all' : 'starred')}><Icon icon="lucide-star" size={16} /></button>
        </>
      )}
      {tilePane === 'tiles' && selectedTileForm != null && (
        <>
          <div className="windrose-fd-subrib-div" />
          <div className="windrose-fd-subrib-cap">Mode</div>
          <TileSubtoolRibbon form={selectedTileForm} activeSubtool={tileSubtool} onSubtoolChange={setTileSubtool} onThreshold={handleThreshold} thresholdActive={bareThresholdArmed} />
        </>
      )}
    </div>
  ), [tilesEnabled, tilePane, tileRailSel, selectedTileForm, tileSubtool, setTileSubtool, handleThreshold, bareThresholdArmed, selectPane, setTileRailSel]);
}

export { useDrawerRibbon };
