// CanvasCornerControls.tsx - Controls drawn over the canvas corner: block-mode
// MapControls (zoom, compass, recenter, expand, settings, layers/regions rail
// toggles, visibility toolbar toggle) or, in full-pane, the standalone compass.

import type { VNode } from 'preact';
import type { MapData } from '#types/index';
import { MapControls } from '../controls/MapControls';
import { WindroseCompass } from '../shared/WindroseCompass';
import { tooltipRef } from '../shared/obsidianTooltip';

interface BlockControlsState {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRecenterView: () => void;
  onSettingsClick: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  railOpenId: string | null;
  setRailOpenId: (update: (prev: string | null) => string | null) => void;
  regionsEnabled: boolean;
  showVisibilityToolbar: boolean;
  setShowVisibilityToolbar: (show: boolean) => void;
  /** Closing the visibility toolbar also closes the fog tools it opened. */
  showFogTools: boolean;
  onFogToolsToggle: () => void;
  alwaysShowControls: boolean;
}

interface CanvasCornerControlsProps {
  mapData: MapData;
  onCompassClick: () => void;
  /** Block-mode controls; null in full-pane (compass only) or picture frame (nothing). */
  block: BlockControlsState | null;
  showStandaloneCompass: boolean;
}

const CanvasCornerControls = ({ mapData, onCompassClick, block, showStandaloneCompass }: CanvasCornerControlsProps): VNode => {
  const north = mapData.northDirection ?? 0;
  return (
    <>
      {block != null && (
        <MapControls
          onZoomIn={block.onZoomIn}
          onZoomOut={block.onZoomOut}
          onCompassClick={onCompassClick}
          onRecenterView={block.onRecenterView}
          onSettingsClick={block.onSettingsClick}
          northDirection={north}
          currentZoom={mapData.viewState?.zoom ?? 1}
          isExpanded={block.isExpanded}
          onToggleExpand={block.onToggleExpand}
          hideExpand={false}
          minimalControls
          mapType={mapData.mapType}
          showLayerPanel={block.railOpenId === 'layers'}
          onToggleLayerPanel={() => block.setRailOpenId(prev => prev === 'layers' ? null : 'layers')}
          showRegionPanel={block.railOpenId === 'regions'}
          onToggleRegionPanel={block.regionsEnabled ? () => block.setRailOpenId(prev => prev === 'regions' ? null : 'regions') : undefined}
          showVisibilityToolbar={block.showVisibilityToolbar}
          onToggleVisibilityToolbar={() => {
            const closing = block.showVisibilityToolbar;
            block.setShowVisibilityToolbar(!block.showVisibilityToolbar);
            if (closing && block.showFogTools) block.onFogToolsToggle();
          }}
          alwaysShowControls={block.alwaysShowControls}
        />
      )}
      {showStandaloneCompass && (
        <div
          className="windrose-compass-standalone"
          onClick={onCompassClick}
          ref={tooltipRef(`North: ${north}° — Click to rotate`)}
        >
          <WindroseCompass rotation={north} className="windrose-compass-svg" />
        </div>
      )}
    </>
  );
};

export { CanvasCornerControls };

