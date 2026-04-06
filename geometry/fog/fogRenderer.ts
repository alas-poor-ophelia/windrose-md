/**
 * Fog Renderer Module (Orchestrator)
 *
 * Orchestrates fog of war rendering for both hex and grid maps.
 * Handles fog settings, fill style setup, blur configuration, and dispatches
 * to the appropriate grid or hex fog renderer.
 */

interface FogCell {
  col: number;
  row: number;
}

interface FogOfWar {
  enabled: boolean;
  foggedCells?: FogCell[];
}

interface FogSettings {
  fowColor: string;
  fowOpacity: number;
  fowImagePath?: string;
  fowBlurEnabled: boolean;
  fowBlurFactor: number;
}

interface FogRenderContext {
  ctx: CanvasRenderingContext2D;
  fogCanvas: HTMLCanvasElement | null;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  zoom: number;
  scaledSize: number;
  northDirection: number;
}

interface GridGeometryLike {
  cellSize: number;
}

interface HexGeometryLike {
  hexSize: number;
  getHexVertices: (q: number, r: number) => Array<{ worldX: number; worldY: number }>;
  hexToWorld: (q: number, r: number) => { worldX: number; worldY: number };
  getNeighbors: (q: number, r: number) => Array<{ q: number; r: number }>;
}

interface GeometryLike {
  worldToScreen: (worldX: number, worldY: number, offsetX: number, offsetY: number, zoom: number) => { screenX: number; screenY: number };
}

interface MapBounds {
  hexBounds?: { maxCol: number; maxRow: number };
  dimensions?: { width: number; height: number };
}

type RenderGridFogFn = (
  fogCells: FogCell[],
  context: { ctx: CanvasRenderingContext2D; fogCtx: CanvasRenderingContext2D | null; offsetX: number; offsetY: number; scaledSize: number },
  options: { fowOpacity: number; fowBlurEnabled: boolean; blurRadius: number; useGlobalAlpha: boolean },
  visibleBounds: { minCol: number; maxCol: number; minRow: number; maxRow: number },
  zoom: number
) => void;

type RenderHexFogFn = (
  fogCells: FogCell[],
  context: { ctx: CanvasRenderingContext2D; fogCtx: CanvasRenderingContext2D | null; offsetX: number; offsetY: number; zoom: number },
  options: { fowOpacity: number; fowBlurEnabled: boolean; blurRadius: number; useGlobalAlpha: boolean },
  visibleBounds: { minCol: number; maxCol: number; minRow: number; maxRow: number },
  hexGeometry: HexGeometryLike,
  geometry: GeometryLike,
  orientation: string,
  offsetToAxial: (col: number, row: number, orientation: string) => { q: number; r: number },
  axialToOffset: (q: number, r: number, orientation: string) => { col: number; row: number }
) => void;

/**
 * Extracts fog settings from effective settings object.
 */
function getFogSettings(effectiveSettings: Record<string, unknown>): FogSettings {
  return {
    fowColor: (effectiveSettings.fogOfWarColor as string) || '#000000',
    fowOpacity: (effectiveSettings.fogOfWarOpacity as number) ?? 0.9,
    fowImagePath: effectiveSettings.fogOfWarImage as string | undefined,
    fowBlurEnabled: (effectiveSettings.fogOfWarBlurEnabled as boolean) ?? false,
    fowBlurFactor: (effectiveSettings.fogOfWarBlurFactor as number) ?? 0.08,
  };
}

/**
 * Creates fog fill style - either solid color or image pattern.
 */
