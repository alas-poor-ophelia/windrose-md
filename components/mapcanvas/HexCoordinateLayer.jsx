/**
 * HexCoordinateLayer.jsx
 * Renders coordinate labels inside each visible hex
 * Supports two modes:
 * - Rectangular: A1, B2, etc. (column-row)
 * - Radial: 0, 1-1, 2-5, etc. (ring-position from center)
 * 
 * Uses HTML overlay positioned via viewport transforms (no canvas rendering)
 * Only renders for hex maps when showCoordinates is true (toggled by 'C' key)
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapState } = await requireModuleByName("MapContext.jsx");
const { useMapSelection } = await requireModuleByName("MapSelectionContext.jsx");
const { axialToOffset, offsetToAxial, columnToLabel, rowToLabel } = await requireModuleByName("offsetCoordinates.js");
const { getEffectiveSettings } = await requireModuleByName("settingsAccessor.js");

/**
 * Calculate the ring (distance from origin) for a hex in axial coordinates
 * Ring 0 = center, Ring 1 = 6 adjacent hexes, Ring 2 = 12 hexes, etc.
 * @param {number} q - Axial q coordinate
 * @param {number} r - Axial r coordinate
 * @returns {number} Ring number (0 = center)
 */
function getHexRing(q, r) {
  // Hex distance formula: (|q| + |q + r| + |r|) / 2
  return (Math.abs(q) + Math.abs(q + r) + Math.abs(r)) / 2;
}

/**
 * Check if a world-space point is inside a flat-topped regular hexagon
 * Used for creating flat-topped radial coordinate boundaries
 * A flat-topped hexagon has flat edges at top/bottom and pointed vertices at left/right
 * @param {number} wx - World X coordinate relative to hexagon center
 * @param {number} wy - World Y coordinate relative to hexagon center  
 * @param {number} circumradius - Distance from center to vertex
 * @returns {boolean} True if point is inside the hexagon
 */
function isInsideFlatToppedHexagon(wx, wy, circumradius) {
  const dx = Math.abs(wx);
  const dy = Math.abs(wy);
  const sqrt3 = Math.sqrt(3);
  
  // Flat-topped hexagon constraints:
  // 1. Top/bottom flat edges: |y| <= inradius (R * sqrt(3)/2)
  // 2. Four diagonal edges: |x| + |y|/sqrt(3) <= R
  const inradius = circumradius * sqrt3 / 2;
  return dy <= inradius && dx + dy / sqrt3 <= circumradius;
}

/**
 * Calculate position within a ring (1-indexed, clockwise from north)
 * @param {number} q - Axial q coordinate (relative to center)
 * @param {number} r - Axial r coordinate (relative to center)
 * @param {number} ring - The ring number
 * @returns {number} Position within ring (1 to 6*ring), or 0 for center
 */
function getPositionInRing(q, r, ring) {
  if (ring === 0) return 0;
  
  // The ring is divided into 6 edges, each with 'ring' hexes
  // We traverse clockwise starting from the "north" hex (0, -ring)
  
  // Direction vectors for traversing each edge of the ring clockwise
  // These move along the ring, not toward center
  const directions = [
    { dq: 1, dr: 0 },   // Edge 0: E (moving from N toward NE corner)
    { dq: 0, dr: 1 },   // Edge 1: SE (moving from NE toward SE corner)
    { dq: -1, dr: 1 },  // Edge 2: SW (moving from SE toward S corner)
    { dq: -1, dr: 0 },  // Edge 3: W (moving from S toward SW corner)
    { dq: 0, dr: -1 },  // Edge 4: NW (moving from SW toward NW corner)
    { dq: 1, dr: -1 }   // Edge 5: NE (moving from NW back toward N)
  ];
  
  // Starting hex of the ring (top/north hex): q=0, r=-ring
  let currentQ = 0;
  let currentR = -ring;
  let position = 1;
  
  for (let edge = 0; edge < 6; edge++) {
    for (let step = 0; step < ring; step++) {
      if (currentQ === q && currentR === r) {
        return position;
      }
      currentQ += directions[edge].dq;
      currentR += directions[edge].dr;
      position++;
    }
  }
  
  // Should not reach here for valid ring hexes
  return position;
}

/**
 * Calculate visible hexes with screen positions (in display coordinates)
 * Supports both rectangular and radial display modes
 * @param {Object} geometry - HexGeometry instance
 * @param {Object} mapData - Map data with viewState
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {string} displayMode - 'rectangular' or 'radial'
 * @returns {{hexes: Array<{col, row, q, r, displayX, displayY, label}>, scaleX: number, scaleY: number}} Visible hexes with display positions and scale factors
 */
