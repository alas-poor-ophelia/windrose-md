const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { getTheme, getEffectiveSettings } = await requireModuleByName("settingsAccessor.js");
const { buildCellLookup, calculateBordersOptimized } = await requireModuleByName("borderCalculator.js");
const { getObjectType } = await requireModuleByName("objectOperations.js");
const { getRenderChar } = await requireModuleByName("objectTypeResolver.js");
const { getCellColor } = await requireModuleByName("colorOperations.js");
const { getFontCss } = await requireModuleByName("fontOptions.js");
const { GridGeometry } = await requireModuleByName("GridGeometry.js");
const { HexGeometry } = await requireModuleByName("HexGeometry.js");
const { gridRenderer } = await requireModuleByName("gridRenderer.js");
const { hexRenderer } = await requireModuleByName("hexRenderer.js");
const { segmentRenderer } = await requireModuleByName("segmentRenderer.js");
const { getCachedImage } = await requireModuleByName("imageOperations.js");
const { getSlotOffset, getMultiObjectScale, getObjectsInCell } = await requireModuleByName("hexSlotPositioner.js");
const { offsetToAxial, axialToOffset } = await requireModuleByName("offsetCoordinates.js");
const { getActiveLayer, isCellFogged } = await requireModuleByName("layerAccessor.js");

/**
 * Get appropriate renderer for geometry type
 * @param {GridGeometry|HexGeometry} geometry
 * @returns {Object} Renderer object with render methods
 */
function getRenderer(geometry) {
  return geometry instanceof HexGeometry ? hexRenderer : gridRenderer;
}