function createFogFillStyle(
  ctx: CanvasRenderingContext2D,
  fowColor: string,
  fowImagePath: string | undefined,
  getCachedImage: (path: string) => HTMLImageElement | null
): { fillStyle: string | CanvasPattern; useGlobalAlpha: boolean } {
  let fillStyle: string | CanvasPattern = fowColor;
  const useGlobalAlpha = true;

  if (fowImagePath) {
    const fowImage = getCachedImage(fowImagePath);
    if (fowImage && fowImage.complete && fowImage.naturalWidth > 0) {
      try {
        const pattern = ctx.createPattern(fowImage, 'repeat');
        if (pattern) {
          fillStyle = pattern;
        }
      } catch (_e) {
        // Pattern creation failed, use solid color
      }
    }
  }

  return { fillStyle, useGlobalAlpha };
}

/**
 * Calculates blur radius based on cell size and blur factor.
 */
function calculateBlurRadius(
  fowBlurEnabled: boolean,
  fowBlurFactor: number,
  cellSize: number,
  zoom: number
): number {
  if (!fowBlurEnabled) return 0;
  return cellSize * fowBlurFactor * zoom;
}

/**
 * Sets up the fog canvas for blur effects.
 * Returns the fog context if blur is enabled and canvas is available.
 */
function setupFogCanvas(
  fogCanvas: HTMLCanvasElement | null,
  fowBlurEnabled: boolean,
  blurRadius: number,
  width: number,
  height: number,
  northDirection: number,
  fowColor: string,
  fowImagePath: string | undefined,
  getCachedImage: (path: string) => HTMLImageElement | null
): CanvasRenderingContext2D | null {
  if (!fogCanvas || !fowBlurEnabled || blurRadius <= 0) return null;

  const fogCtx = fogCanvas.getContext('2d');
  if (!fogCtx) return null;

  if (fogCanvas.width !== width || fogCanvas.height !== height) {
    fogCanvas.width = width;
    fogCanvas.height = height;
  }

  const cssBlurAmount = Math.max(4, blurRadius * 0.6);
  fogCanvas.style.filter = `blur(${cssBlurAmount}px)`;

  fogCtx.clearRect(0, 0, width, height);

  fogCtx.save();
  fogCtx.translate(width / 2, height / 2);
  fogCtx.rotate((northDirection * Math.PI) / 180);
  fogCtx.translate(-width / 2, -height / 2);

  fogCtx.fillStyle = fowColor;

  if (fowImagePath) {
    const fowImage = getCachedImage(fowImagePath);
    if (fowImage && fowImage.complete && fowImage.naturalWidth > 0) {
      const fogPattern = fogCtx.createPattern(fowImage, 'repeat');
      if (fogPattern) {
        fogCtx.fillStyle = fogPattern;
      }
    }
  }

  return fogCtx;
}

/**
 * Calculates visible bounds for grid maps.
 */
function calculateGridVisibleBounds(
  width: number,
  height: number,
  offsetX: number,
  offsetY: number,
  scaledSize: number,
  dimensions?: { width: number; height: number }
): { minCol: number; maxCol: number; minRow: number; maxRow: number } {
  let visibleMinCol = Math.floor((0 - offsetX) / scaledSize) - 1;
  let visibleMaxCol = Math.ceil((width - offsetX) / scaledSize) + 1;
  let visibleMinRow = Math.floor((0 - offsetY) / scaledSize) - 1;
  let visibleMaxRow = Math.ceil((height - offsetY) / scaledSize) + 1;

  const maxBound = dimensions ? Math.max(dimensions.width, dimensions.height) : 200;
  visibleMinCol = Math.max(0, visibleMinCol);
  visibleMaxCol = Math.min(maxBound, visibleMaxCol);
  visibleMinRow = Math.max(0, visibleMinRow);
  visibleMaxRow = Math.min(maxBound, visibleMaxRow);

  return { minCol: visibleMinCol, maxCol: visibleMaxCol, minRow: visibleMinRow, maxRow: visibleMaxRow };
}

/**
 * Calculates visible bounds for hex maps.
 */
function calculateHexVisibleBounds(
  hexBounds?: { maxCol: number; maxRow: number }
): { minCol: number; maxCol: number; minRow: number; maxRow: number } {
  const bounds = hexBounds || { maxCol: 100, maxRow: 100 };
  return {
    minCol: 0,
    maxCol: bounds.maxCol,
    minRow: 0,
    maxRow: bounds.maxRow,
  };
}