function getVisibleHexes(geometry, mapData, canvas, displayMode = 'rectangular') {
  if (!canvas || !geometry || !mapData) return { hexes: [], scaleX: 1, scaleY: 1 };
  
  const { viewState, northDirection } = mapData;
  const { zoom, center } = viewState;
  
  // Calculate offset from center (hex maps use world pixel coordinates for center)
  const offsetX = canvas.width / 2 - center.x * zoom;
  const offsetY = canvas.height / 2 - center.y * zoom;
  
  // Get canvas display rect for coordinate scaling
  const rect = canvas.getBoundingClientRect();
  const containerRect = canvas.parentElement?.getBoundingClientRect() || rect;
  
  // Calculate canvas offset within container (due to flex centering)
  const canvasOffsetX = rect.left - containerRect.left;
  const canvasOffsetY = rect.top - containerRect.top;
  
  // Scale factors from canvas internal to display coordinates
  const scaleX = rect.width / canvas.width;
  const scaleY = rect.height / canvas.height;
  
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  
  // Helper to convert axial coords to display position
  const getDisplayPosition = (q, r) => {
    const { worldX, worldY } = geometry.hexToWorld(q, r);
    
    let screenX = offsetX + worldX * zoom;
    let screenY = offsetY + worldY * zoom;
    
    // Apply rotation if north direction is set
    if (northDirection !== 0) {
      const relX = screenX - centerX;
      const relY = screenY - centerY;
      
      const angleRad = (northDirection * Math.PI) / 180;
      const rotatedX = relX * Math.cos(angleRad) - relY * Math.sin(angleRad);
      const rotatedY = relX * Math.sin(angleRad) + relY * Math.cos(angleRad);
      
      screenX = centerX + rotatedX;
      screenY = centerY + rotatedY;
    }
    
    // Check if on screen
    const padding = 50;
    if (screenX < -padding || screenX > canvas.width + padding ||
        screenY < -padding || screenY > canvas.height + padding) {
      return null;
    }
    
    // Convert to display coordinates (CSS pixels)
    return {
      displayX: (screenX * scaleX) + canvasOffsetX,
      displayY: (screenY * scaleY) + canvasOffsetY
    };
  };
  
  const visibleHexes = [];
  
  if (displayMode === 'radial') {
    // Radial mode: iterate all hexes in bounds, check flat-topped hexagonal containment
    const hexBounds = mapData.hexBounds || { maxCol: 26, maxRow: 20 };
    
    // Calculate max radius based on smaller dimension (so pattern fits in bounds)
    const maxRadius = Math.floor(Math.min(hexBounds.maxCol, hexBounds.maxRow) / 2);
    
    // Use the center hex for both boundary and labeling (ensures consistency)
    const centerCol = Math.floor((hexBounds.maxCol - 1) / 2);
    const centerRow = Math.floor((hexBounds.maxRow - 1) / 2);
    const { q: centerQ, r: centerR } = offsetToAxial(centerCol, centerRow, geometry.orientation);
    
    // Get center position in world coordinates
    const centerWorld = geometry.hexToWorld(centerQ, centerR);
    
    // Calculate circumradius for flat-topped hexagonal boundary
    // The world-space distance to a ring boundary is ring * sqrt(3) * hexSize
    const sqrt3 = Math.sqrt(3);
    const circumradius = maxRadius * sqrt3 * geometry.hexSize;
    
    // Iterate all hexes in rectangular bounds
    for (let col = 0; col < hexBounds.maxCol; col++) {
      for (let row = 0; row < hexBounds.maxRow; row++) {
        const { q, r } = offsetToAxial(col, row, geometry.orientation);
        
        // Get this hex's world position relative to center
        const hexWorld = geometry.hexToWorld(q, r);
        const relWorldX = hexWorld.worldX - centerWorld.worldX;
        const relWorldY = hexWorld.worldY - centerWorld.worldY;
        
        // Check if inside flat-topped hexagonal boundary
        if (!isInsideFlatToppedHexagon(relWorldX, relWorldY, circumradius)) {
          continue;
        }
        
        // Calculate ring using hex distance from same center
        const dq = q - centerQ;
        const dr = r - centerR;
        const ring = getHexRing(dq, dr);
        
        const pos = getDisplayPosition(q, r);
        if (!pos) continue;
        
        // Calculate position within ring
        let label;
        if (ring === 0) {
          label = "â—ˆ";
        } else {
          const position = getPositionInRing(dq, dr, ring);
          label = `${ring}-${position}`;
        }
        
        visibleHexes.push({ 
          col, row, q, r, 
          displayX: pos.displayX, 
          displayY: pos.displayY,
          label 
        });
      }
    }
  } else {
    // Rectangular mode: iterate by offset coordinates within bounds
    const { minQ, maxQ, minR, maxR } = geometry.getVisibleHexRange(
      offsetX, offsetY, canvas.width, canvas.height, zoom
    );
    
    // Convert axial visible range to offset bounds
    const offsetCorners = [];
    for (let q = minQ; q <= maxQ; q += (maxQ - minQ) || 1) {
      for (let r = minR; r <= maxR; r += (maxR - minR) || 1) {
        offsetCorners.push(axialToOffset(q, r, geometry.orientation));
      }
    }
    
    const minCol = Math.min(...offsetCorners.map(c => c.col));
    const maxCol = Math.max(...offsetCorners.map(c => c.col));
    const minRow = Math.min(...offsetCorners.map(c => c.row));
    const maxRow = Math.max(...offsetCorners.map(c => c.row));
    
    for (let col = minCol; col <= maxCol; col++) {
      for (let row = minRow; row <= maxRow; row++) {
        const { q, r } = offsetToAxial(col, row, geometry.orientation);
        
        // Check if within map bounds (if bounds are set)
        if (!geometry.isWithinBounds(q, r)) continue;
        
        const pos = getDisplayPosition(q, r);
        if (!pos) continue;
        
        const label = columnToLabel(col) + rowToLabel(row);
        
        visibleHexes.push({ 
          col, row, q, r, 
          displayX: pos.displayX, 
          displayY: pos.displayY,
          label 
        });
      }
    }
  }
  
  return { hexes: visibleHexes, scaleX, scaleY };
}

