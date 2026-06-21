/**
 * Fog Renderer Module (Orchestrator)
 *
 * Orchestrates fog of war rendering for both hex and grid maps.
 * Handles fog settings, fill style setup, blur configuration, and dispatches
 * to the appropriate grid or hex fog renderer.
 */

import type { FoggedCell } from '#types/core/map.types';

interface FogOfWar {
  enabled: boolean;
  foggedCells?: FoggedCell[];
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

import type { IGeometry } from '#types/core/geometry.types';

export interface GridGeometryLike {
  cellSize: number;
}

export interface HexGeometryLike {
  hexSize: number;
  getHexVertices: (q: number, r: number) => Array<{ worldX: number; worldY: number }>;
  hexToWorld: (q: number, r: number) => { worldX: number; worldY: number };
  getNeighbors: (q: number, r: number) => Array<{ x: number; y: number }>;
}

interface MapBounds {
  hexBounds?: { maxCol: number; maxRow: number };
  dimensions?: { width: number; height: number };
}

type RenderGridFogFn = (
  fogCells: FoggedCell[],
  context: { ctx: CanvasRenderingContext2D; fogCtx: CanvasRenderingContext2D | null; offsetX: number; offsetY: number; scaledSize: number },
  options: { fowOpacity: number; fowBlurEnabled: boolean; blurRadius: number; useGlobalAlpha: boolean },
  visibleBounds: { minCol: number; maxCol: number; minRow: number; maxRow: number },
  zoom: number
) => void;

type RenderHexFogFn = (
  fogCells: FoggedCell[],
  context: { ctx: CanvasRenderingContext2D; fogCtx: CanvasRenderingContext2D | null; offsetX: number; offsetY: number; zoom: number },
  options: { fowOpacity: number; fowBlurEnabled: boolean; blurRadius: number; useGlobalAlpha: boolean },
  visibleBounds: { minCol: number; maxCol: number; minRow: number; maxRow: number },
  hexGeometry: HexGeometryLike,
  geometry: IGeometry,
  orientation: 'flat' | 'pointy',
  offsetToAxial: (col: number, row: number, orientation: 'flat' | 'pointy') => { q: number; r: number },
  axialToOffset: (q: number, r: number, orientation: 'flat' | 'pointy') => { col: number; row: number }
) => void;

/**
 * Extracts fog settings from effective settings object.
 */
interface FogSettingsSource {
  fogOfWarColor?: string;
  fogOfWarOpacity?: number;
  fogOfWarImage?: string | null;
  fogOfWarBlurEnabled?: boolean;
  fogOfWarBlurFactor?: number;
}

function getFogSettings(effectiveSettings: FogSettingsSource): FogSettings {
  return {
    fowColor: effectiveSettings.fogOfWarColor != null && effectiveSettings.fogOfWarColor !== '' ? effectiveSettings.fogOfWarColor : '#000000',
    fowOpacity: effectiveSettings.fogOfWarOpacity ?? 0.9,
    fowImagePath: effectiveSettings.fogOfWarImage ?? undefined,
    fowBlurEnabled: effectiveSettings.fogOfWarBlurEnabled ?? false,
    fowBlurFactor: effectiveSettings.fogOfWarBlurFactor ?? 0.08,
  };
}

/**
 * Fog texture pattern source, downscaled and cached per image path.
 *
 * Fog renders LIVE every frame (it sits on top of the static-layer cache), so
 * its pattern is sampled per frame across blur passes and the main fill. Users
 * can pick arbitrary images as fog textures — a 5000x5000 (25MP) JPEG used
 * directly forces the GPU to hold and re-sample a ~100MB decoded texture per
 * frame, which saturates weaker devices (measured ~900ms/frame on iPad).
 * Downscaling the pattern source once bounds that cost permanently; the
 * pattern transform scales it back up so the on-screen texture size is
 * unchanged (fog is translucent and usually blurred — sharpness loss is
 * imperceptible).
 */
const FOG_PATTERN_MAX_PX = 1024;
const fogPatternSourceCache = new Map<string, { source: CanvasImageSource; invScale: number; key: string }>();

function getFogPatternSource(
  fowImagePath: string,
  fowImage: HTMLImageElement
): { source: CanvasImageSource; invScale: number } {
  const key = `${fowImage.naturalWidth}x${fowImage.naturalHeight}`;
  const cached = fogPatternSourceCache.get(fowImagePath);
  if (cached && cached.key === key) return cached;

  const scale = Math.min(1, FOG_PATTERN_MAX_PX / Math.max(fowImage.naturalWidth, fowImage.naturalHeight));
  let source: CanvasImageSource = fowImage;
  let invScale = 1;
  if (scale < 1 && typeof document !== 'undefined') {
    const c = activeDocument.createElement('canvas');
    c.width = Math.max(1, Math.round(fowImage.naturalWidth * scale));
    c.height = Math.max(1, Math.round(fowImage.naturalHeight * scale));
    const cctx = c.getContext('2d');
    if (cctx) {
      cctx.drawImage(fowImage, 0, 0, c.width, c.height);
      source = c;
      invScale = 1 / scale;
    }
  }
  const entry = { source, invScale, key };
  fogPatternSourceCache.set(fowImagePath, entry);
  return entry;
}

/** Create the repeat pattern from the (downscaled) source, restoring original on-screen scale. */
function createFogPattern(
  ctx: CanvasRenderingContext2D,
  fowImagePath: string,
  fowImage: HTMLImageElement
): CanvasPattern | null {
  try {
    const { source, invScale } = getFogPatternSource(fowImagePath, fowImage);
    const pattern = ctx.createPattern(source, 'repeat');
    if (pattern && invScale !== 1 && typeof pattern.setTransform === 'function') {
      pattern.setTransform(new DOMMatrix([invScale, 0, 0, invScale, 0, 0]));
    }
    return pattern;
  } catch (_e) {
    return null;
  }
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

  if (fowImagePath != null && fowImagePath !== '') {
    const fowImage = getCachedImage(fowImagePath);
    if (fowImage && fowImage.complete && fowImage.naturalWidth > 0) {
      const pattern = createFogPattern(ctx, fowImagePath, fowImage);
      if (pattern) {
        fillStyle = pattern;
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

  if (fowImagePath != null && fowImagePath !== '') {
    const fowImage = getCachedImage(fowImagePath);
    if (fowImage && fowImage.complete && fowImage.naturalWidth > 0) {
      const fogPattern = createFogPattern(fogCtx, fowImagePath, fowImage);
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
  const bounds = hexBounds ?? { maxCol: 100, maxRow: 100 };
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
  geometry: IGeometry,
  orientation: 'flat' | 'pointy',
  getCachedImage: (path: string) => HTMLImageElement | null,
  renderGridFog: RenderGridFogFn,
  renderHexFog: RenderHexFogFn,
  offsetToAxial: (col: number, row: number, orientation: 'flat' | 'pointy') => { q: number; r: number },
  axialToOffset: (q: number, r: number, orientation: 'flat' | 'pointy') => { col: number; row: number }
): void {
  if (!fow.enabled || fow.foggedCells == null || fow.foggedCells.length === 0) return;

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
    const noFilter = 'none';
    fogCanvas.style.filter = noFilter;
  }
}

export { getFogSettings, createFogFillStyle, calculateBlurRadius, setupFogCanvas, calculateGridVisibleBounds, calculateHexVisibleBounds, clearFogCanvas, renderFog };