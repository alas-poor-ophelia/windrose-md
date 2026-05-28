



// Timing constants - easy to tune

import type { VNode } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { WindroseCompass } from '../shared/WindroseCompass';
import { Icon } from '../shared/Icon';
const COLLAPSE_DELAY_DESKTOP_MS = 800;   // Desktop: time after mouse leaves
const COLLAPSE_DELAY_TOUCH_MS = 3000;    // Touch: longer since no hover cue
const ITEM_STAGGER_MS = 40;              // Delay between each item's animation start
const ITEM_DURATION_MS = 180;            // How long each item takes to animate
const DRAWER_ITEM_COUNT = 4;             // Number of items in the bottom drawer

interface MapControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCompassClick: () => void;
  northDirection: number;
  currentZoom: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSettingsClick: () => void;
  mapType: string;
  showVisibilityToolbar: boolean;
  onToggleVisibilityToolbar: () => void;
  showLayerPanel: boolean;
  onToggleLayerPanel: () => void;
  showRegionPanel?: boolean;
  onToggleRegionPanel?: () => void;
  alwaysShowControls?: boolean;
  hideExpand?: boolean;
}

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
  onToggleLayerPanel,
  showRegionPanel,
  onToggleRegionPanel,
  alwaysShowControls = false,
  hideExpand = false
}: MapControlsProps): VNode => {
    // When alwaysShowControls is true, controls are always visible
    const [controlsRevealed, setControlsRevealed] = useState(alwaysShowControls);
    const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    
    // Update revealed state when alwaysShowControls changes
    useEffect(() => {
      if (alwaysShowControls) {
        setControlsRevealed(true);
        clearCollapseTimer();
      }
    }, [alwaysShowControls]);
    
    // Detect device capabilities separately
    // Touch capability: needs tap-to-reveal and overlay
    // Hover capability: can use hover to reveal
    // iPad with trackpad has BOTH
    const hasTouchCapability = useMemo(() => {
      return window.matchMedia('(pointer: coarse)').matches;
    }, []);
    
    const clearCollapseTimer = (): void => {
      if (collapseTimerRef.current) {
        clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = null;
      }
    };
    
    const startCollapseTimer = (forTouch = false): void => {
      // Don't collapse if always showing controls
      if (alwaysShowControls) return;
      
      clearCollapseTimer();
      const delay = forTouch ? COLLAPSE_DELAY_TOUCH_MS : COLLAPSE_DELAY_DESKTOP_MS;
      collapseTimerRef.current = setTimeout(() => {
        setControlsRevealed(false);
      }, delay);
    };
    
    // Hover handlers - work on any device with hover capability
    const handleMouseEnter = (): void => {
      clearCollapseTimer();
      setControlsRevealed(true);
    };
    
    const handleMouseLeave = (): void => {
      startCollapseTimer(false); // desktop timing
    };
    
    // Compass click - works on all devices
    // If collapsed: reveal (tap-to-reveal for touch, or click-to-reveal)
    // If revealed or always showing: rotate compass
    const handleCompassClick = (): void => {
      if (alwaysShowControls || controlsRevealed) {
        // Controls already revealed or always showing - rotate compass
        onCompassClick();
        // Reset timer for touch users (only if not always showing)
        if (hasTouchCapability && !alwaysShowControls) {
          startCollapseTimer(true);
        }
      } else {
        // Reveal controls
        clearCollapseTimer();
        setControlsRevealed(true);
        // Start auto-collapse timer for touch interactions
        if (hasTouchCapability) {
          startCollapseTimer(true);
        }
      }
    };
    
    // Touch: tap outside to dismiss (only if not always showing)
    const handleOverlayClick = (e: Event): void => {
      if (alwaysShowControls) return;

      e.stopPropagation();
      e.preventDefault();
      clearCollapseTimer();
      setControlsRevealed(false);
    };

    // Reset collapse timer when interacting with controls (touch)
    const handleControlInteraction = (handler: (e: Event) => void) => (e: Event): void => {
      if (hasTouchCapability && controlsRevealed) {
        startCollapseTimer(true);
      }
      handler(e);
    };
    
    // Cleanup timer on unmount
    useEffect(() => {
      return () => clearCollapseTimer();
    }, []);
    
    // Stagger timing for bottom drawer items (indices 0-3)
    const getDrawerItemStyle = (index: number): Record<string, string> => ({
      transitionDelay: controlsRevealed 
        ? `${(index + 1) * ITEM_STAGGER_MS}ms`
        : `${(DRAWER_ITEM_COUNT - index + 1) * ITEM_STAGGER_MS}ms`,
      transitionDuration: `${ITEM_DURATION_MS}ms`
    });
    
    // Expand button animates last on reveal, first on collapse
    const getExpandStyle = (): Record<string, string> => ({
      transitionDelay: controlsRevealed 
        ? `${(DRAWER_ITEM_COUNT + 1) * ITEM_STAGGER_MS}ms`
        : `0ms`,
      transitionDuration: `${ITEM_DURATION_MS}ms`
    });
    
    // Build compass tooltip based on state and capabilities
    const getCompassTitle = (): string => {
      if (!controlsRevealed && !alwaysShowControls && hasTouchCapability) {
        return "Tap to show controls";
      }
      if (mapType === 'hex') {
        return `North indicator at ${northDirection}° (visual only, ${hasTouchCapability ? 'tap' : 'click'} to rotate)`;
      }
      return `North is at ${northDirection}° (${hasTouchCapability ? 'tap' : 'click'} to rotate)`;
    };
    
    return (
      <>
        {/* Invisible overlay to capture taps outside controls (touch capable devices, not when always showing) */}
        {hasTouchCapability && controlsRevealed && !alwaysShowControls && (
          <div 
            className="windrose-controls-overlay"
            onClick={handleOverlayClick}
            onTouchStart={handleOverlayClick}
          />
        )}
        
        <div 
          className="windrose-controls"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Expand/Collapse Button - Above compass, animates last */}
          {!hideExpand && (
            <button
              className={`windrose-expand-btn windrose-drawer-item windrose-drawer-item-up ${controlsRevealed ? 'windrose-drawer-item-visible' : ''}`}
              style={getExpandStyle()}
              onClick={handleControlInteraction(onToggleExpand)}
              title={isExpanded ? "Collapse to normal width" : "Expand to full width"}
            >
              <Icon icon={isExpanded ? "lucide-minimize" : "lucide-expand"} />
            </button>
          )}
          
          {/* Compass Rose - Always visible anchor, slides down on reveal */}
          <div 
            className={`windrose-compass windrose-compass-animated ${controlsRevealed ? 'windrose-compass-revealed' : ''}`}
            onClick={handleCompassClick}
            title={getCompassTitle()}
          >
            <WindroseCompass rotation={northDirection} className="windrose-compass-svg" />
          </div>
          
          {/* Collapsible controls container - Below compass */}
          <div className={`windrose-controls-drawer ${controlsRevealed ? 'windrose-controls-drawer-open' : ''}`}>
            {/* Zoom Controls */}
            <div 
              className={`windrose-zoom-controls windrose-drawer-item ${controlsRevealed ? 'windrose-drawer-item-visible' : ''}`}
              style={getDrawerItemStyle(0)}
            >
              <button
                className="windrose-zoom-btn"
                onClick={handleControlInteraction(onZoomIn)}
                title="Zoom In"
              >
                +
              </button>
              <div className="windrose-zoom-level" title={`Zoom: ${Math.round(currentZoom * 100)}%`}>
                {Math.round(currentZoom * 100)}%
              </div>
              <button 
                className="windrose-zoom-btn"
                onClick={handleControlInteraction(onZoomOut)}
                title="Zoom Out"
              >
                -
              </button>
            </div>
            
            {/* Layer Panel Toggle Button */}
            <button
              className={`windrose-expand-btn windrose-drawer-item ${showLayerPanel ? 'windrose-expand-btn-active' : ''} ${controlsRevealed ? 'windrose-drawer-item-visible' : ''}`}
              style={getDrawerItemStyle(1)}
              onClick={handleControlInteraction(onToggleLayerPanel)}
              title="Toggle layer panel"
            >
              <Icon icon="lucide-layers" />
            </button>
            
            {/* Region Panel Toggle Button (hex maps only) */}
            {mapType === 'hex' && onToggleRegionPanel && (
              <button
                className={`windrose-expand-btn windrose-drawer-item ${showRegionPanel === true ? 'windrose-expand-btn-active' : ''} ${controlsRevealed ? 'windrose-drawer-item-visible' : ''}`}
                style={getDrawerItemStyle(2)}
                onClick={handleControlInteraction(onToggleRegionPanel)}
                title="Toggle region panel"
              >
                <Icon icon="lucide-map" />
              </button>
            )}

            {/* Visibility Toggle Button */}
            <button
              className={`windrose-expand-btn windrose-drawer-item ${showVisibilityToolbar ? 'windrose-expand-btn-active' : ''} ${controlsRevealed ? 'windrose-drawer-item-visible' : ''}`}
              style={getDrawerItemStyle(
                2 + (mapType === 'hex' && onToggleRegionPanel ? 1 : 0)
              )}
              onClick={handleControlInteraction(onToggleVisibilityToolbar)}
              title="Toggle layer visibility"
            >
              <Icon icon="lucide-eye" />
            </button>

            {/* Settings Button */}
            <button
              className={`windrose-expand-btn windrose-drawer-item ${controlsRevealed ? 'windrose-drawer-item-visible' : ''}`}
              style={getDrawerItemStyle(
                3 + (mapType === 'hex' && onToggleRegionPanel ? 1 : 0)
              )}
              onClick={handleControlInteraction(onSettingsClick)}
              title="Map Settings"
            >
              <Icon icon="lucide-settings" />
            </button>
          </div>
        </div>
      </>
    );
  };
  
  export { MapControls };