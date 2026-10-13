/**
 * Fog Renderer Module (Orchestrator)
 *
 * Orchestrates fog of war rendering for both hex and grid maps.
 * Handles fog settings, fill style setup, blur configuration, and dispatches
 * to the appropriate grid or hex fog renderer.
 */

import type { FoggedCell } from '#types/core/map.types';
import { THEME } from '../../core/dmtConstants';
import { applyNorthRotation } from '../core/viewportMath';

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
import type { HexGeometryLike as SharedHexGeometryLike } from '../hex/hexRegionMath';

export interface GridGeometryLike {
  cellSize: number;
}

export type HexGeometryLike = Pick<
  SharedHexGeometryLike,
  'hexSize' | 'getHexVertices' | 'hexToWorld' | 'getNeighbors'
>;

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
  context: { ctx: CanvasRenderingContext2D; fogCtx: CanvasRenderingContext2D | null; offsetX: number; offsetY: number; zoom: number; cull?: { minX: number; minY: number; maxX: number; maxY: number } },
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
    // One default for the whole app: the resolver's (settingsAccessor DEFAULTS
    // seed fogOfWarBlurFactor from THEME.fogOfWar.blurFactor). This fallback
    // only fires for callers that bypass the resolver.
    fowBlurFactor: effectiveSettings.fogOfWarBlurFactor ?? THEME.fogOfWar.blurFactor,
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
    const c = activeWindow.createEl('canvas');
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

/**
 * Last pattern built per context. Fog renders every frame; the pattern only
 * changes when the (downscaled) source does, so reuse it until then.
 */
const fogPatternByCtx = new WeakMap<CanvasRenderingContext2D, { source: CanvasImageSource; pattern: CanvasPattern }>();

/** Create the repeat pattern from the (downscaled) source, restoring original on-screen scale. */
function createFogPattern(
  ctx: CanvasRenderingContext2D,
  fowImagePath: string,
  fowImage: HTMLImageElement
): CanvasPattern | null {
  try {
    const { source, invScale } = getFogPatternSource(fowImagePath, fowImage);
    const cached = fogPatternByCtx.get(ctx);
    if (cached && cached.source === source) return cached.pattern;
    const pattern = ctx.createPattern(source, 'repeat');
    if (pattern && invScale !== 1 && typeof pattern.setTransform === 'function') {
      pattern.setTransform(new DOMMatrix([invScale, 0, 0, invScale, 0, 0]));
    }
    if (pattern) fogPatternByCtx.set(ctx, { source, pattern });
    return pattern;
  } catch {
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
  const filter = `blur(${cssBlurAmount}px)`;
  // Style writes per frame invalidate style even when unchanged; write on change.
  if (fogCanvas.style.filter !== filter) fogCanvas.style.filter = filter;

  fogCtx.clearRect(0, 0, width, height);

  fogCtx.save();
  applyNorthRotation(fogCtx, width, height, northDirection);

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
 * Screen-space (pre-rotation) rectangle a hex fog cell centre must fall in to
 * be drawn. Rotated maps widen to the square circumscribing the viewport (fog
 * is traced under the canvas rotation). The margin covers the hex itself, the
 * widest blur pass and the CSS blur halo.
 */
function calculateHexFogCullRect(
  width: number,
  height: number,
  hexScreenRadius: number,
  blurRadius: number,
  northDirection: number
): { minX: number; minY: number; maxX: number; maxY: number } {
  const margin = hexScreenRadius * 1.5 + blurRadius * 2;
  if (northDirection % 360 !== 0) {
    const halfDiag = Math.sqrt(width * width + height * height) / 2;
    return {
      minX: width / 2 - halfDiag - margin,
      maxX: width / 2 + halfDiag + margin,
      minY: height / 2 - halfDiag - margin,
      maxY: height / 2 + halfDiag + margin,
    };
  }
  return { minX: -margin, minY: -margin, maxX: width + margin, maxY: height + margin };
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
    const cull = calculateHexFogCullRect(width, height, hexGeometry.hexSize * zoom, blurRadius, northDirection);

    renderHexFog(
      fow.foggedCells,
      { ctx, fogCtx, offsetX, offsetY, zoom, cull },
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
    if (fogCanvas.style.filter !== noFilter) fogCanvas.style.filter = noFilter;
  }
}

export { getFogSettings, createFogFillStyle, calculateBlurRadius, setupFogCanvas, calculateGridVisibleBounds, calculateHexVisibleBounds, calculateHexFogCullRect, clearFogCanvas, renderFog };