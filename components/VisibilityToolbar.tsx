/**
 * VisibilityToolbar.tsx
 *
 * Compact horizontal toolbar for toggling layer visibility.
 * Overlays below the ToolPalette when eye button is clicked.
 * Extended with Fog of War tools panel.
 */

import type { MapType } from '#types/core/map.types';

/** Fog of War tool identifiers */
export type FogTool = 'paint' | 'erase' | 'rectangle' | null;

/** Fog of War state from active layer */
export interface FogOfWarState {
  initialized: boolean;
  enabled: boolean;
  activeTool: FogTool;
}

/** Layer visibility state */
export interface LayerVisibility {
  objects: boolean;
  textLabels: boolean;
  hexCoordinates?: boolean;
}

/** Layer definition for visibility toggles */
interface LayerDef {
  id: keyof LayerVisibility;
  icon: string;
  tooltip: string;
  hexOnly?: boolean;
}

/** Props for VisibilityToolbar component */
export interface VisibilityToolbarProps {
  /** Whether the toolbar is visible */
  isOpen: boolean;
  /** Current visibility state for each layer */
  layerVisibility: LayerVisibility;
  /** Callback to toggle a layer's visibility */
  onToggleLayer: (layerId: keyof LayerVisibility) => void;
  /** 'grid' or 'hex' - hex coordinates only show for hex maps */
  mapType: MapType;
  /** FoW state from active layer */
  fogOfWarState?: FogOfWarState;
  /** Whether FoW tools panel is expanded */
  showFogTools?: boolean;
  /** Toggle FoW tools panel visibility */
  onFogToolsToggle?: () => void;
  /** Select a FoW tool */
  onFogToolSelect?: (tool: FogTool) => void;
  /** Toggle fog visibility */
  onFogVisibilityToggle?: () => void;
  /** Fill all cells with fog */
  onFogFillAll?: () => void;
  /** Clear all fog */
  onFogClearAll?: () => void;
}

const VisibilityToolbar = ({
  isOpen,
  layerVisibility,
  onToggleLayer,
  mapType,
  fogOfWarState = { initialized: false, enabled: false, activeTool: null },
  showFogTools = false,
  onFogToolsToggle,
  onFogToolSelect,
  onFogVisibilityToggle,
  onFogFillAll,
  onFogClearAll
}: VisibilityToolbarProps): React.ReactElement => {
  const layers: LayerDef[] = [
    {
      id: 'objects',
      icon: 'lucide-boxes',
      tooltip: 'Toggle object visibility'
    },
    {
      id: 'textLabels',
      icon: 'lucide-type',
      tooltip: 'Toggle text label visibility'
    },
    {
      id: 'hexCoordinates',
      icon: 'lucide-key-round',
      tooltip: 'Toggle coordinate visibility (or hold C)',
      hexOnly: true
    }
  ];

  const visibleLayers = layers.filter(layer => !layer.hexOnly || mapType === 'hex');

  return (
    <div className={`dmt-visibility-toolbar ${isOpen ? 'dmt-visibility-toolbar-open' : ''}`}>
      {visibleLayers.map(layer => {
        const isVisible = layerVisibility[layer.id];

        return (
          <button
            key={layer.id}
            className={`dmt-visibility-btn ${!isVisible ? 'dmt-visibility-btn-hidden' : ''}`}
            onClick={() => onToggleLayer(layer.id)}
            title={`${layer.tooltip} (currently ${isVisible ? 'visible' : 'hidden'})`}
          >
            <dc.Icon icon={layer.icon} />
            {!isVisible && (
              <svg
                className="dmt-visibility-strikethrough"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <line
                  x1="4" y1="4"
                  x2="20" y2="20"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
        );
      })}

      <div className="dmt-visibility-separator" />

      <div className="dmt-fow-section">
        <button
          className={`dmt-fow-toggle-btn ${showFogTools ? 'expanded' : ''}`}
          onClick={onFogToolsToggle}
          title="Fog of War tools"
        >
          <dc.Icon icon="lucide-cloud-fog" />
          <span className="dmt-fow-label">Fog</span>
        </button>

        <div className={`dmt-fow-tools-panel ${showFogTools ? 'expanded' : ''}`}>
          <button
            className={`dmt-fow-tool-btn ${!fogOfWarState.enabled ? 'disabled' : ''}`}
            onClick={onFogVisibilityToggle}
            title={fogOfWarState.enabled ? "Hide fog overlay" : "Show fog overlay"}
            disabled={!fogOfWarState.initialized}
          >
            <dc.Icon icon={fogOfWarState.enabled ? "lucide-eye" : "lucide-eye-off"} />
          </button>

          <button
            className={`dmt-fow-tool-btn ${fogOfWarState.activeTool === 'paint' ? 'active' : ''}`}
            onClick={() => onFogToolSelect?.('paint')}
            title="Paint fog onto cells"
          >
            <dc.Icon icon="lucide-paintbrush" />
          </button>

          <button
            className={`dmt-fow-tool-btn ${fogOfWarState.activeTool === 'erase' ? 'active' : ''}`}
            onClick={() => onFogToolSelect?.('erase')}
            title="Erase fog (reveal cells)"
          >
            <dc.Icon icon="lucide-eraser" />
          </button>

          <button
            className={`dmt-fow-tool-btn ${fogOfWarState.activeTool === 'rectangle' ? 'active' : ''}`}
            onClick={() => onFogToolSelect?.('rectangle')}
            title="Rectangle tool - click two corners"
          >
            <dc.Icon icon="lucide-square" />
          </button>

          <button
            className="dmt-fow-tool-btn"
            onClick={onFogFillAll}
            title="Fill all painted cells with fog"
          >
            <dc.Icon icon="lucide-paint-bucket" />
          </button>

          <button
            className="dmt-fow-tool-btn"
            onClick={onFogClearAll}
            title="Clear all fog from layer"
          >
            <dc.Icon icon="lucide-x-square" />
          </button>
        </div>
      </div>
    </div>
  );
};

return { VisibilityToolbar };
