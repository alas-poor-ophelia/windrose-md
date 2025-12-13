const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);
const { WindroseCompass } = await requireModuleByName("WindroseCompass.jsx");

// Timing constants - easy to tune
const COLLAPSE_DELAY_DESKTOP_MS = 800;   // Desktop: time after mouse leaves
const COLLAPSE_DELAY_TOUCH_MS = 3000;    // Touch: longer since no hover cue
const ITEM_STAGGER_MS = 40;              // Delay between each item's animation start
const ITEM_DURATION_MS = 180;            // How long each item takes to animate
const DRAWER_ITEM_COUNT = 4;             // Number of items in the bottom drawer

const MapControls = ({ 
  onZoomIn, 
  onZoomOut, 
  onCompassClick, 
  northDirection, 
  currentZoom, 
  isExpanded, 
  onToggleExpand, 
  onSettingsClick, 
  mapType, 
  showVisibilityToolbar, 
  onToggleVisibilityToolbar,
  showLayerPanel,
  onToggleLayerPanel
}) => {
    const [controlsRevealed, setControlsRevealed] = dc.useState(false);
    const collapseTimerRef = dc.useRef(null);
    
    // Detect device capabilities separately
    // Touch capability: needs tap-to-reveal and overlay
    // Hover capability: can use hover to reveal
    // iPad with trackpad has BOTH
    const hasTouchCapability = dc.useMemo(() => {
      return window.matchMedia('(pointer: coarse)').matches;
    }, []);
    
    const clearCollapseTimer = () => {
      if (collapseTimerRef.current) {
        clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = null;
      }
    };
    
    const startCollapseTimer = (forTouch = false) => {
      clearCollapseTimer();
      const delay = forTouch ? COLLAPSE_DELAY_TOUCH_MS : COLLAPSE_DELAY_DESKTOP_MS;
      collapseTimerRef.current = setTimeout(() => {
        setControlsRevealed(false);
      }, delay);
    };
    
    // Hover handlers - work on any device with hover capability
    const handleMouseEnter = () => {
      clearCollapseTimer();
      setControlsRevealed(true);
    };
    
    const handleMouseLeave = () => {
      startCollapseTimer(false); // desktop timing
    };
    
    // Compass click - works on all devices
    // If collapsed: reveal (tap-to-reveal for touch, or click-to-reveal)
    // If revealed: rotate compass
    const handleCompassClick = () => {
      if (!controlsRevealed) {
        // Reveal controls
        clearCollapseTimer();
        setControlsRevealed(true);
        // Start auto-collapse timer for touch interactions
        if (hasTouchCapability) {
          startCollapseTimer(true);
        }
      } else {
        // Controls already revealed - rotate compass
        onCompassClick();
        // Reset timer for touch users
        if (hasTouchCapability) {
          startCollapseTimer(true);
        }
      }
    };
    
    // Touch: tap outside to dismiss
    const handleOverlayClick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      clearCollapseTimer();
      setControlsRevealed(false);
    };
    
    // Reset collapse timer when interacting with controls (touch)
    const handleControlInteraction = (handler) => (e) => {
      if (hasTouchCapability && controlsRevealed) {
        startCollapseTimer(true);
      }
      handler(e);
    };
    
    // Cleanup timer on unmount
    dc.useEffect(() => {
      return () => clearCollapseTimer();
    }, []);
    
    // Stagger timing for bottom drawer items (indices 0-3)
    const getDrawerItemStyle = (index) => ({
      transitionDelay: controlsRevealed 
        ? `${(index + 1) * ITEM_STAGGER_MS}ms`
        : `${(DRAWER_ITEM_COUNT - index + 1) * ITEM_STAGGER_MS}ms`,
      transitionDuration: `${ITEM_DURATION_MS}ms`
    });
    
    // Expand button animates last on reveal, first on collapse
    const getExpandStyle = () => ({
      transitionDelay: controlsRevealed 
        ? `${(DRAWER_ITEM_COUNT + 1) * ITEM_STAGGER_MS}ms`
        : `0ms`,
      transitionDuration: `${ITEM_DURATION_MS}ms`
    });
    
    // Build compass tooltip based on state and capabilities
    const getCompassTitle = () => {
      if (!controlsRevealed && hasTouchCapability) {
        return "Tap to show controls";
      }
      if (mapType === 'hex') {
        return `North indicator at ${northDirection}° (visual only, ${hasTouchCapability ? 'tap' : 'click'} to rotate)`;
      }
      return `North is at ${northDirection}° (${hasTouchCapability ? 'tap' : 'click'} to rotate)`;
    };
    
    return (
      <>
        {/* Invisible overlay to capture taps outside controls (touch capable devices) */}
        {hasTouchCapability && controlsRevealed && (
          <div 
            className="dmt-controls-overlay"
            onClick={handleOverlayClick}
            onTouchStart={handleOverlayClick}
          />
        )}
        
        <div 
          className="dmt-controls"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Expand/Collapse Button - Above compass, animates last */}
          <button
            className={`dmt-expand-btn dmt-drawer-item dmt-drawer-item-up ${controlsRevealed ? 'dmt-drawer-item-visible' : ''}`}
            style={getExpandStyle()}
            onClick={handleControlInteraction(onToggleExpand)}
            title={isExpanded ? "Collapse to normal width" : "Expand to full width"}
          >
            <dc.Icon icon={isExpanded ? "lucide-minimize" : "lucide-expand"} />
          </button>
          
          {/* Compass Rose - Always visible anchor, slides down on reveal */}
          <div 
            className={`dmt-compass dmt-compass-animated ${controlsRevealed ? 'dmt-compass-revealed' : ''}`}
            onClick={handleCompassClick}
            title={getCompassTitle()}
          >
            <WindroseCompass rotation={northDirection} className="dmt-compass-svg" />
          </div>
          
          {/* Collapsible controls container - Below compass */}
          <div className={`dmt-controls-drawer ${controlsRevealed ? 'dmt-controls-drawer-open' : ''}`}>
            {/* Zoom Controls */}
            <div 
              className={`dmt-zoom-controls dmt-drawer-item ${controlsRevealed ? 'dmt-drawer-item-visible' : ''}`}
              style={getDrawerItemStyle(0)}
            >
              <button
                className="dmt-zoom-btn"
                onClick={handleControlInteraction(onZoomIn)}
                title="Zoom In"
              >
                +
              </button>
              <div className="dmt-zoom-level" title={`Zoom: ${Math.round(currentZoom * 100)}%`}>
                {Math.round(currentZoom * 100)}%
              </div>
              <button 
                className="dmt-zoom-btn"
                onClick={handleControlInteraction(onZoomOut)}
                title="Zoom Out"
              >
                -
              </button>
            </div>
            
            {/* Layer Panel Toggle Button */}
            <button
              className={`dmt-expand-btn dmt-drawer-item ${showLayerPanel ? 'dmt-expand-btn-active' : ''} ${controlsRevealed ? 'dmt-drawer-item-visible' : ''}`}
              style={getDrawerItemStyle(1)}
              onClick={handleControlInteraction(onToggleLayerPanel)}
              title="Toggle layer panel"
            >
              <dc.Icon icon="lucide-layers" />
            </button>
            
            {/* Visibility Toggle Button */}
            <button
              className={`dmt-expand-btn dmt-drawer-item ${showVisibilityToolbar ? 'dmt-expand-btn-active' : ''} ${controlsRevealed ? 'dmt-drawer-item-visible' : ''}`}
              style={getDrawerItemStyle(2)}
              onClick={handleControlInteraction(onToggleVisibilityToolbar)}
              title="Toggle layer visibility"
            >
              <dc.Icon icon="lucide-eye" />
            </button>
            
            {/* Settings Button */}
            <button
              className={`dmt-expand-btn dmt-drawer-item ${controlsRevealed ? 'dmt-drawer-item-visible' : ''}`}
              style={getDrawerItemStyle(3)}
              onClick={handleControlInteraction(onSettingsClick)}
              title="Map Settings"
            >
              <dc.Icon icon="lucide-settings" />
            </button>
          </div>
        </div>
      </>
    );
  };
  
  return { MapControls };