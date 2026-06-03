import type { VNode } from 'preact';
import type { MapData } from '#types/core/map.types';
import type { SaveStatus } from '#types/hooks/mapData.types';
import type { MapListEntry } from '../../persistence/fileOperations';

import { useCallback } from 'preact/hooks';
import { Icon } from '../shared/Icon';

interface MapHeaderProps {
  mapData: MapData;
  onNameChange: (name: string) => void;
  saveStatus: SaveStatus | string;
  showFooter: boolean;
  onToggleFooter: () => void;
  fullPane?: boolean;
  mapId?: string;
  mapList?: MapListEntry[];
  onMapSelect?: (entry: MapListEntry) => void;
  onNewMap?: () => void;
}

const MapHeader = ({ mapData, onNameChange, saveStatus, showFooter, onToggleFooter, fullPane, mapId, mapList, onMapSelect, onNewMap }: MapHeaderProps): VNode => {
  const getStatusIcon = (): string => {
    if (saveStatus === 'Unsaved changes') return '○';
    if (saveStatus === 'Saving...') return '⟳';
    if (saveStatus === 'Save failed') return '✗';
    return '✔';
  };

  const getStatusClass = (): string => {
    if (saveStatus === 'Unsaved changes') return 'windrose-save-status windrose-save-status-unsaved';
    if (saveStatus === 'Saving...') return 'windrose-save-status windrose-save-status-saving';
    if (saveStatus === 'Save failed') return 'windrose-save-status windrose-save-status-error';
    return 'windrose-save-status';
  };

  const getStatusTitle = (): SaveStatus | string => {
    return saveStatus;
  };

  const handleMapChange = useCallback((e: Event) => {
    const select = e.target as HTMLSelectElement;
    const entry = mapList?.find(m => m.id === select.value);
    if (entry && onMapSelect) {
      onMapSelect(entry);
    }
  }, [mapList, onMapSelect]);

  const handleCopyBlock = useCallback(() => {
    if (!mapId) return;
    const mapType = mapData.mapType || 'grid';
    const mapName = mapData.name || '';
    const block = [
      '```windrose-map',
      `id: ${mapId}`,
      `name: ${mapName}`,
      `type: ${mapType}`,
      '```'
    ].join('\n');
    navigator.clipboard.writeText(block);
  }, [mapId, mapData.mapType, mapData.name]);

  return (
    <div className="windrose-header">
      {fullPane && (
        <div className="windrose-map-picker-group">
          {mapList && mapList.length > 0 && (
            <select
              className="windrose-map-picker"
              value={mapId || ''}
              onChange={handleMapChange}
              title="Switch map"
            >
              {mapList.map(entry => (
                <option key={entry.id} value={entry.id}>
                  {entry.name || entry.id}
                </option>
              ))}
            </select>
          )}
          {onNewMap && (
            <button
              className="windrose-header-action-btn interactive-child"
              onClick={onNewMap}
              title="Create new map"
            >
              <Icon icon="lucide-plus" />
            </button>
          )}
        </div>
      )}

      <input
        type="text"
        className="windrose-map-name"
        placeholder="Map Name (optional)"
        value={mapData.name}
        onChange={(e) => onNameChange((e.target as HTMLInputElement).value)}
      />

      <div className="windrose-header-controls">
        {fullPane && mapId && (
          <button
            className="windrose-header-action-btn interactive-child"
            onClick={handleCopyBlock}
            title="Copy as windrose-map code block"
          >
            <Icon icon="lucide-copy" />
          </button>
        )}
        <button
          className={`windrose-info-toggle ${showFooter ? 'windrose-info-toggle-active' : ''}`}
          onClick={onToggleFooter}
          title={showFooter ? 'Hide footer info' : 'Show footer info'}
        >
          <Icon icon="lucide-info" />
        </button>
        <span
          className={getStatusClass()}
          title={getStatusTitle()}
        >
          {getStatusIcon()}
        </span>
      </div>
    </div>
  );
};

export { MapHeader };