function renderCanvas(canvas, fogCanvas, mapData, geometry, selectedItems = [], isResizeMode = false, theme = null, showCoordinates = false, layerVisibility = null) {
  if (!canvas) return;
  
  // Normalize selectedItems to array (backward compatibility)
  const itemsArray = Array.isArray(selectedItems) ? selectedItems : (selectedItems ? [selectedItems] : []);
  
  // Default layer visibility
  const visibility = layerVisibility || { objects: true, textLabels: true, hexCoordinates: true };
  
  // Get theme with current settings (use provided theme or fetch global)
  const THEME = theme || getTheme();
  
  // Extract active layer data (supports layer schema v2)
  const activeLayer = getActiveLayer(mapData);
  
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const { viewState, northDirection } = mapData;
  const { zoom, center } = viewState;
  
  // Clear canvas
  ctx.fillStyle = THEME.grid.background;
  ctx.fillRect(0, 0, width, height);
  
  // Save context and apply rotation
  ctx.save();
  
  // Translate to center, rotate, translate back
  ctx.translate(width / 2, height / 2);
  ctx.rotate((northDirection * Math.PI) / 180);
  ctx.translate(-width / 2, -height / 2);
  
  // Get appropriate renderer for this geometry
  const renderer = getRenderer(geometry);
  
  // Calculate viewport based on geometry type
  let scaledSize, offsetX, offsetY;
  
  if (geometry instanceof GridGeometry) {
    scaledSize = geometry.getScaledCellSize(zoom);
    // Grid: center is in grid cell coordinates, multiply by cell size
    offsetX = width / 2 - center.x * scaledSize;
    offsetY = height / 2 - center.y * scaledSize;
  } else {
    // HexGeometry: center is in world pixel coordinates, multiply by zoom only
    scaledSize = geometry.getScaledHexSize(zoom); // Get scaled hex size for object rendering
    offsetX = width / 2 - center.x * zoom;
    offsetY = height / 2 - center.y * zoom;
  }
  
  // Draw background image for hex maps (if available)
  // Must happen after offsetX/offsetY calculation but before grid rendering
  if (geometry instanceof HexGeometry && mapData.backgroundImage?.path) {
    const bgImage = getCachedImage(mapData.backgroundImage.path);
    if (bgImage && bgImage.complete && mapData.hexBounds) {
      // Get orientation from mapData (default to 'flat' for backward compatibility)
      const orientation = mapData.orientation || 'flat';
      
      // Calculate the ACTUAL bounding box of the hex grid in world coordinates
      // Offset coordinates create a parallelogram, not a rectangle, so we need to check all corners
      
      let minWorldX = Infinity, maxWorldX = -Infinity;
      let minWorldY = Infinity, maxWorldY = -Infinity;
      
      // Check all four corners of the offset grid
      const corners = [
        { col: 0, row: 0 },
        { col: mapData.hexBounds.maxCol - 1, row: 0 },
        { col: 0, row: mapData.hexBounds.maxRow - 1 },
        { col: mapData.hexBounds.maxCol - 1, row: mapData.hexBounds.maxRow - 1 }
      ];
      
      for (const corner of corners) {
        const { q, r } = offsetToAxial(corner.col, corner.row, orientation);
        const worldPos = geometry.hexToWorld(q, r);
        
        if (worldPos.worldX < minWorldX) minWorldX = worldPos.worldX;
        if (worldPos.worldX > maxWorldX) maxWorldX = worldPos.worldX;
        if (worldPos.worldY < minWorldY) minWorldY = worldPos.worldY;
        if (worldPos.worldY > maxWorldY) maxWorldY = worldPos.worldY;
      }
      
      // Account for hex extents beyond center points
      const hexExtentX = geometry.hexSize;
      const hexExtentY = geometry.hexSize * geometry.sqrt3 / 2;
      
      minWorldX -= hexExtentX;
      maxWorldX += hexExtentX;
      minWorldY -= hexExtentY;
      maxWorldY += hexExtentY;
      
      // Calculate world coordinate bounding box
      const worldWidth = maxWorldX - minWorldX;
      const worldHeight = maxWorldY - minWorldY;
      const worldCenterX = (minWorldX + maxWorldX) / 2;
      const worldCenterY = (minWorldY + maxWorldY) / 2;
      
      // Calculate image dimensions
      const imgWidth = bgImage.naturalWidth;
      const imgHeight = bgImage.naturalHeight;
      
      // Get offset values (default to 0 for backward compatibility)
      const imgOffsetX = mapData.backgroundImage.offsetX ?? 0;
      const imgOffsetY = mapData.backgroundImage.offsetY ?? 0;
      
      // Position image centered at grid center in screen coordinates
      // Apply user offset (scaled by zoom to maintain position at different zoom levels)
      const screenCenterX = offsetX + worldCenterX * zoom;
      const screenCenterY = offsetY + worldCenterY * zoom;
      const screenX = screenCenterX - (imgWidth * zoom) / 2 + (imgOffsetX * zoom);
      const screenY = screenCenterY - (imgHeight * zoom) / 2 + (imgOffsetY * zoom);
      
      // Apply opacity if specified (default to 1 for backward compatibility)
      const opacity = mapData.backgroundImage.opacity ?? 1;
      if (opacity < 1) {
        ctx.save();
        ctx.globalAlpha = opacity;
      }
      
      // Draw image with current zoom level
      ctx.drawImage(
        bgImage,
        screenX,
        screenY,
        imgWidth * zoom,
        imgHeight * zoom
      );
      
      // Restore opacity
      if (opacity < 1) {
        ctx.restore();
      }
    }
  }
  
  // Create renderer viewState object (transformed for screen coordinates)
  const rendererViewState = {
    x: offsetX,
    y: offsetY,
    zoom: zoom
  };
  
  // iOS defensive: Explicitly reset any potentially corrupted canvas state before grid rendering
  // This works around iOS canvas state corruption during memory pressure
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  
  // iOS defensive: Reset clipping region - critical for grid rendering
  // Grid extends beyond canvas bounds, so clip corruption breaks it completely
  // Note: We preserve the current transform (rotation) while resetting clip
  ctx.save();
  ctx.beginPath();
  // Create a very large clip region to ensure grid lines aren't clipped
  const largeClip = Math.max(width, height) * 4;
  ctx.rect(-largeClip, -largeClip, largeClip * 2, largeClip * 2);
  ctx.clip();
  ctx.restore();
  
  // Draw grid lines using renderer
  renderer.renderGrid(ctx, geometry, rendererViewState, { width, height }, true, {
    lineColor: THEME.grid.lines,
    lineWidth: THEME.grid.lineWidth || 1
  });
  
  // Draw filled cells using renderer
  if (activeLayer.cells && activeLayer.cells.length > 0) {
    // Add color to cells that don't have it (for backward compatibility)
    const cellsWithColor = activeLayer.cells.map(cell => ({
      ...cell,
      color: getCellColor(cell)
    }));
    
    // Separate cells into simple (full) and segment (partial) cells
    const { simpleCells, segmentCells } = segmentRenderer.separateCellsByType(cellsWithColor);
    
    // 1. Render simple cells (batch-optimized by color)
    if (simpleCells.length > 0) {
      renderer.renderPaintedCells(ctx, simpleCells, geometry, rendererViewState);
    }
    
    // 2. Render segment cells (triangle-based rendering)
    if (segmentCells.length > 0 && geometry instanceof GridGeometry) {
      segmentRenderer.renderSegmentCells(ctx, segmentCells, geometry, rendererViewState);
    }
    
    // 3. Render interior grid lines on top of painted cells (grid only)
    // These are slightly thinner than exterior lines for visual distinction
    // Note: Only needed for simple cells; segment cells have internal borders
    if (renderer.renderInteriorGridLines && simpleCells.length > 0) {
      renderer.renderInteriorGridLines(ctx, simpleCells, geometry, rendererViewState, {
        lineColor: THEME.grid.lines,
        lineWidth: THEME.grid.lineWidth || 1,
        interiorRatio: 0.5
      });
    }
    
    // Build a shared cell lookup from ALL cells (simple + segment)
    // This ensures border calculations see all neighbors correctly
    const allCellsLookup = buildCellLookup(cellsWithColor);
    
    // 4. Render smart borders for simple cells (grid only - hex renderer no-ops this)
    // Use the all-cells lookup so simple cells don't draw borders against segment cells
    if (simpleCells.length > 0) {
      renderer.renderCellBorders(
        ctx,
        simpleCells,
        geometry,
        rendererViewState,
        () => allCellsLookup,  // Return pre-built lookup instead of building from subset
        calculateBordersOptimized,
        {
          border: THEME.cells.border,
          borderWidth: THEME.cells.borderWidth
        }
      );
    }
    
    // 5. Render borders for segment cells (internal + external)
    if (segmentCells.length > 0 && geometry instanceof GridGeometry) {
      segmentRenderer.renderSegmentBorders(
        ctx,
        segmentCells,
        cellsWithColor,  // All cells for neighbor lookup
        geometry,
        rendererViewState,
        {
          border: THEME.cells.border,
          borderWidth: THEME.cells.borderWidth
        }
      );
    }
  }
  
  // Draw painted edges (grid maps only, after cells/borders)
  // Edges are custom-colored grid lines that overlay the base grid
  if (activeLayer.edges && activeLayer.edges.length > 0 && geometry instanceof GridGeometry) {
    renderer.renderEdges(ctx, activeLayer.edges, geometry, rendererViewState, {
      lineWidth: 1,
      borderWidth: THEME.cells.borderWidth
    });
  }
  
  // Draw objects (after cells and borders, so they appear on top)
  // Skip when coordinate overlay is visible or objects layer is hidden
  if (activeLayer.objects && activeLayer.objects.length > 0 && !showCoordinates && visibility.objects) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    for (const obj of activeLayer.objects) {
      const objType = getObjectType(obj.type);
      if (!objType) continue;
      
      // Skip rendering if object's cell(s) are fogged
      // For multi-cell objects, skip if ANY cell is fogged
      if (activeLayer.fogOfWar?.enabled) {
        const size = obj.size || { width: 1, height: 1 };
        const baseOffset = geometry.toOffsetCoords(obj.position.x, obj.position.y);
        
        let isUnderFog = false;
        
        if (geometry instanceof HexGeometry) {
          // Hex maps: objects occupy single hex, check just that cell
          isUnderFog = isCellFogged(activeLayer, baseOffset.col, baseOffset.row);
        } else {
          // Grid maps: check all cells the object covers
          for (let dx = 0; dx < size.width && !isUnderFog; dx++) {
            for (let dy = 0; dy < size.height && !isUnderFog; dy++) {
              if (isCellFogged(activeLayer, baseOffset.col + dx, baseOffset.row + dy)) {
                isUnderFog = true;
              }
            }
          }
        }
        
        if (isUnderFog) continue;
      }
      
      // Ensure size exists (backward compatibility)
      const size = obj.size || { width: 1, height: 1 };
      
      let { screenX, screenY } = geometry.gridToScreen(obj.position.x, obj.position.y, offsetX, offsetY, zoom);
      
      // Calculate base dimensions
      let objectWidth = size.width * scaledSize;
      let objectHeight = size.height * scaledSize;
      
      // For hex maps with multi-object support
      if (geometry instanceof HexGeometry) {
        // Count objects in same cell
        const cellObjects = getObjectsInCell(activeLayer.objects, obj.position.x, obj.position.y);
        const objectCount = cellObjects.length;
        
        if (objectCount > 1) {
          // Apply multi-object scaling
          const multiScale = getMultiObjectScale(objectCount);
          objectWidth *= multiScale;
          objectHeight *= multiScale;
          
          // Get this object's slot (default to index in cell if no slot assigned)
          let effectiveSlot = obj.slot;
          if (effectiveSlot === undefined || effectiveSlot === null) {
            // Legacy object without slot - assign based on position in cell objects array
            effectiveSlot = cellObjects.findIndex(o => o.id === obj.id);
          }
          
          // Get slot offset
          const { offsetX: slotOffsetX, offsetY: slotOffsetY } = getSlotOffset(
            effectiveSlot,
            objectCount,
            mapData.orientation || 'flat'
          );
          
          // Calculate hex center from the top-left position
          // gridToScreen returns top-left such that topLeft + scaledSize/2 = hexCenter
          const hexCenterX = screenX + scaledSize / 2;
          const hexCenterY = screenY + scaledSize / 2;
          
          // Apply slot offset to get object center
          // scaledSize = hexSize (radius), but hex width = 2 * hexSize
          // So we multiply by 2 * scaledSize to get offsets relative to hex width
          const hexWidth = scaledSize * 2;
          const objectCenterX = hexCenterX + slotOffsetX * hexWidth;
          const objectCenterY = hexCenterY + slotOffsetY * hexWidth;
          
          // Convert back to top-left for rendering
          screenX = objectCenterX - objectWidth / 2;
          screenY = objectCenterY - objectHeight / 2;
        }
        // Single object in hex: no changes needed, renders centered as before
      }
      
      // Apply alignment offset (edge snapping)
      const alignment = obj.alignment || 'center';
      if (alignment !== 'center') {
        const halfCell = scaledSize / 2;
        switch (alignment) {
          case 'north': screenY -= halfCell; break;
          case 'south': screenY += halfCell; break;
          case 'east': screenX += halfCell; break;
          case 'west': screenX -= halfCell; break;
        }
      }
      
      // Object center for rotation
      const centerX = screenX + objectWidth / 2;
      const centerY = screenY + objectHeight / 2;
      
      // Apply user-defined object scale (0.25 to 1.0, default 1.0)
      const objectScale = obj.scale ?? 1.0;
      
      // Object symbol sized to fit within the multi-cell bounds, with user scale applied
      const fontSize = Math.min(objectWidth, objectHeight) * 0.8 * objectScale;
      
      // Apply rotation if object has rotation property
      const rotation = obj.rotation || 0;
      if (rotation !== 0) {
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.translate(-centerX, -centerY);
      }
      
      // Get the character to render (handles both icons and symbols with fallback)
      const { char: renderChar, isIcon } = getRenderChar(objType);
      
      // Use RPGAwesome font for icons, Noto for symbols
      if (isIcon) {
        ctx.font = `${fontSize}px rpgawesome`;
      } else {
        ctx.font = `${fontSize}px 'Noto Emoji', 'Noto Sans Symbols 2', monospace`;
      }
      
      // Draw shadow/stroke for visibility
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = Math.max(2, fontSize * 0.08);
      ctx.strokeText(renderChar, centerX, centerY);
      
      // Draw the object symbol with object's color (defaults to white for backward compatibility)
      ctx.fillStyle = obj.color || '#ffffff';
      ctx.fillText(renderChar, centerX, centerY);
      
      // Restore context if we applied rotation
      if (rotation !== 0) {
        ctx.restore();
      }
      
      // Draw note badge if object has linkedNote (top-right corner)
      // Skip for note_pin objects as it's redundant
      if (obj.linkedNote && obj.type !== 'note_pin') {
        // Scale badge proportionally to object size, with reasonable limits
        // Cap at 30% of smallest object dimension to prevent overwhelming the object
        const maxBadgeSize = Math.min(objectWidth, objectHeight) * 0.3;
        const badgeSize = Math.min(maxBadgeSize, Math.max(8, scaledSize * 0.25));
        const badgeX = screenX + objectWidth - badgeSize - 3;  // Added 3px gap
        const badgeY = screenY + 3;  // Added 3px gap from top
        
        // Draw badge background circle
        ctx.fillStyle = 'rgba(74, 158, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(
          badgeX + badgeSize / 2,
          badgeY + badgeSize / 2,
          badgeSize / 2,
          0,
          Math.PI * 2
        );
        ctx.fill();
        
        // Draw scroll-text icon
        const badgeFontSize = badgeSize * 0.7;
        ctx.font = `${badgeFontSize}px 'Noto Emoji', 'Noto Sans Symbols 2', monospace`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          '\u{1F4DC}',
          badgeX + badgeSize / 2,
          badgeY + badgeSize / 2
        );
      }
      
      // Draw note indicator if object has a custom tooltip (bottom-right corner)
      if (obj.customTooltip) {
        const indicatorSize = Math.max(4, scaledSize * 0.12);
        const indicatorX = screenX + objectWidth - indicatorSize - 2;
        const indicatorY = screenY + objectHeight - indicatorSize - 2;
        
        // Draw small circular indicator in bottom-right corner
        ctx.fillStyle = '#4a9eff';
        ctx.beginPath();
        ctx.arc(
          indicatorX + indicatorSize / 2,
          indicatorY + indicatorSize / 2,
          indicatorSize / 2,
          0,
          Math.PI * 2
        );
        ctx.fill();
        
        // Add white border to indicator for visibility
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }
  
  // Draw text labels (after objects, before selection indicators)
  // Text labels use world pixel coordinates, not grid coordinates
  // Skip when coordinate overlay is visible or text layer is hidden
  if (activeLayer.textLabels && activeLayer.textLabels.length > 0 && !showCoordinates && visibility.textLabels) {
    for (const label of activeLayer.textLabels) {
      ctx.save();
      
      // Convert world coordinates to screen coordinates
      // Text labels store position in world pixels (independent of grid)
      const { screenX, screenY } = geometry.worldToScreen(label.position.x, label.position.y, offsetX, offsetY, zoom);
      
      // Translate to label position
      ctx.translate(screenX, screenY);
      
      // Apply label rotation (independent of map rotation)
      ctx.rotate((label.rotation * Math.PI) / 180);
      
      // Set font and alignment
      const fontSize = label.fontSize * zoom;
      const fontFamily = getFontCss(label.fontFace || 'sans');
      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Draw black outline (stroke) for visibility on any background
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeText(label.content, 0, 0);
      
      // Draw fill with label's color (defaults to white)
      ctx.fillStyle = label.color || '#ffffff';
      ctx.fillText(label.content, 0, 0);
      
      ctx.restore();
    }
  }
  
  // =========================================================================
  // FOG OF WAR RENDERING
  // Renders after all content but before selection handles
  // Blur passes go to fogCanvas (CSS blur applied), solid fill to main canvas
  // =========================================================================
  
  // Clear fog canvas if it exists but blur won't be used
  if (fogCanvas) {
    const fow = activeLayer.fogOfWar;
    const effectiveSettings = getEffectiveSettings(mapData.settings);
    const fowBlurEnabled = effectiveSettings?.fogOfWarBlurEnabled ?? false;
    
    if (!fow?.enabled || !fow?.foggedCells?.length || !fowBlurEnabled) {
      // Clear fog canvas and remove CSS blur when not in use
      const tempFogCtx = fogCanvas.getContext('2d');
      tempFogCtx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
      fogCanvas.style.filter = 'none';
    }
  }
  
  if (activeLayer.fogOfWar && activeLayer.fogOfWar.enabled && activeLayer.fogOfWar.foggedCells?.length > 0) {
    const fow = activeLayer.fogOfWar;
    
    // Get effective FoW settings (per-map override or global default)
    const effectiveSettings = getEffectiveSettings(mapData.settings);
    const fowColor = effectiveSettings.fogOfWarColor || '#000000';
    const fowOpacity = effectiveSettings.fogOfWarOpacity ?? 0.9;
    const fowImagePath = effectiveSettings.fogOfWarImage;
    const fowBlurEnabled = effectiveSettings.fogOfWarBlurEnabled ?? false;
    const fowBlurFactor = effectiveSettings.fogOfWarBlurFactor ?? 0.08;
    
    // Determine fill style: pattern from image, or solid color
    let fowFillStyle = null;
    let useGlobalAlpha = false;
    
    if (fowImagePath) {
      // Try to create pattern from tileable image
      const fowImage = getCachedImage(fowImagePath);
      if (fowImage && fowImage.complete && fowImage.naturalWidth > 0) {
        try {
          const pattern = ctx.createPattern(fowImage, 'repeat');
          if (pattern) {
            fowFillStyle = pattern;
            useGlobalAlpha = true; // Apply opacity via globalAlpha for patterns
          }
        } catch (e) {
          // Pattern creation failed, fall back to color
        }
      }
    }
    
    // Fall back to solid color (opacity applied via globalAlpha, not baked in)
    if (!fowFillStyle) {
      fowFillStyle = fowColor;
      useGlobalAlpha = true; // Use globalAlpha for opacity with solid colors too
    }
    
    // Calculate blur radius
    let blurRadius = 0;
    if (fowBlurEnabled) {
      const cellSize = geometry instanceof HexGeometry ? geometry.hexSize : geometry.cellSize;
      blurRadius = cellSize * fowBlurFactor * zoom;
    }
    
    // Set up fog canvas for blur passes if available and blur enabled
    let fogCtx = null;
    if (fogCanvas && fowBlurEnabled && blurRadius > 0) {
      fogCtx = fogCanvas.getContext('2d');
      
      // Ensure fog canvas dimensions match main canvas
      if (fogCanvas.width !== width || fogCanvas.height !== height) {
        fogCanvas.width = width;
        fogCanvas.height = height;
      }
      
      // Set CSS blur amount on the fog canvas element
      // This is what makes it work on iOS (unlike ctx.filter)
      const cssBlurAmount = Math.max(4, blurRadius * 0.6); // Tighter CSS blur
      fogCanvas.style.filter = `blur(${cssBlurAmount}px)`;
      
      // Clear fog canvas (before transform)
      fogCtx.clearRect(0, 0, width, height);
      
      // Apply same transforms as main canvas
      fogCtx.save();
      fogCtx.translate(width / 2, height / 2);
      fogCtx.rotate((northDirection * Math.PI) / 180);
      fogCtx.translate(-width / 2, -height / 2);
      
      // Set up fill style on fog canvas - always start with fallback color
      fogCtx.fillStyle = fowColor; // Default to fog color
      
      if (fowImagePath) {
        // Try to use pattern if image is loaded
        const fowImage = getCachedImage(fowImagePath);
        if (fowImage && fowImage.complete && fowImage.naturalWidth > 0) {
          const fogPattern = fogCtx.createPattern(fowImage, 'repeat');
          if (fogPattern) {
            fogCtx.fillStyle = fogPattern;
          }
        }
      }
    }
    
    // Apply fill style to main canvas
    ctx.fillStyle = fowFillStyle;
    
    // Apply opacity via globalAlpha (used for both patterns and solid colors now)
    const previousGlobalAlpha = ctx.globalAlpha;
    if (useGlobalAlpha) {
      ctx.globalAlpha = fowOpacity;
    }
    
    // Calculate visible bounds in grid/offset coordinates for viewport culling
    let visibleMinCol, visibleMaxCol, visibleMinRow, visibleMaxRow;
    
    if (geometry instanceof HexGeometry) {
      // For hex maps: calculate visible bounds based on viewport
      // Convert screen corners to world coordinates, then to offset coordinates
      const orientation = mapData.orientation || 'flat';
      const hexSize = geometry.hexSize;
      
      // Get screen corners in world coordinates
      const screenCorners = [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: 0, y: height },
        { x: width, y: height }
      ];
      
      // Convert screen corners to world coordinates
      const worldCorners = screenCorners.map(corner => ({
        worldX: (corner.x - width/2) / zoom + center.x,
        worldY: (corner.y - height/2) / zoom + center.y
      }));
      
      // Find bounding box in world coordinates
      const worldMinX = Math.min(...worldCorners.map(c => c.worldX)) - hexSize * 2;
      const worldMaxX = Math.max(...worldCorners.map(c => c.worldX)) + hexSize * 2;
      const worldMinY = Math.min(...worldCorners.map(c => c.worldY)) - hexSize * 2;
      const worldMaxY = Math.max(...worldCorners.map(c => c.worldY)) + hexSize * 2;
      
      // Convert to hex coordinates (approximate bounds)
      const bounds = mapData.hexBounds || { maxCol: 100, maxRow: 100 };
      visibleMinCol = 0;
      visibleMaxCol = bounds.maxCol;
      visibleMinRow = 0;
      visibleMaxRow = bounds.maxRow;
      
    } else {
      // For grid maps: simpler calculation
      const gridSize = geometry.cellSize;
      
      // Convert viewport corners to grid coordinates
      visibleMinCol = Math.floor((0 - offsetX) / scaledSize) - 1;
      visibleMaxCol = Math.ceil((width - offsetX) / scaledSize) + 1;
      visibleMinRow = Math.floor((0 - offsetY) / scaledSize) - 1;
      visibleMaxRow = Math.ceil((height - offsetY) / scaledSize) + 1;
      
      // Clamp to reasonable bounds
      const maxBound = mapData.dimensions ? Math.max(mapData.dimensions.width, mapData.dimensions.height) : 200;
      visibleMinCol = Math.max(0, visibleMinCol);
      visibleMaxCol = Math.min(maxBound, visibleMaxCol);
      visibleMinRow = Math.max(0, visibleMinRow);
      visibleMaxRow = Math.min(maxBound, visibleMaxRow);
    }
    
    // Render fog for visible fogged cells
    // Use combined path approach: trace all cells, then fill once
    // This allows single shadow computation instead of per-cell
    if (geometry instanceof HexGeometry) {
      // Hex map fog rendering with expanded edge blur
      const orientation = mapData.orientation || 'flat';
      
      // Build foggedSet for O(1) lookups
      const foggedSet = new Set(fow.foggedCells.map(c => `${c.col},${c.row}`));
      
      // Collect visible fog cells and identify edge cells
      const visibleFogCells = [];
      const edgeCells = [];
      
      for (const fogCell of fow.foggedCells) {
        const { col, row } = fogCell;
        
        // Skip if outside visible bounds
        if (col < visibleMinCol || col > visibleMaxCol || 
            row < visibleMinRow || row > visibleMaxRow) {
          continue;
        }
        
        visibleFogCells.push({ col, row });
        
        // Check if this is an edge cell (has at least one non-fogged neighbor)
        const { q, r } = offsetToAxial(col, row, orientation);
        const neighbors = geometry.getNeighbors(q, r);
        const isEdge = neighbors.some(n => {
          const { col: nCol, row: nRow } = axialToOffset(n.q, n.r, orientation);
          return !foggedSet.has(`${nCol},${nRow}`);
        });
        
        if (isEdge) {
          edgeCells.push({ col, row, q, r });
        }
      }
      
      // Helper to trace hex path at a given scale (1.0 = normal size)
      const traceHexPath = (q, r, scale = 1.0) => {
        const vertices = geometry.getHexVertices(q, r);
        
        if (scale === 1.0) {
          // Normal size - use vertices directly
          const first = geometry.worldToScreen(vertices[0].worldX, vertices[0].worldY, offsetX, offsetY, zoom);
          ctx.moveTo(first.screenX, first.screenY);
          for (let i = 1; i < vertices.length; i++) {
            const vertex = geometry.worldToScreen(vertices[i].worldX, vertices[i].worldY, offsetX, offsetY, zoom);
            ctx.lineTo(vertex.screenX, vertex.screenY);
          }
        } else {
          // Scaled - expand from center
          const center = geometry.hexToWorld(q, r);
          const screenCenter = geometry.worldToScreen(center.worldX, center.worldY, offsetX, offsetY, zoom);
          
          const scaledVertices = vertices.map(v => {
            const screen = geometry.worldToScreen(v.worldX, v.worldY, offsetX, offsetY, zoom);
            return {
              screenX: screenCenter.screenX + (screen.screenX - screenCenter.screenX) * scale,
              screenY: screenCenter.screenY + (screen.screenY - screenCenter.screenY) * scale
            };
          });
          
          ctx.moveTo(scaledVertices[0].screenX, scaledVertices[0].screenY);
          for (let i = 1; i < scaledVertices.length; i++) {
            ctx.lineTo(scaledVertices[i].screenX, scaledVertices[i].screenY);
          }
        }
        ctx.closePath();
      };
      
      // Helper to trace hex path on fog canvas (for blur passes)
      const traceHexPathOnFog = (q, r, scale = 1.0) => {
        if (!fogCtx) return;
        
        const vertices = geometry.getHexVertices(q, r);
        
        if (scale === 1.0) {
          const first = geometry.worldToScreen(vertices[0].worldX, vertices[0].worldY, offsetX, offsetY, zoom);
          fogCtx.moveTo(first.screenX, first.screenY);
          for (let i = 1; i < vertices.length; i++) {
            const vertex = geometry.worldToScreen(vertices[i].worldX, vertices[i].worldY, offsetX, offsetY, zoom);
            fogCtx.lineTo(vertex.screenX, vertex.screenY);
          }
        } else {
          const center = geometry.hexToWorld(q, r);
          const screenCenter = geometry.worldToScreen(center.worldX, center.worldY, offsetX, offsetY, zoom);
          
          const scaledVertices = vertices.map(v => {
            const screen = geometry.worldToScreen(v.worldX, v.worldY, offsetX, offsetY, zoom);
            return {
              screenX: screenCenter.screenX + (screen.screenX - screenCenter.screenX) * scale,
              screenY: screenCenter.screenY + (screen.screenY - screenCenter.screenY) * scale
            };
          });
          
          fogCtx.moveTo(scaledVertices[0].screenX, scaledVertices[0].screenY);
          for (let i = 1; i < scaledVertices.length; i++) {
            fogCtx.lineTo(scaledVertices[i].screenX, scaledVertices[i].screenY);
          }
        }
        fogCtx.closePath();
      };
      
      // Blur passes: draw edge cells to fog canvas (CSS blur will smooth them)
      // Render to fogCtx if available, otherwise use ctx with filter
      if (fowBlurEnabled && blurRadius > 0 && edgeCells.length > 0) {
        const baseOpacity = fowOpacity;
        const numPasses = 8;
        const maxExpansion = blurRadius / (geometry.hexSize * zoom); // Back to 1.0x - tighter radius
        
        // Use fog canvas if available (CSS blur), otherwise fall back to ctx.filter
        const targetCtx = fogCtx || ctx;
        const useFilterFallback = !fogCtx;
        const filterBlurAmount = blurRadius / numPasses;
        
        for (let i = 0; i < numPasses; i++) {
          const t = i / (numPasses - 1);
          const scale = 1.0 + (maxExpansion * (1.0 - t));
          // Higher starting opacity for visible bleed, tighter range
          const opacity = 0.50 + (0.30 * t); // Range: 0.50 to 0.80
          
          // Only use ctx.filter as fallback (iOS doesn't support it)
          if (useFilterFallback) {
            const passBlur = filterBlurAmount * (1.5 - t);
            targetCtx.filter = passBlur > 0.5 ? `blur(${passBlur}px)` : 'none';
          }
          
          targetCtx.beginPath();
          for (const { q, r } of edgeCells) {
            if (fogCtx) {
              traceHexPathOnFog(q, r, scale);
            } else {
              traceHexPath(q, r, scale);
            }
          }
          targetCtx.globalAlpha = baseOpacity * opacity;
          targetCtx.fill();
        }
        
        // Reset filter if we used it as fallback
        if (useFilterFallback) {
          ctx.filter = 'none';
        }
        
        // Restore opacity for final fill
        ctx.globalAlpha = useGlobalAlpha ? fowOpacity : 1;
      }
      
      // Final pass: all fog cells at normal size, full opacity (on main canvas)
      ctx.beginPath();
      for (const { col, row } of visibleFogCells) {
        const { q, r } = offsetToAxial(col, row, orientation);
        traceHexPath(q, r, 1.0);
      }
      ctx.fill();
      
      // Draw interior hex outlines on top of fog for cell visibility
      if (visibleFogCells.length > 1) {
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'; // Subtle white lines
        ctx.lineWidth = Math.max(1, 1 * zoom);
        
        for (const { col, row } of visibleFogCells) {
          const { q, r } = offsetToAxial(col, row, orientation);
          
          // Check if this hex has any fogged neighbors (making it an interior edge)
          const neighbors = geometry.getNeighbors(q, r);
          const hasFoggedNeighbor = neighbors.some(n => {
            const { col: nCol, row: nRow } = axialToOffset(n.q, n.r, orientation);
            return foggedSet.has(`${nCol},${nRow}`);
          });
          
          if (hasFoggedNeighbor) {
            const vertices = geometry.getHexVertices(q, r);
            
            ctx.beginPath();
            const first = geometry.worldToScreen(vertices[0].worldX, vertices[0].worldY, offsetX, offsetY, zoom);
            ctx.moveTo(first.screenX, first.screenY);
            
            for (let i = 1; i < vertices.length; i++) {
              const vertex = geometry.worldToScreen(vertices[i].worldX, vertices[i].worldY, offsetX, offsetY, zoom);
              ctx.lineTo(vertex.screenX, vertex.screenY);
            }
            
            ctx.closePath();
            ctx.stroke();
          }
        }
      }
      
    } else {
      // Grid map fog rendering with expanded edge blur
      
      // Build foggedSet for O(1) lookups
      const foggedSet = new Set(fow.foggedCells.map(c => `${c.col},${c.row}`));
      
      // Collect visible fog cells and identify edge cells
      const visibleFogCells = [];
      const edgeCells = [];
      
      for (const fogCell of fow.foggedCells) {
        const { col, row } = fogCell;
        
        // Skip if outside visible bounds
        if (col < visibleMinCol || col > visibleMaxCol || 
            row < visibleMinRow || row > visibleMaxRow) {
          continue;
        }
        
        visibleFogCells.push({ col, row });
        
        // Check if this is an edge cell (has at least one non-fogged cardinal neighbor)
        const isEdge = !foggedSet.has(`${col - 1},${row}`) ||  // left
                       !foggedSet.has(`${col + 1},${row}`) ||  // right
                       !foggedSet.has(`${col},${row - 1}`) ||  // top
                       !foggedSet.has(`${col},${row + 1}`);    // bottom
        
        if (isEdge) {
          edgeCells.push({ col, row });
        }
      }
      
      // Helper to add circle to path for soft blur effect
      const addCircleToPath = (targetCtx, col, row, radius) => {
        const centerX = offsetX + col * scaledSize + scaledSize / 2;
        const centerY = offsetY + row * scaledSize + scaledSize / 2;
        targetCtx.moveTo(centerX + radius, centerY);
        targetCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      };
      
      // Helper to add rect to path at a given scale (1.0 = normal size)
      const addRectToPath = (col, row, scale = 1.0) => {
        const centerX = offsetX + col * scaledSize + scaledSize / 2;
        const centerY = offsetY + row * scaledSize + scaledSize / 2;
        const size = scaledSize * scale;
        const halfSize = size / 2;
        ctx.rect(centerX - halfSize, centerY - halfSize, size, size);
      };
      
      // Blur passes: draw edge cells as circles to fog canvas (CSS blur will smooth them)
      // Render to fogCtx if available, otherwise use ctx with filter fallback
      if (fowBlurEnabled && blurRadius > 0 && edgeCells.length > 0) {
        const baseOpacity = fowOpacity;
        const numPasses = 8;
        
        const cellRadius = scaledSize / 2;
        const maxRadius = cellRadius + blurRadius; // Back to 1.0x - tighter radius
        
        // Use fog canvas if available (CSS blur), otherwise fall back to ctx.filter
        const targetCtx = fogCtx || ctx;
        const useFilterFallback = !fogCtx;
        const filterBlurAmount = blurRadius / numPasses;
        
        for (let i = 0; i < numPasses; i++) {
          const t = i / (numPasses - 1);
          const radius = maxRadius - (blurRadius * t); // Back to 1.0x
          // Higher starting opacity for visible bleed, tighter range
          const opacity = 0.50 + (0.30 * t); // Range: 0.50 to 0.80
          
          // Only use ctx.filter as fallback (iOS doesn't support it)
          if (useFilterFallback) {
            const passBlur = filterBlurAmount * (1.5 - t);
            targetCtx.filter = passBlur > 0.5 ? `blur(${passBlur}px)` : 'none';
          }
          
          targetCtx.beginPath();
          for (const { col, row } of edgeCells) {
            addCircleToPath(targetCtx, col, row, radius);
          }
          targetCtx.globalAlpha = baseOpacity * opacity;
          targetCtx.fill();
        }
        
        // Reset filter if we used it as fallback
        if (useFilterFallback) {
          ctx.filter = 'none';
        }
        
        // Restore opacity for final fill
        ctx.globalAlpha = useGlobalAlpha ? fowOpacity : 1;
      }
      
      // Final pass: all fog cells at normal size (squares), full opacity (on main canvas)
      ctx.beginPath();
      for (const { col, row } of visibleFogCells) {
        addRectToPath(col, row, 1.0);
      }
      ctx.fill();
      
      // Draw interior grid lines on top of fog for cell visibility
      if (visibleFogCells.length > 1) {
        const drawnLines = new Set();
        
        const interiorLineWidth = Math.max(1, 1 * zoom * 0.5); // Thinner interior lines
        const halfWidth = interiorLineWidth / 2;
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'; // Subtle white lines
        
        for (const { col, row } of visibleFogCells) {
          const screenX = offsetX + col * scaledSize;
          const screenY = offsetY + row * scaledSize;
          
          if (foggedSet.has(`${col + 1},${row}`)) {
            const lineKey = `v:${col + 1},${row}`;
            if (!drawnLines.has(lineKey)) {
              ctx.fillRect(
                screenX + scaledSize - halfWidth,
                screenY,
                interiorLineWidth,
                scaledSize
              );
              drawnLines.add(lineKey);
            }
          }
          
          if (foggedSet.has(`${col},${row + 1}`)) {
            const lineKey = `h:${col},${row + 1}`;
            if (!drawnLines.has(lineKey)) {
              ctx.fillRect(
                screenX,
                screenY + scaledSize - halfWidth,
                scaledSize,
                interiorLineWidth
              );
              drawnLines.add(lineKey);
            }
          }
        }
      }
    }
    
    // Restore fog canvas context 
    if (fogCtx) {
      fogCtx.restore();
    }
    
    // Restore globalAlpha if we modified it 
    if (useGlobalAlpha) {
      ctx.globalAlpha = previousGlobalAlpha;
    }
  
  }
  
  // Draw selection indicators for text labels
  // Skip when coordinate overlay is visible or text layer is hidden
  const selectedTextLabels = itemsArray.filter(item => item.type === 'text');
  if (selectedTextLabels.length > 0 && activeLayer.textLabels && !showCoordinates && visibility.textLabels) {
    for (const selectedItem of selectedTextLabels) {
      const label = activeLayer.textLabels.find(l => l.id === selectedItem.id);
      if (label) {
        ctx.save();
        
        const { screenX, screenY } = geometry.worldToScreen(label.position.x, label.position.y, offsetX, offsetY, zoom);
        
        ctx.translate(screenX, screenY);
        ctx.rotate((label.rotation * Math.PI) / 180);
        
        // Measure text to get bounding box
        const fontSize = label.fontSize * zoom;
        const fontFamily = getFontCss(label.fontFace || 'sans');
        ctx.font = `${fontSize}px ${fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const metrics = ctx.measureText(label.content);
        const width = metrics.width;
        const height = fontSize * 1.2;
        
        // Draw selection rectangle with dashed border
        ctx.strokeStyle = '#4a9eff';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(
          -width/2 - 4, 
          -height/2 - 2, 
          width + 8, 
          height + 4
        );
        
        // Draw corner handles
        ctx.setLineDash([]);
        ctx.fillStyle = '#4a9eff';
        const handleSize = 6;
        
        // Top-left
        ctx.fillRect(-width/2 - 4 - handleSize/2, -height/2 - 2 - handleSize/2, handleSize, handleSize);
        // Top-right
        ctx.fillRect(width/2 + 4 - handleSize/2, -height/2 - 2 - handleSize/2, handleSize, handleSize);
        // Bottom-left
        ctx.fillRect(-width/2 - 4 - handleSize/2, height/2 + 2 - handleSize/2, handleSize, handleSize);
        // Bottom-right
        ctx.fillRect(width/2 + 4 - handleSize/2, height/2 + 2 - handleSize/2, handleSize, handleSize);
        
        ctx.restore();
      }
    }
  }
  
  // Draw selection indicators for objects
  // Skip when coordinate overlay is visible or objects layer is hidden
  const selectedObjects = itemsArray.filter(item => item.type === 'object');
  if (selectedObjects.length > 0 && activeLayer.objects && !showCoordinates && visibility.objects) {
    // Only show resize mode visuals for single selection
    const showResizeOverlay = isResizeMode && selectedObjects.length === 1;
    
    for (const selectedItem of selectedObjects) {
      const object = activeLayer.objects.find(obj => obj.id === selectedItem.id);
      if (object) {
        const size = object.size || { width: 1, height: 1 };
        const alignment = object.alignment || 'center';
        
        // Calculate position and dimensions based on geometry type
        let screenX, screenY, objectWidth, objectHeight, cellWidth, cellHeight;
        
        if (geometry instanceof HexGeometry) {
          // For hex: calculate position accounting for multi-object slots
          const { worldX, worldY } = geometry.hexToWorld(object.position.x, object.position.y);
          
          // Count objects in same cell for multi-object support
          const cellObjects = getObjectsInCell(activeLayer.objects, object.position.x, object.position.y);
          const objectCount = cellObjects.length;
          
          // Base object dimensions
          objectWidth = size.width * scaledSize;
          objectHeight = size.height * scaledSize;
          cellWidth = scaledSize;
          cellHeight = scaledSize;
          
          // Apply multi-object scaling if needed
          if (objectCount > 1) {
            const multiScale = getMultiObjectScale(objectCount);
            objectWidth *= multiScale;
            objectHeight *= multiScale;
          }
          
          // Calculate center in screen space
          let centerScreenX = offsetX + worldX * zoom;
          let centerScreenY = offsetY + worldY * zoom;
          
          // Apply slot offset for multi-object cells
          if (objectCount > 1) {
            const effectiveSlot = object.slot ?? cellObjects.findIndex(o => o.id === object.id);
            const { offsetX: slotOffsetX, offsetY: slotOffsetY } = getSlotOffset(
              effectiveSlot,
              objectCount,
              mapData.orientation || 'flat'
            );
            // Offset is in hex-width units (2 * scaledSize)
            const hexWidth = scaledSize * 2;
            centerScreenX += slotOffsetX * hexWidth;
            centerScreenY += slotOffsetY * hexWidth;
          }
          
          // Apply alignment offset
          if (alignment !== 'center') {
            const halfCell = scaledSize / 2;
            switch (alignment) {
              case 'north': centerScreenY -= halfCell; break;
              case 'south': centerScreenY += halfCell; break;
              case 'east': centerScreenX += halfCell; break;
              case 'west': centerScreenX -= halfCell; break;
            }
          }
          
          // Get top-left from center for rendering
          screenX = centerScreenX - objectWidth / 2;
          screenY = centerScreenY - objectHeight / 2;
        } else {
          // For grid: gridToScreen returns top-left directly
          const gridPos = geometry.gridToScreen(object.position.x, object.position.y, offsetX, offsetY, zoom);
          screenX = gridPos.screenX;
          screenY = gridPos.screenY;
          
          // Apply alignment offset
          if (alignment !== 'center') {
            const halfCell = scaledSize / 2;
            switch (alignment) {
              case 'north': screenY -= halfCell; break;
              case 'south': screenY += halfCell; break;
              case 'east': screenX += halfCell; break;
              case 'west': screenX -= halfCell; break;
            }
          }
          
          objectWidth = size.width * scaledSize;
          objectHeight = size.height * scaledSize;
          cellWidth = scaledSize;
          cellHeight = scaledSize;
        }
        
        // Draw occupied cells overlay when in resize mode (single selection only)
        if (showResizeOverlay) {
          ctx.fillStyle = 'rgba(74, 158, 255, 0.15)';
          for (let dx = 0; dx < size.width; dx++) {
            for (let dy = 0; dy < size.height; dy++) {
              const cellScreenX = screenX + dx * cellWidth;
              const cellScreenY = screenY + dy * cellHeight;
              ctx.fillRect(cellScreenX + 2, cellScreenY + 2, cellWidth - 4, cellHeight - 4);
            }
          }
        }
        
        // Draw selection rectangle with dashed border
        ctx.strokeStyle = '#4a9eff';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(
          screenX + 2,
          screenY + 2,
          objectWidth - 4,
          objectHeight - 4
        );
        
        // Draw corner handles
        ctx.setLineDash([]);
        ctx.fillStyle = '#4a9eff';
        const handleSize = showResizeOverlay ? 14 : 8;
        
        // Top-left
        ctx.fillRect(screenX + 2 - handleSize/2, screenY + 2 - handleSize/2, handleSize, handleSize);
        // Top-right
        ctx.fillRect(screenX + objectWidth - 2 - handleSize/2, screenY + 2 - handleSize/2, handleSize, handleSize);
        // Bottom-left
        ctx.fillRect(screenX + 2 - handleSize/2, screenY + objectHeight - 2 - handleSize/2, handleSize, handleSize);
        // Bottom-right
        ctx.fillRect(screenX + objectWidth - 2 - handleSize/2, screenY + objectHeight - 2 - handleSize/2, handleSize, handleSize);
      }
    }
  }
  
  // Restore context (undo rotation)
  ctx.restore();
}

function useCanvasRenderer(canvasRef, fogCanvasRef, mapData, geometry, selectedItems = [], isResizeMode = false, theme = null, showCoordinates = false, layerVisibility = null) {
  dc.useEffect(() => {
    if (mapData && geometry && canvasRef.current) {
      const fogCanvas = fogCanvasRef?.current || null;
      renderCanvas(canvasRef.current, fogCanvas, mapData, geometry, selectedItems, isResizeMode, theme, showCoordinates, layerVisibility);
    }
  }, [mapData, geometry, selectedItems, isResizeMode, theme, canvasRef, fogCanvasRef, showCoordinates, layerVisibility]);
}

return { useCanvasRenderer, renderCanvas };