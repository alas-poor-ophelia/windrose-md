/**
 * VisibilityToolbar.jsx
 * Compact horizontal toolbar for toggling layer visibility
 * Overlays below the ToolPalette when eye button is clicked
 * Extended with Fog of War tools panel
 */

/**
 * VisibilityToolbar Component
 * @param {boolean} isOpen - Whether the toolbar is visible
 * @param {Object} layerVisibility - Current visibility state for each layer
 * @param {Function} onToggleLayer - Callback to toggle a layer's visibility
 * @param {string} mapType - 'grid' or 'hex' - hex coordinates only show for hex maps
 * @param {Object} fogOfWarState - { initialized, enabled, activeTool } - FoW state from active layer
 * @param {boolean} showFogTools - Whether FoW tools panel is expanded
 * @param {Function} onFogToolsToggle - Toggle FoW tools panel visibility
 * @param {Function} onFogToolSelect - Select a FoW tool ('paint', 'erase', 'rectangle', or null)
 * @param {Function} onFogVisibilityToggle - Toggle fog visibility
 * @param {Function} onFogFillAll - Fill all cells with fog
 * @param {Function} onFogClearAll - Clear all fog
 */
const VisibilityToolbar = ({ 
  isOpen, 
  layerVisibility, 
  onToggleLayer,
  mapType,
  // Fog of War props
  fogOfWarState = { initialized: false, enabled: false, activeTool: null },
  showFogTools = false,
  onFogToolsToggle,
  onFogToolSelect,
  onFogVisibilityToggle,
  onFogFillAll,
  onFogClearAll
}) => {
  const layers = [
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
  
  // Filter out hex-only layers for grid maps
  const visibleLayers = layers.filter(layer => !layer.hexOnly || mapType === 'hex');
  
  return (
    <div className={`dmt-visibility-toolbar ${isOpen ? 'dmt-visibility-toolbar-open' : ''}`}>
      {/* Existing layer visibility toggles */}
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
      
      {/* Separator */}
      <div className="dmt-visibility-separator" />
      
      {/* Fog of War Section */}
      <div className="dmt-fow-section">
        {/* FoW Toggle Button - always visible */}
        <button
          className={`dmt-fow-toggle-btn ${showFogTools ? 'expanded' : ''}`}
          onClick={onFogToolsToggle}
          title="Fog of War tools"
        >
          <dc.Icon icon="lucide-cloud-fog" />
          <span className="dmt-fow-label">Fog</span>
        </button>
        
        {/* Expandable FoW Tools Panel */}
        <div className={`dmt-fow-tools-panel ${showFogTools ? 'expanded' : ''}`}>
          {/* Visibility toggle */}
          <button
            className={`dmt-fow-tool-btn ${!fogOfWarState.enabled ? 'disabled' : ''}`}
            onClick={onFogVisibilityToggle}
            title={fogOfWarState.enabled ? "Hide fog overlay" : "Show fog overlay"}
            disabled={!fogOfWarState.initialized}
          >
            <dc.Icon icon={fogOfWarState.enabled ? "lucide-eye" : "lucide-eye-off"} />
          </button>
          
          {/* Paint (add fog) */}
          <button
            className={`dmt-fow-tool-btn ${fogOfWarState.activeTool === 'paint' ? 'active' : ''}`}
            onClick={() => onFogToolSelect && onFogToolSelect('paint')}
            title="Paint fog onto cells"
          >
            <dc.Icon icon="lucide-paintbrush" />
          </button>
          
          {/* Erase (reveal) */}
          <button
            className={`dmt-fow-tool-btn ${fogOfWarState.activeTool === 'erase' ? 'active' : ''}`}
            onClick={() => onFogToolSelect && onFogToolSelect('erase')}
            title="Erase fog (reveal cells)"
          >
            <dc.Icon icon="lucide-eraser" />
          </button>
          
          {/* Rectangle */}
          <button
            className={`dmt-fow-tool-btn ${fogOfWarState.activeTool === 'rectangle' ? 'active' : ''}`}
            onClick={() => onFogToolSelect && onFogToolSelect('rectangle')}
            title="Rectangle tool - click two corners"
          >
            <dc.Icon icon="lucide-square" />
          </button>
          
          {/* Fill All */}
          <button
            className="dmt-fow-tool-btn"
            onClick={onFogFillAll}
            title="Fill all painted cells with fog"
          >
            <dc.Icon icon="lucide-paint-bucket" />
          </button>
          
          {/* Clear All */}
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