/**
 * Main entry point for rendering fog of war.
 * Handles all setup and dispatches to the appropriate renderer.
 */
function renderFog(
  fow: FogOfWar,
  context: FogRenderContext,
  settings: FogSettings,
  mapBounds: MapBounds,
  isHexMap: boolean,
  hexGeometry: HexGeometryLike | null,
  gridGeometry: GridGeometryLike | null,
  geometry: GeometryLike,
  orientation: string,
  getCachedImage: (path: string) => HTMLImageElement | null,
  renderGridFog: RenderGridFogFn,
  renderHexFog: RenderHexFogFn,
  offsetToAxial: (col: number, row: number, orientation: string) => { q: number; r: number },
  axialToOffset: (q: number, r: number, orientation: string) => { col: number; row: number }
): void {
  if (!fow.enabled || !fow.foggedCells?.length) return;

  const { ctx, fogCanvas, width, height, offsetX, offsetY, zoom, scaledSize, northDirection } = context;
  const { fowColor, fowOpacity, fowImagePath, fowBlurEnabled, fowBlurFactor } = settings;

  // Create fill style
  const { fillStyle, useGlobalAlpha } = createFogFillStyle(ctx, fowColor, fowImagePath, getCachedImage);

  // Calculate blur radius
  const cellSize = isHexMap && hexGeometry ? hexGeometry.hexSize : (gridGeometry?.cellSize ?? 32);
  const blurRadius = calculateBlurRadius(fowBlurEnabled, fowBlurFactor, cellSize, zoom);

  // Setup fog canvas for blur
  const fogCtx = setupFogCanvas(
    fogCanvas,
    fowBlurEnabled,
    blurRadius,
    width,
    height,
    northDirection,
    fowColor,
    fowImagePath,
    getCachedImage
  );

  // Set main context fill style
  ctx.fillStyle = fillStyle;

  const previousGlobalAlpha = ctx.globalAlpha;
  if (useGlobalAlpha) {
    ctx.globalAlpha = fowOpacity;
  }

  // Calculate visible bounds and render
  if (isHexMap && hexGeometry) {
    const visibleBounds = calculateHexVisibleBounds(mapBounds.hexBounds);

    renderHexFog(
      fow.foggedCells,
      { ctx, fogCtx, offsetX, offsetY, zoom },
      { fowOpacity, fowBlurEnabled, blurRadius, useGlobalAlpha },
      visibleBounds,
      hexGeometry,
      geometry,
      orientation,
      offsetToAxial,
      axialToOffset
    );
  } else {
    const visibleBounds = calculateGridVisibleBounds(width, height, offsetX, offsetY, scaledSize, mapBounds.dimensions);

    renderGridFog(
      fow.foggedCells,
      { ctx, fogCtx, offsetX, offsetY, scaledSize },
      { fowOpacity, fowBlurEnabled, blurRadius, useGlobalAlpha },
      visibleBounds,
      zoom
    );
  }

  // Cleanup
  if (fogCtx) {
    fogCtx.restore();
  }

  if (useGlobalAlpha) {
    ctx.globalAlpha = previousGlobalAlpha;
  }
}

/**
 * Clears the fog canvas when fog is disabled or not needed.
 */
function clearFogCanvas(fogCanvas: HTMLCanvasElement | null): void {
  if (!fogCanvas) return;

  const fogCtx = fogCanvas.getContext('2d');
  if (fogCtx) {
    fogCtx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
    fogCanvas.style.filter = 'none';
  }
}

return {
  getFogSettings,
  createFogFillStyle,
  calculateBlurRadius,
  setupFogCanvas,
  calculateGridVisibleBounds,
  calculateHexVisibleBounds,
  clearFogCanvas,
  renderFog,
};
