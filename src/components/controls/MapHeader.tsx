import type { VNode } from 'preact';
import type { MapData } from '#types/core/map.types';
import type { SaveStatus } from '#types/hooks/mapData.types';
import type { MapListEntry } from '../../persistence/fileOperations';

import { useCallback } from 'preact/hooks';
import { Icon } from '../shared/Icon';
import { tooltipRef } from '../shared/obsidianTooltip';

interface MapHeaderProps {
  mapData: MapData;
  onNameChange: (name: string) => void;
  saveStatus: SaveStatus;
  showFooter: boolean;
  onToggleFooter: () => void;
  fullPane?: boolean;
  mapId?: string;
  mapList?: MapListEntry[];
  onMapSelect?: (entry: MapListEntry) => void;
  onNewMap?: () => void;
  onDeleteMap?: () => void;
  /** Current sub-hex drill path; when set, the copied embed block opens this sub-map. */
  subHexPath?: string | null;
}

const MapHeader = ({ mapData, onNameChange, saveStatus, showFooter, onToggleFooter, fullPane, mapId, mapList, onMapSelect, onNewMap, onDeleteMap, subHexPath }: MapHeaderProps): VNode => {
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

  const getStatusTitle = (): SaveStatus => {
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
    if (mapId == null || mapId === '') return;
    const mapType = mapData.mapType || 'grid';
    const mapName = mapData.name ?? '';
    const block = [
      '```windrose-map',
      `id: ${mapId}`,
      `name: ${mapName}`,
      `type: ${mapType}`,
      // When drilled into a sub-hex, the block embeds that sub-map directly
      ...(subHexPath != null && subHexPath !== '' ? [`subhex: ${subHexPath}`] : []),
      '```'
    ].join('\n');
    void navigator.clipboard.writeText(block);
  }, [mapId, mapData.mapType, mapData.name, subHexPath]);

  return (
    <div className="windrose-header">
      {fullPane === true && (
        <div className="windrose-map-picker-group">
          {mapList && mapList.length > 0 && (
            <select
              className="windrose-map-picker"
              value={mapId ?? ''}
              onChange={handleMapChange}
              ref={tooltipRef('Switch map')}
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
              ref={tooltipRef('Create new map')}
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
        {fullPane === true && mapId != null && mapId !== '' && (
          <button
            className="windrose-header-action-btn interactive-child"
            onClick={handleCopyBlock}
            ref={tooltipRef('Copy as windrose-map code block')}
          >
            <Icon icon="lucide-copy" />
          </button>
        )}
        {fullPane === true && mapId != null && mapId !== '' && onDeleteMap && (
          <button
            className="windrose-header-action-btn windrose-header-action-btn--danger interactive-child"
            onClick={onDeleteMap}
            ref={tooltipRef('Delete map')}
          >
            <Icon icon="lucide-trash-2" />
          </button>
        )}
        <button
          className={`windrose-info-toggle ${showFooter ? 'windrose-info-toggle-active' : ''}`}
          onClick={onToggleFooter}
          ref={tooltipRef(showFooter ? 'Hide footer info' : 'Show footer info')}
        >
          <Icon icon="lucide-info" />
        </button>
        <span
          className={getStatusClass()}
          ref={tooltipRef(getStatusTitle())}
        >
          {getStatusIcon()}
        </span>
      </div>
    </div>
  );
};

export { MapHeader };
