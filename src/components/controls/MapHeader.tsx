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
    if (saveStatus === 'Unsaved changes') return 'windrose-save-status windrose-save-status-unsaved';
    if (saveStatus === 'Saving...') return 'windrose-save-status windrose-save-status-saving';
    if (saveStatus === 'Save failed') return 'windrose-save-status windrose-save-status-error';
    return 'windrose-save-status';
  };
  
  const getStatusTitle = (): SaveStatus | string => {
    return saveStatus; // Show full text in tooltip
  };
  
  return (
    <div className="windrose-header">
      <input
        type="text"
        className="windrose-map-name"
        placeholder="Map Name (optional)"
        value={mapData.name}
        onChange={(e) => onNameChange((e.target as HTMLInputElement).value)}
      />
      <div className="windrose-header-controls">
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