import type { VNode } from 'preact';
import type { MapType } from '#types/core/map.types';
import type { FogToolId } from '#types/hooks/fog.types';
import type { LayerVisibility, FogOfWarState } from '../toolbars/VisibilityToolbar';

import { useCallback } from 'preact/hooks';
import { Modal } from 'obsidian';
import { useApp } from '../../context/AppContext';
import { Icon } from '../shared/Icon';

interface LayerDef {
  id: keyof LayerVisibility;
  icon: string;
  label: string;
  hexOnly?: boolean;
}

const LAYERS: LayerDef[] = [
  { id: 'grid', icon: 'lucide-grid-2x-2x', label: 'Grid' },
  { id: 'objects', icon: 'lucide-boxes', label: 'Objects' },
  { id: 'textLabels', icon: 'lucide-type', label: 'Labels' },
  { id: 'hexCoordinates', icon: 'lucide-key-round', label: 'Coords', hexOnly: true },
  { id: 'regions', icon: 'lucide-hexagon', label: 'Regions', hexOnly: true },
  { id: 'outlines', icon: 'lucide-spline', label: 'Outlines', hexOnly: true },
];

interface FogToolDef {
  id: FogToolId;
  icon: string;
  label: string;
}

const FOG_TOOLS: FogToolDef[] = [
  { id: 'paint', icon: 'lucide-paintbrush', label: 'Paint' },
  { id: 'erase', icon: 'lucide-eraser', label: 'Erase' },
  { id: 'rectangle', icon: 'lucide-square', label: 'Rect' },
];

interface DockViewPanelProps {
  currentZoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  layerVisibility: LayerVisibility;
  onToggleLayer: (layerId: keyof LayerVisibility) => void;
  mapType: MapType;
  onSettingsClick: () => void;
  fogOfWarState: FogOfWarState;
  onFogToolSelect: (tool: FogToolId) => void;
  onFogVisibilityToggle: () => void;
  onFogFillAll: () => void;
  onFogClearAll: () => void;
}

const DockViewPanel = ({
  currentZoom,
  onZoomIn,
  onZoomOut,
  layerVisibility,
  onToggleLayer,
  mapType,
  onSettingsClick,
  fogOfWarState,
  onFogToolSelect,
  onFogVisibilityToggle,
  onFogFillAll,
  onFogClearAll,
}: DockViewPanelProps): VNode => {
  const app = useApp();
  const visibleLayers = LAYERS.filter(l => l.hexOnly !== true || mapType === 'hex');

  const handleClearAll = useCallback(() => {
    const modal = new Modal(app);
    modal.titleEl.setText('Clear all fog');
    modal.contentEl.createEl('p', {
      text: 'This will remove all fog from the current layer. This cannot be undone.'
    });
    const buttonRow = modal.contentEl.createDiv({ cls: 'modal-button-container' });
    const cancelBtn = buttonRow.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => modal.close());
    const deleteBtn = buttonRow.createEl('button', { text: 'Clear all fog', cls: 'mod-warning' });
    deleteBtn.addEventListener('click', () => { modal.close(); onFogClearAll(); });
    modal.open();
  }, [app, onFogClearAll]);

  return (
    <div className="windrose-dock-view">
      <div className="windrose-dock-view-zoom">
        <button
          className="windrose-dock-view-zoom-btn"
          onClick={onZoomOut}
          title="Zoom out"
        >
          <Icon icon="lucide-minus" size={14} />
        </button>
        <span className="windrose-dock-view-zoom-level">
          {Math.round(currentZoom * 100)}%
        </span>
        <button
          className="windrose-dock-view-zoom-btn"
          onClick={onZoomIn}
          title="Zoom in"
        >
          <Icon icon="lucide-plus" size={14} />
        </button>
      </div>

      <div className="windrose-dock-view-section">
        <span className="windrose-dock-view-section-label">Visibility</span>
        <div className="windrose-dock-view-toggles">
          {visibleLayers.map(layer => {
            const isVisible = layerVisibility[layer.id] !== false;
            return (
              <button
                key={layer.id}
                className={`windrose-dock-view-toggle${isVisible ? '' : ' off'}`}
                onClick={() => onToggleLayer(layer.id)}
                title={`${layer.label} (${isVisible ? 'visible' : 'hidden'})`}
              >
                <Icon icon={layer.icon} size={14} />
                <span>{layer.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="windrose-dock-view-section">
        <span className="windrose-dock-view-section-label">Fog of War</span>
        <div className="windrose-dock-view-toggles">
          <button
            className={`windrose-dock-view-toggle${fogOfWarState.enabled ? '' : ' off'}`}
            onClick={onFogVisibilityToggle}
            title={fogOfWarState.enabled ? 'Hide fog overlay' : 'Show fog overlay'}
            disabled={!fogOfWarState.initialized}
          >
            <Icon icon={fogOfWarState.enabled ? 'lucide-eye' : 'lucide-eye-off'} size={14} />
            <span>{fogOfWarState.enabled ? 'Visible' : 'Hidden'}</span>
          </button>
          {FOG_TOOLS.map(tool => (
            <button
              key={tool.id}
              className={`windrose-dock-view-toggle${fogOfWarState.activeTool === tool.id ? ' active' : ''}`}
              onClick={() => onFogToolSelect(tool.id)}
              title={tool.label}
            >
              <Icon icon={tool.icon} size={14} />
              <span>{tool.label}</span>
            </button>
          ))}
        </div>
        <div className="windrose-dock-view-toggles">
          <button
            className="windrose-dock-view-toggle"
            onClick={onFogFillAll}
            title="Fill all painted cells with fog"
          >
            <Icon icon="lucide-paint-bucket" size={14} />
            <span>Fill All</span>
          </button>
          <button
            className="windrose-dock-view-toggle"
            onClick={handleClearAll}
            title="Clear all fog from layer"
          >
            <Icon icon="lucide-x-square" size={14} />
            <span>Clear All</span>
          </button>
        </div>
      </div>

      <div className="windrose-dock-view-footer">
        <button
          className="windrose-dock-view-settings"
          onClick={onSettingsClick}
          title="Map settings"
        >
          <Icon icon="lucide-settings" size={14} />
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
};

export { DockViewPanel };
export type { DockViewPanelProps };
