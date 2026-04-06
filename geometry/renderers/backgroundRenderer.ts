/**
 * Background Renderer Module
 *
 * Renders background images for grid and hex maps, handling proper positioning,
 * scaling, and opacity based on map bounds.
 */

interface HexBounds {
  maxCol: number;
  maxRow: number;
}

interface BackgroundImageConfig {
  path: string;
  offsetX?: number;
  offsetY?: number;
  opacity?: number;
  imageGridSize?: number;  // Grid maps: pixel size of grid cells on background image
}

interface HexGeometryLike {
  hexSize: number;
  sqrt3: number;
  hexToWorld: (q: number, r: number) => { worldX: number; worldY: number };
}

interface RenderBackgroundContext {
  ctx: CanvasRenderingContext2D;
  offsetX: number;
  offsetY: number;
  zoom: number;
}

/**
 * Renders a background image for a hex map.
 * Centers the image based on hex grid bounds and applies offset/opacity settings.
 *
 * @param bgImage - The loaded HTMLImageElement
 * @param config - Background image configuration (path, offsets, opacity)
 * @param hexBounds - The hex grid bounds (maxCol, maxRow)
 * @param hexGeometry - The hex geometry instance
 * @param orientation - Hex orientation ('flat' or 'pointy')
 * @param context - Render context with canvas context and view state
 * @param offsetToAxial - Function to convert offset coords to axial
 */
function renderHexBackgroundImage(
  bgImage: HTMLImageElement,
  config: BackgroundImageConfig,
  hexBounds: HexBounds,
  hexGeometry: HexGeometryLike,
  orientation: string,
  context: RenderBackgroundContext,
  offsetToAxial: (col: number, row: number, orientation: string) => { q: number; r: number }
): void {
  const { ctx, offsetX, offsetY, zoom } = context;

  // Calculate world bounds from hex grid corners
  let minWorldX = Infinity, maxWorldX = -Infinity;
  let minWorldY = Infinity, maxWorldY = -Infinity;

  const corners = [
    { col: 0, row: 0 },
    { col: hexBounds.maxCol - 1, row: 0 },
    { col: 0, row: hexBounds.maxRow - 1 },
    { col: hexBounds.maxCol - 1, row: hexBounds.maxRow - 1 }
  ];

  for (const corner of corners) {
    const { q, r } = offsetToAxial(corner.col, corner.row, orientation);
    const worldPos = hexGeometry.hexToWorld(q, r);

    if (worldPos.worldX < minWorldX) minWorldX = worldPos.worldX;
    if (worldPos.worldX > maxWorldX) maxWorldX = worldPos.worldX;
    if (worldPos.worldY < minWorldY) minWorldY = worldPos.worldY;
    if (worldPos.worldY > maxWorldY) maxWorldY = worldPos.worldY;
  }

  // Add hex extent padding
  const hexExtentX = hexGeometry.hexSize;
  const hexExtentY = hexGeometry.hexSize * hexGeometry.sqrt3 / 2;

  minWorldX -= hexExtentX;
  maxWorldX += hexExtentX;
  minWorldY -= hexExtentY;
  maxWorldY += hexExtentY;

  // Calculate center of world bounds
  const worldCenterX = (minWorldX + maxWorldX) / 2;
  const worldCenterY = (minWorldY + maxWorldY) / 2;

  // Get image dimensions
  const imgWidth = bgImage.naturalWidth;
  const imgHeight = bgImage.naturalHeight;

  // Apply image offsets
  const imgOffsetX = config.offsetX ?? 0;
  const imgOffsetY = config.offsetY ?? 0;

  // Calculate screen position
  const screenCenterX = offsetX + worldCenterX * zoom;
  const screenCenterY = offsetY + worldCenterY * zoom;
  const screenX = screenCenterX - (imgWidth * zoom) / 2 + (imgOffsetX * zoom);
  const screenY = screenCenterY - (imgHeight * zoom) / 2 + (imgOffsetY * zoom);

  // Apply opacity if needed
  const opacity = config.opacity ?? 1;
  if (opacity < 1) {
    ctx.save();
    ctx.globalAlpha = opacity;
  }

  // Draw the background image
  ctx.drawImage(bgImage, screenX, screenY, imgWidth * zoom, imgHeight * zoom);

  // Restore opacity
  if (opacity < 1) {
    ctx.restore();
  }
}

interface GridDimensions {
  width: number;   // Grid width in cells
  height: number;  // Grid height in cells
}

/**
 * Renders a background image for a grid map.
 * Centers the image based on grid dimensions and applies offset/opacity/scaling.
 *
 * @param bgImage - The loaded HTMLImageElement
 * @param config - Background image configuration (path, offsets, opacity, imageGridSize)
 * @param dimensions - Grid dimensions in cells (width, height)
 * @param cellSize - The grid cell size in pixels
 * @param context - Render context with canvas context and view state
 */
function renderGridBackgroundImage(
  bgImage: HTMLImageElement,
  config: BackgroundImageConfig,
  dimensions: GridDimensions,
  cellSize: number,
  context: RenderBackgroundContext
): void {
  const { ctx, offsetX, offsetY, zoom } = context;

  // Calculate world bounds from grid dimensions (simpler than hex)
  const worldWidth = dimensions.width * cellSize;
  const worldHeight = dimensions.height * cellSize;
  const worldCenterX = worldWidth / 2;
  const worldCenterY = worldHeight / 2;

  // Get image dimensions
  const imgWidth = bgImage.naturalWidth;
  const imgHeight = bgImage.naturalHeight;

  // Calculate image scale factor
  // If imageGridSize is specified, scale image so its grid matches Windrose's grid
  // Scale = cellSize / imageGridSize
  // (e.g., if image has 40px grid and Windrose uses 32px, scale = 0.8)
  const imageScale = config.imageGridSize && config.imageGridSize > 0
    ? cellSize / config.imageGridSize
    : 1.0;

  // Apply image offsets
  const imgOffsetX = config.offsetX ?? 0;
  const imgOffsetY = config.offsetY ?? 0;

  // Calculate scaled image dimensions
  const scaledImgWidth = imgWidth * imageScale;
  const scaledImgHeight = imgHeight * imageScale;

  // Calculate screen position (center image on grid bounds)
  const screenCenterX = offsetX + worldCenterX * zoom;
  const screenCenterY = offsetY + worldCenterY * zoom;
  const screenX = screenCenterX - (scaledImgWidth * zoom) / 2 + (imgOffsetX * zoom);
  const screenY = screenCenterY - (scaledImgHeight * zoom) / 2 + (imgOffsetY * zoom);

  // Apply opacity if needed
  const opacity = config.opacity ?? 1;
  if (opacity < 1) {
    ctx.save();
    ctx.globalAlpha = opacity;
  }

  // Draw the background image
  ctx.drawImage(bgImage, screenX, screenY, scaledImgWidth * zoom, scaledImgHeight * zoom);

  // Restore opacity
  if (opacity < 1) {
    ctx.restore();
  }
}

return {
  renderHexBackgroundImage,
  renderGridBackgroundImage
};
