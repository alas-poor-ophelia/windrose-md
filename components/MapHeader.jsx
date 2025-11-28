// components/MapHeader.jsx - Map name and save status header

const MapHeader = ({ mapData, onNameChange, saveStatus, showFooter, onToggleFooter }) => {
  // Determine icon and CSS class based on save status
  const getStatusIcon = () => {
    if (saveStatus === 'Unsaved changes') return '○';
    if (saveStatus === 'Saving...') return '⟳';
    if (saveStatus === 'Save failed') return '✗';
    return '✔'; // Saved
  };
  
  const getStatusClass = () => {
    if (saveStatus === 'Unsaved changes') return 'dmt-save-status dmt-save-status-unsaved';
    if (saveStatus === 'Saving...') return 'dmt-save-status dmt-save-status-saving';
    if (saveStatus === 'Save failed') return 'dmt-save-status dmt-save-status-error';
    return 'dmt-save-status';
  };
  
  const getStatusTitle = () => {
    return saveStatus; // Show full text in tooltip
  };
  
  return (
    <div className="dmt-header">
      <input
        type="text"
        className="dmt-map-name"
        placeholder="Map Name (optional)"
        value={mapData.name}
        onChange={(e) => onNameChange(e.target.value)}
      />
      <div className="dmt-header-controls">
        <button
          className={`dmt-info-toggle ${showFooter ? 'dmt-info-toggle-active' : ''}`}
          onClick={onToggleFooter}
          title={showFooter ? 'Hide footer info' : 'Show footer info'}
        >
          <dc.Icon icon="lucide-info" />
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

return { MapHeader };