/**
 * HexCoordinateLayer Component
 * Renders coordinate labels over visible hexes
 * Reads display mode settings from mapData.settings
 */
const HexCoordinateLayer = () => {
  // Get shared state from contexts
  const { canvasRef, mapData, geometry } = useMapState();
  const { showCoordinates, layerVisibility } = useMapSelection();
  
  // C key (showCoordinates) overrides layerVisibility - if C is pressed, always show
  // Otherwise, respect the toolbar visibility setting
  const effectiveVisible = showCoordinates || layerVisibility.hexCoordinates;
  
  // Don't render if not effectively visible or not a hex map
  if (!effectiveVisible || !geometry || !mapData || mapData.mapType !== 'hex') {
    return null;
  }
  
  const canvas = canvasRef.current;
  if (!canvas) return null;
  
  // Get coordinate display settings from map settings (with defaults)
  const displayMode = mapData.settings?.coordinateDisplayMode || 'rectangular';
  
  // Get effective color settings (merges global with map-specific overrides)
  const effectiveSettings = getEffectiveSettings(mapData.settings);
  const textColor = effectiveSettings.coordinateTextColor || '#ffffff';
  const shadowColor = effectiveSettings.coordinateTextShadow || '#000000';
  
  // Calculate visible hexes with display positions and labels
  const { hexes: visibleHexes, scaleX } = getVisibleHexes(
    geometry, mapData, canvas, displayMode
  );
  
  // Calculate font size based on hex size and zoom, scaled to display coordinates
  const zoom = mapData.viewState.zoom;
  const hexSize = geometry.hexSize;
  const canvasFontSize = hexSize * zoom * 0.35;
  const fontSize = Math.max(8, Math.min(24, canvasFontSize * scaleX));
  
  // Determine if we should fade labels slightly (at very low zoom)
  const shouldFade = zoom < 0.4;
  const baseOpacity = shouldFade ? 0.7 : 0.85;
  
  // Generate text-shadow CSS for readability
  const textShadow = `
    -1px -1px 0 ${shadowColor},
    1px -1px 0 ${shadowColor},
    -1px 1px 0 ${shadowColor},
    1px 1px 0 ${shadowColor},
    0 0 4px ${shadowColor},
    0 0 8px ${shadowColor}
  `.trim();
  
  return (
    <div className="dmt-coordinate-layer">
      {visibleHexes.map(({ q, r, displayX, displayY, label }) => {
        return (
          <div
            key={`coord-${q}-${r}`}
            className="dmt-hex-coordinate"
            style={{
              position: 'absolute',
              left: `${displayX}px`,
              top: `${displayY}px`,
              transform: 'translate(-50%, -50%)',
              fontSize: `${fontSize}px`,
              opacity: baseOpacity,
              color: textColor,
              textShadow: textShadow
            }}
          >
            {label}
          </div>
        );
      })}
    </div>
  );
};

return { HexCoordinateLayer };