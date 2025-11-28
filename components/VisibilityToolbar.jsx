/**
 * VisibilityToolbar.jsx
 * Compact horizontal toolbar for toggling layer visibility
 * Overlays below the ToolPalette when eye button is clicked
 */

/**
 * VisibilityToolbar Component
 * @param {boolean} isOpen - Whether the toolbar is visible
 * @param {Object} layerVisibility - Current visibility state for each layer
 * @param {Function} onToggleLayer - Callback to toggle a layer's visibility
 * @param {string} mapType - 'grid' or 'hex' - hex coordinates only show for hex maps
 */
const VisibilityToolbar = ({ 
  isOpen, 
  layerVisibility, 
  onToggleLayer,
  mapType 
}) => {
  if (!isOpen) return null;
  
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
    <div className="dmt-visibility-toolbar">
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
    </div>
  );
};

return { VisibilityToolbar };