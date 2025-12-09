const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { getTheme } = await requireModuleByName("settingsAccessor.js");
const { buildCellLookup, calculateBordersOptimized } = await requireModuleByName("borderCalculator.js");
const { getObjectType } = await requireModuleByName("objectOperations.js");
const { getRenderChar } = await requireModuleByName("objectTypeResolver.js");
const { getCellColor } = await requireModuleByName("colorOperations.js");
const { getFontCss } = await requireModuleByName("fontOptions.js");
const { GridGeometry } = await requireModuleByName("GridGeometry.js");
const { HexGeometry } = await requireModuleByName("HexGeometry.js");
const { gridRenderer } = await requireModuleByName("gridRenderer.js");
const { hexRenderer } = await requireModuleByName("hexRenderer.js");
const { getCachedImage } = await requireModuleByName("imageOperations.js");
const { getSlotOffset, getMultiObjectScale, getObjectsInCell } = await requireModuleByName("hexSlotPositioner.js");
const { offsetToAxial } = await requireModuleByName("offsetCoordinates.js");

/**
 * Get appropriate renderer for geometry type
 * @param {GridGeometry|HexGeometry} geometry
 * @returns {Object} Renderer object with render methods
 */
function getRenderer(geometry) {
  return geometry instanceof HexGeometry ? hexRenderer : gridRenderer;
}

function renderCanvas(canvas, mapData, geometry, selectedItem = null, isResizeMode = false, theme = null, showCoordinates = false, layerVisibility = null) {
  if (!canvas) return;
  
  // Default layer visibility
  const visibility = layerVisibility || { objects: true, textLabels: true, hexCoordinates: true };
  
  // Get theme with current settings (use provided theme or fetch global)
  const THEME = theme || getTheme();
  
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
  
  // Draw grid lines using renderer
  renderer.renderGrid(ctx, geometry, rendererViewState, { width, height }, true, {
    lineColor: THEME.grid.lines,
    lineWidth: THEME.grid.lineWidth || 1
  });
  
  // Draw filled cells using renderer
  if (mapData.cells && mapData.cells.length > 0) {
    // Add color to cells that don't have it (for backward compatibility)
    const cellsWithColor = mapData.cells.map(cell => ({
      ...cell,
      color: getCellColor(cell)
    }));
    
    // Render painted cells using renderer
    renderer.renderPaintedCells(ctx, cellsWithColor, geometry, rendererViewState);
    
    // Render interior grid lines on top of painted cells (grid only)
    // These are slightly thinner than exterior lines for visual distinction
    if (renderer.renderInteriorGridLines) {
      renderer.renderInteriorGridLines(ctx, cellsWithColor, geometry, rendererViewState, {
        lineColor: THEME.grid.lines,
        lineWidth: THEME.grid.lineWidth || 1,
        interiorRatio: 0.5
      });
    }
    
    // Render smart borders using renderer (grid only - hex renderer no-ops this)
    renderer.renderCellBorders(
      ctx,
      cellsWithColor,
      geometry,
      rendererViewState,
      buildCellLookup,
      calculateBordersOptimized,
      {
        border: THEME.cells.border,
        borderWidth: THEME.cells.borderWidth
      }
    );
  }
  
  // Draw painted edges (grid maps only, after cells/borders)
  // Edges are custom-colored grid lines that overlay the base grid
  if (mapData.edges && mapData.edges.length > 0 && geometry instanceof GridGeometry) {
    renderer.renderEdges(ctx, mapData.edges, geometry, rendererViewState, {
      lineWidth: 1,
      borderWidth: THEME.cells.borderWidth
    });
  }
  
  // Draw objects (after cells and borders, so they appear on top)
  // Skip when coordinate overlay is visible or objects layer is hidden
  if (mapData.objects && mapData.objects.length > 0 && !showCoordinates && visibility.objects) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    for (const obj of mapData.objects) {
      const objType = getObjectType(obj.type);
      if (!objType) continue;
      
      // Ensure size exists (backward compatibility)
      const size = obj.size || { width: 1, height: 1 };
      
      let { screenX, screenY } = geometry.gridToScreen(obj.position.x, obj.position.y, offsetX, offsetY, zoom);
      
      // Calculate base dimensions
      let objectWidth = size.width * scaledSize;
      let objectHeight = size.height * scaledSize;
      
      // For hex maps with multi-object support
      if (geometry instanceof HexGeometry) {
        // Count objects in same cell
        const cellObjects = getObjectsInCell(mapData.objects, obj.position.x, obj.position.y);
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
  if (mapData.textLabels && mapData.textLabels.length > 0 && !showCoordinates && visibility.textLabels) {
    for (const label of mapData.textLabels) {
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
  
  // Draw selection indicator for text labels
  // Skip when coordinate overlay is visible or text layer is hidden
  if (selectedItem && selectedItem.type === 'text' && mapData.textLabels && !showCoordinates && visibility.textLabels) {
    const label = mapData.textLabels.find(l => l.id === selectedItem.id);
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
  
  // Draw selection indicator for objects
  // Skip when coordinate overlay is visible or objects layer is hidden
  if (selectedItem && selectedItem.type === 'object' && mapData.objects && !showCoordinates && visibility.objects) {
    const object = mapData.objects.find(obj => obj.id === selectedItem.id);
    if (object) {
      const size = object.size || { width: 1, height: 1 };
      const alignment = object.alignment || 'center';
      
      // Calculate position and dimensions based on geometry type
      let screenX, screenY, objectWidth, objectHeight, cellWidth, cellHeight;
      
      if (geometry instanceof HexGeometry) {
        // For hex: calculate position accounting for multi-object slots
        const { worldX, worldY } = geometry.hexToWorld(object.position.x, object.position.y);
        
        // Count objects in same cell for multi-object support
        const cellObjects = getObjectsInCell(mapData.objects, object.position.x, object.position.y);
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
      
      // Draw occupied cells overlay when in resize mode
      if (isResizeMode) {
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
      
      // Draw corner handles (larger in resize mode for better touch targets)
      ctx.setLineDash([]);
      ctx.fillStyle = '#4a9eff';
      const handleSize = isResizeMode ? 14 : 8;
      
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
  
  // Restore context (undo rotation)
  ctx.restore();
}

function useCanvasRenderer(canvasRef, mapData, geometry, selectedItem = null, isResizeMode = false, theme = null, showCoordinates = false, layerVisibility = null) {
  // Main rendering effect - redraw when dependencies change
  dc.useEffect(() => {
    if (mapData && geometry && canvasRef.current) {
      renderCanvas(canvasRef.current, mapData, geometry, selectedItem, isResizeMode, theme, showCoordinates, layerVisibility);
    }
  }, [mapData, geometry, selectedItem, isResizeMode, theme, canvasRef, showCoordinates, layerVisibility]);
}

return { useCanvasRenderer, renderCanvas };