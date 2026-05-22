// components/MapHeader.jsx - Map name and save status header

import type { VNode } from 'preact';
import { Icon } from '../shared/Icon';
import type { MapData } from '#types/core/map.types';
import type { SaveStatus } from '#types/hooks/mapData.types';

interface MapHeaderProps {
  mapData: MapData;
  onNameChange: (name: string) => void;
  saveStatus: SaveStatus | string;
  showFooter: boolean;
  onToggleFooter: () => void;
}

const MapHeader = ({ mapData, onNameChange, saveStatus, showFooter, onToggleFooter }: MapHeaderProps): VNode => {
  // Determine icon and CSS class based on save status
  const getStatusIcon = (): string => {
    if (saveStatus === 'Unsaved changes') return '○';
    if (saveStatus === 'Saving...') return '⟳';
    if (saveStatus === 'Save failed') return '✗';
    return '✔'; // Saved
  };
  
  const getStatusClass = (): string => {
    if (saveStatus === 'Unsaved changes') return 'dmt-save-status dmt-save-status-unsaved';
    if (saveStatus === 'Saving...') return 'dmt-save-status dmt-save-status-saving';
    if (saveStatus === 'Save failed') return 'dmt-save-status dmt-save-status-error';
    return 'dmt-save-status';
  };
  
  const getStatusTitle = (): SaveStatus | string => {
    return saveStatus; // Show full text in tooltip
  };
  
  return (
    <div className="dmt-header">
      <input
        type="text"
        className="dmt-map-name"
        placeholder="Map Name (optional)"
        value={mapData.name}
        onChange={(e) => onNameChange((e.target as HTMLInputElement).value)}
      />
      <div className="dmt-header-controls">
        <button
          className={`dmt-info-toggle ${showFooter ? 'dmt-info-toggle-active' : ''}`}
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