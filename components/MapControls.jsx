const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);
const { WindroseCompass } = await requireModuleByName("WindroseCompass.jsx");

const MapControls = ({ onZoomIn, onZoomOut, onCompassClick, northDirection, currentZoom, isExpanded, onToggleExpand, onSettingsClick, mapType, showVisibilityToolbar, onToggleVisibilityToolbar }) => {
    return (
      <div className="dmt-controls">
        {/* Expand/Collapse Button */}
        <button
          className="dmt-expand-btn"
          onClick={onToggleExpand}
          title={isExpanded ? "Collapse to normal width" : "Expand to full width"}
        >
          <dc.Icon icon={isExpanded ? "lucide-minimize" : "lucide-expand"} />
        </button>
        
        {/* Compass Rose */}
        <div 
          className={`dmt-compass ${mapType === 'hex' ? 'dmt-compass-disabled' : ''}`}
          onClick={mapType === 'hex' ? () => {} : onCompassClick}
          title={mapType === 'hex' 
            ? "Map rotation temporarily disabled (coordinate key feature in development)"
            : `North is at ${northDirection}° (click to rotate)`
          }
        >
          <WindroseCompass rotation={northDirection} className="dmt-compass-svg" />
        </div>
        
        {/* Zoom Controls */}
        <div className="dmt-zoom-controls">
          <button
            className="dmt-zoom-btn"
            onClick={onZoomIn}
            title="Zoom In"
          >
            +
          </button>
          <div className="dmt-zoom-level" title={`Zoom: ${Math.round(currentZoom * 100)}%`}>
            {Math.round(currentZoom * 100)}%
          </div>
          <button 
            className="dmt-zoom-btn"
            onClick={onZoomOut}
            title="Zoom Out"
          >
            -
          </button>
        </div>
        
        {/* Visibility Toggle Button */}
        <button
          className={`dmt-expand-btn ${showVisibilityToolbar ? 'dmt-expand-btn-active' : ''}`}
          onClick={onToggleVisibilityToolbar}
          title="Toggle layer visibility"
        >
          <dc.Icon icon="lucide-eye" />
        </button>
        
        {/* Settings Button */}
        <button
          className="dmt-expand-btn"
          onClick={onSettingsClick}
          title="Map Settings"
        >
          <dc.Icon icon="lucide-settings" />
        </button>
      </div>
    );
  };
  
  return { MapControls };