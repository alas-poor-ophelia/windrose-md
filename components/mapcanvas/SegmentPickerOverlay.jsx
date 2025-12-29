/**
 * SegmentPickerOverlay.jsx
 * 
 * Mobile-friendly picker for segment painting (partial cell painting).
 * Shows an enlarged view of the 8 triangular segments within a cell,
 * allowing users to tap or drag to toggle individual segments.
 * 
 * Used when the segmentDraw tool is active and user taps on a cell
 * on a touch device.
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { ModalPortal } = await requireModuleByName("ModalPortal.jsx");
const { SEGMENT_NAMES, SEGMENT_VERTICES, SEGMENT_TRIANGLES } = await requireModuleByName("dmtConstants.js");

/**
 * Calculate triangle path for SVG rendering
 * @param {string} segmentName - Segment name (nw, n, ne, etc.)
 * @param {number} size - Size of the cell display area
 * @returns {string} SVG path d attribute
 */
function getSegmentPath(segmentName, size) {
  const [v1Name, v2Name, v3Name] = SEGMENT_TRIANGLES[segmentName];
  
  const getPoint = (vertexName) => {
    const vertex = SEGMENT_VERTICES[vertexName];
    return {
      x: vertex.xRatio * size,
      y: vertex.yRatio * size
    };
  };
  
  const v1 = getPoint(v1Name);
  const v2 = getPoint(v2Name);
  const v3 = getPoint(v3Name);
  
  return `M ${v1.x} ${v1.y} L ${v2.x} ${v2.y} L ${v3.x} ${v3.y} Z`;
}

/**
 * SegmentPickerOverlay Component
 * 
 * @param {boolean} isOpen - Whether the picker is visible
 * @param {Object} cellCoords - {x, y} coordinates of the cell being edited
 * @param {Object} existingCell - Existing cell data (if editing), or null for new cell
 * @param {string} selectedColor - Currently selected paint color
 * @param {number} selectedOpacity - Currently selected paint opacity
 * @param {Function} onConfirm - Called with array of selected segment names
 * @param {Function} onCancel - Called when picker is dismissed
 * @param {Object} screenPosition - {x, y} screen position to anchor the picker near
 */
