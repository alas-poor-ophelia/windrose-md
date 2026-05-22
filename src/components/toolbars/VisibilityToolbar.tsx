/**
 * VisibilityToolbar.tsx
 *
 * Compact horizontal toolbar for toggling layer visibility.
 * Overlays below the ToolPalette when eye button is clicked.
 * Extended with Fog of War tools panel.
 */

import type { MapType } from '#types/core/map.types';
import type { VNode } from 'preact';
import { Icon } from '../shared/Icon';

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
  grid: boolean;
  objects: boolean;
  textLabels: boolean;
  hexCoordinates?: boolean;
  regions?: boolean;
  outlines?: boolean;
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
  isOpen: boolean;
  layerVisibility: LayerVisibility;
  onToggleLayer: (layerId: keyof LayerVisibility) => void;
  mapType: MapType;
  showFogTools?: boolean;
  onFogToolsToggle?: () => void;
}

const VisibilityToolbar = ({
  isOpen,
  layerVisibility,
  onToggleLayer,
  mapType,
  showFogTools = false,
  onFogToolsToggle
}: VisibilityToolbarProps): VNode => {
  const layers: LayerDef[] = [
    {
      id: 'grid',
      icon: 'lucide-grid-2x-2x',
      tooltip: 'Toggle grid visibility'
    },
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
    },
    {
      id: 'regions',
      icon: 'lucide-hexagon',
      tooltip: 'Toggle region visibility',
      hexOnly: true
    },
    {
      id: 'outlines',
      icon: 'lucide-spline',
      tooltip: 'Toggle outline visibility',
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
            <Icon icon={layer.icon} />
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
          <Icon icon="lucide-cloud-fog" />
          <span className="dmt-fow-label">Fog</span>
        </button>
      </div>
    </div>
  );
};

export { VisibilityToolbar };