const SegmentPickerOverlay = ({
  isOpen,
  cellCoords,
  existingCell,
  selectedColor,
  selectedOpacity = 1,
  onConfirm,
  onCancel,
  screenPosition,
  savedSegments = [],
  initialRememberState = true
}) => {
  // Track which segments are currently selected in the picker
  const [selectedSegments, setSelectedSegments] = dc.useState(new Set());
  
  // "Remember selection" checkbox state
  const [rememberSelection, setRememberSelection] = dc.useState(initialRememberState);
  
  // Ref to track current selectedSegments for event handlers (avoids stale closure)
  const selectedSegmentsRef = dc.useRef(selectedSegments);
  selectedSegmentsRef.current = selectedSegments;
  
  // Track if user is dragging to select multiple segments
  const [isDragging, setIsDragging] = dc.useState(false);
  const dragModeRef = dc.useRef(null); // 'add' or 'remove' based on first segment touched
  
  // Ref to SVG element for touch handling
  const svgRef = dc.useRef(null);
  
  // Size of the segment display area
  const PICKER_SIZE = 200;
  
  // Initialize selected segments from existing cell when opening
  dc.useEffect(() => {
    if (isOpen && existingCell) {
      if (existingCell.segments) {
        // Segment cell - get filled segments
        const filled = Object.keys(existingCell.segments).filter(seg => existingCell.segments[seg]);
        setSelectedSegments(new Set(filled));
      } else if (existingCell.color) {
        // Simple (full) cell - all segments selected
        setSelectedSegments(new Set(SEGMENT_NAMES));
      } else {
        setSelectedSegments(new Set());
      }
    } else if (isOpen) {
      // New cell - use saved segments if "remember" was enabled, otherwise start empty
      if (savedSegments && savedSegments.length > 0) {
        setSelectedSegments(new Set(savedSegments));
      } else {
        setSelectedSegments(new Set());
      }
    }
    
    // Reset checkbox to match parent's state when opening
    if (isOpen) {
      setRememberSelection(initialRememberState);
    }
  }, [isOpen, existingCell, savedSegments, initialRememberState]);
  
  // Reset drag state when picker closes
  dc.useEffect(() => {
    if (!isOpen) {
      setIsDragging(false);
      dragModeRef.current = null;
    }
  }, [isOpen]);
  
  /**
   * Determine which segment a point is in based on angle from center
   * 
   * The segments are triangles from center to edge vertices, going clockwise:
   * - 'nw': 90° to 135° (C-TL-TM)
   * - 'n':  45° to 90°  (C-TM-TR)
   * - 'ne': 0° to 45°   (C-TR-RM)
   * - 'e':  315° to 360° (C-RM-BR)
   * - 'se': 270° to 315° (C-BR-BM)
   * - 's':  225° to 270° (C-BM-BL)
   * - 'sw': 180° to 225° (C-BL-LM)
   * - 'w':  135° to 180° (C-LM-TL)
   */
  const getSegmentAtPoint = (x, y) => {
    const centerX = PICKER_SIZE / 2;
    const centerY = PICKER_SIZE / 2;
    
    const dx = x - centerX;
    const dy = y - centerY;
    
    // Get angle in degrees (0 = right, counterclockwise in math coords)
    // With -dy because screen Y is inverted (down = positive)
    let angle = Math.atan2(-dy, dx) * (180 / Math.PI);
    if (angle < 0) angle += 360;
    
    // Map angle to segment based on actual triangle boundaries
    // Boundaries are at: 0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°
    if (angle >= 315) return 'e';    // 315° to 360°
    if (angle >= 270) return 'se';   // 270° to 315°
    if (angle >= 225) return 's';    // 225° to 270°
    if (angle >= 180) return 'sw';   // 180° to 225°
    if (angle >= 135) return 'w';    // 135° to 180°
    if (angle >= 90) return 'nw';    // 90° to 135°
    if (angle >= 45) return 'n';     // 45° to 90°
    return 'ne';                     // 0° to 45°
  };
  
  /**
   * Get touch/mouse position relative to the SVG element
   */
  const getRelativePosition = (e) => {
    if (!svgRef.current) return null;
    
    const rect = svgRef.current.getBoundingClientRect();
    let clientX, clientY;
    
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    // Scale coordinates if SVG is displayed at different size
    const scaleX = PICKER_SIZE / rect.width;
    const scaleY = PICKER_SIZE / rect.height;
    
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };
  
  /**
   * Handle segment toggle (tap or drag start)
   * Uses ref to access current state to avoid stale closures in event handlers
   */
  const handleSegmentInteraction = dc.useCallback((segment, isStart = false) => {
    if (!segment) return;
    
    if (isStart) {
      // Starting a new interaction - determine mode based on current state (use ref for current value)
      const isCurrentlySelected = selectedSegmentsRef.current.has(segment);
      dragModeRef.current = isCurrentlySelected ? 'remove' : 'add';
    }
    
    setSelectedSegments(prev => {
      const newSet = new Set(prev);
      if (dragModeRef.current === 'add') {
        newSet.add(segment);
      } else {
        newSet.delete(segment);
      }
      return newSet;
    });
  }, []); // Stable - uses refs for all external state
  
  // Use effect to attach touch event handlers directly to the SVG element
  // This is more reliable on iOS than React's synthetic events
  dc.useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !isOpen) return;
    
    let dragging = false;
    
    const handleStart = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const pos = getRelativePosition(e);
      if (!pos) return;
      
      const segment = getSegmentAtPoint(pos.x, pos.y);
      if (segment) {
        dragging = true;
        setIsDragging(true);
        handleSegmentInteraction(segment, true);
      }
    };
    
    const handleMove = (e) => {
      if (!dragging) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      const pos = getRelativePosition(e);
      if (!pos) return;
      
      const segment = getSegmentAtPoint(pos.x, pos.y);
      if (segment) {
        handleSegmentInteraction(segment, false);
      }
    };
    
    const handleEnd = (e) => {
      if (dragging) {
        e.preventDefault();
        e.stopPropagation();
      }
      dragging = false;
      setIsDragging(false);
      dragModeRef.current = null;
    };
    
    // Add both touch and mouse/pointer events
    svg.addEventListener('touchstart', handleStart, { passive: false });
    svg.addEventListener('touchmove', handleMove, { passive: false });
    svg.addEventListener('touchend', handleEnd, { passive: false });
    svg.addEventListener('touchcancel', handleEnd, { passive: false });
    svg.addEventListener('mousedown', handleStart);
    svg.addEventListener('mousemove', handleMove);
    svg.addEventListener('mouseup', handleEnd);
    svg.addEventListener('mouseleave', handleEnd);
    
    return () => {
      svg.removeEventListener('touchstart', handleStart);
      svg.removeEventListener('touchmove', handleMove);
      svg.removeEventListener('touchend', handleEnd);
      svg.removeEventListener('touchcancel', handleEnd);
      svg.removeEventListener('mousedown', handleStart);
      svg.removeEventListener('mousemove', handleMove);
      svg.removeEventListener('mouseup', handleEnd);
      svg.removeEventListener('mouseleave', handleEnd);
    };
  }, [isOpen, handleSegmentInteraction]); // handleSegmentInteraction is stable via useCallback
  
  // Early return if picker is not open
  if (!isOpen) return null;
  
  /**
   * Handle confirm button
   */
  const handleConfirm = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onConfirm(Array.from(selectedSegments), rememberSelection);
  };
  
  /**
   * Handle cancel/dismiss
   */
  const handleCancel = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onCancel();
  };
  
  /**
   * Handle overlay background click (dismiss)
   */
  const handleOverlayClick = (e) => {
    // Only close if clicking the overlay background, not the picker content
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };
  
  /**
   * Select all segments
   */
  const handleSelectAll = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedSegments(new Set(SEGMENT_NAMES));
  };
  
  /**
   * Clear all segments
   */
  const handleClearAll = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedSegments(new Set());
  };
  
  // Calculate picker position (centered on screen for mobile)
  const pickerStyle = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 2000
  };
  
  return (
    <ModalPortal>
      <div 
        className="dmt-segment-picker-overlay"
        onClick={handleOverlayClick}
        onTouchEnd={handleOverlayClick}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          zIndex: 1999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <div 
          className="dmt-segment-picker"
          onClick={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          style={{
            backgroundColor: '#1a1a1a',
            borderRadius: '12px',
            padding: '16px',
            border: '2px solid #c4a57b',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            minWidth: '260px'
          }}
        >
          {/* Header */}
          <div style={{
            color: '#c4a57b',
            fontSize: '14px',
            fontWeight: '600',
            marginBottom: '12px',
            textAlign: 'center',
            textTransform: 'uppercase',
            letterSpacing: '1px'
          }}>
            Select Segments
          </div>
          
          {/* Cell coordinate display */}
          <div style={{
            color: '#888',
            fontSize: '11px',
            textAlign: 'center',
            marginBottom: '12px'
          }}>
            Cell ({cellCoords?.x}, {cellCoords?.y})
          </div>
          
          {/* Segment picker SVG */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: '16px'
          }}>
            <svg
              ref={svgRef}
              width={PICKER_SIZE}
              height={PICKER_SIZE}
              viewBox={`0 0 ${PICKER_SIZE} ${PICKER_SIZE}`}
              style={{
                backgroundColor: '#2a2a2a',
                borderRadius: '8px',
                cursor: 'pointer',
                touchAction: 'none',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                WebkitTouchCallout: 'none'
              }}
            >
              {/* Grid lines for reference */}
              <line x1={PICKER_SIZE/2} y1="0" x2={PICKER_SIZE/2} y2={PICKER_SIZE} stroke="#444" strokeWidth="1" />
              <line x1="0" y1={PICKER_SIZE/2} x2={PICKER_SIZE} y2={PICKER_SIZE/2} stroke="#444" strokeWidth="1" />
              <line x1="0" y1="0" x2={PICKER_SIZE} y2={PICKER_SIZE} stroke="#444" strokeWidth="1" />
              <line x1={PICKER_SIZE} y1="0" x2="0" y2={PICKER_SIZE} stroke="#444" strokeWidth="1" />
              
              {/* Segment triangles */}
              {SEGMENT_NAMES.map(segmentName => {
                const isSelected = selectedSegments.has(segmentName);
                const path = getSegmentPath(segmentName, PICKER_SIZE);
                
                return (
                  <path
                    key={segmentName}
                    d={path}
                    fill={isSelected ? selectedColor : 'transparent'}
                    fillOpacity={isSelected ? selectedOpacity : 0}
                    stroke={isSelected ? '#c4a57b' : '#666'}
                    strokeWidth={isSelected ? 2 : 1}
                    style={{ pointerEvents: 'none' }}
                  />
                );
              })}
              
              {/* Segment labels */}
              {SEGMENT_NAMES.map(segmentName => {
                // Calculate label position at CENTER of each segment range
                // Segment ranges: ne=0-45, n=45-90, nw=90-135, w=135-180, sw=180-225, s=225-270, se=270-315, e=315-360
                const angles = {
                  ne: 22.5, n: 67.5, nw: 112.5, w: 157.5, sw: 202.5, s: 247.5, se: 292.5, e: 337.5
                };
                const angle = angles[segmentName] * (Math.PI / 180);
                const labelRadius = PICKER_SIZE * 0.35;
                const labelX = PICKER_SIZE/2 + Math.cos(angle) * labelRadius;
                const labelY = PICKER_SIZE/2 - Math.sin(angle) * labelRadius;
                const isSelected = selectedSegments.has(segmentName);
                
                return (
                  <text
                    key={`label-${segmentName}`}
                    x={labelX}
                    y={labelY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={isSelected ? '#fff' : '#888'}
                    fontSize="12"
                    fontWeight={isSelected ? '600' : '400'}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {segmentName.toUpperCase()}
                  </text>
                );
              })}
              
              {/* Center dot */}
              <circle
                cx={PICKER_SIZE/2}
                cy={PICKER_SIZE/2}
                r="4"
                fill="#c4a57b"
                style={{ pointerEvents: 'none' }}
              />
            </svg>
          </div>
          
          {/* Quick select buttons */}
          <div style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '16px',
            justifyContent: 'center'
          }}>
            <button
              onClick={handleSelectAll}
              style={{
                padding: '6px 12px',
                backgroundColor: '#333',
                border: '1px solid #555',
                borderRadius: '4px',
                color: '#ccc',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Select All
            </button>
            <button
              onClick={handleClearAll}
              style={{
                padding: '6px 12px',
                backgroundColor: '#333',
                border: '1px solid #555',
                borderRadius: '4px',
                color: '#ccc',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Clear All
            </button>
          </div>
          
          {/* Selection count */}
          <div style={{
            color: '#888',
            fontSize: '12px',
            textAlign: 'center',
            marginBottom: '12px'
          }}>
            {selectedSegments.size} of 8 segments selected
          </div>
          
          {/* Remember selection checkbox */}
          <label style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            color: '#aaa',
            fontSize: '12px',
            cursor: 'pointer',
            marginBottom: '16px',
            userSelect: 'none',
            WebkitUserSelect: 'none'
          }}>
            <input
              type="checkbox"
              checked={rememberSelection}
              onChange={(e) => setRememberSelection(e.target.checked)}
              style={{
                width: '16px',
                height: '16px',
                cursor: 'pointer',
                accentColor: '#c4a57b'
              }}
            />
            Remember selection for next cell
          </label>
          
          {/* Action buttons */}
          <div style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'center'
          }}>
            <button
              onClick={handleCancel}
              style={{
                padding: '10px 24px',
                backgroundColor: '#333',
                border: '1px solid #555',
                borderRadius: '6px',
                color: '#ccc',
                fontSize: '14px',
                cursor: 'pointer',
                minWidth: '80px'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              style={{
                padding: '10px 24px',
                backgroundColor: '#c4a57b',
                border: 'none',
                borderRadius: '6px',
                color: '#1a1a1a',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                minWidth: '80px'
              }}
            >
              Apply
            </button>
          </div>
          
          {/* Help text */}
          <div style={{
            color: '#666',
            fontSize: '11px',
            textAlign: 'center',
            marginTop: '12px'
          }}>
            Tap or drag to toggle segments
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

return { SegmentPickerOverlay };