/**
 * TerrainBrushLayer.tsx
 *
 * World-space soft terrain brush (the drawer ribbon's 'brush' subtool): paints
 * a seamless region texture along a freehand stroke, committed as a
 * TerrainStroke on pointerup (one history entry per gesture). The in-flight
 * stroke previews on a private overlay canvas with a hard edge; the committed
 * stroke renders through the shared region-fill mask, where it feathers and
 * merges with cell fills of the same texture.
 *
 * Erase (v1): Alt+drag deletes whole strokes the pointer sweeps over — a
 * stroke is one brush gesture, so "undo that daub" granularity. Boolean
 * subtraction is a deliberate follow-up.
 */

import type { ToolId } from '#types/tools/tool.types';
import type { VNode } from 'preact';
import type { TerrainStroke } from '#types/core/terrainstroke.types';
import type { TileLayerRole } from '#types/tiles/tile.types';
import type { TileSubtoolId } from '../../assets/tileForm';

import { useCallback, useEffect, useRef } from 'preact/hooks';
import { useMapState } from '../../context/MapContext';
import { useLayerHandlers } from '../../hooks/canvas/useLayerHandlers';
import { useApp } from '../../context/AppContext';
import { calculateViewportOffset } from '../../geometry/core/BaseGeometry';
import { getActiveLayer } from '../../persistence/layerAccessor';
import { getTileMetadataForRender } from '../../persistence/tileMetadata';
import { getCachedImage, preloadImage } from '../../assets/imageOperations';
import { resolveTileRender } from '../../assets/tileRenderResolution';
import { computeRegionPatternTransform } from '../../geometry/renderers/tileRenderer';
import { createTerrainStroke } from '../../drawing/terrainStrokeOperations';
import {
  appendPointIfFar,
  finalizeStrokePoints,
  distancePointToPolyline,
} from '../../geometry/strokes/terrainStrokeGeometry';

export interface TerrainBrushLayerProps {
  currentTool: ToolId;
  /** Armed placement subtool — this layer acts only when it is 'brush'. */
  activeSubtool: TileSubtoolId | null;
  selectedTilesetId: string | null;
  selectedTileId: string | null;
  /** Shared brush size (cells of diameter): radiusWorld = brushSize × cellSize / 2. */
  brushSize: number;
  /** Edge softness captured onto each stroke (fraction of a cell, 0 = hard). */
  brushSoftness: number;
  tileDepth: TileLayerRole;
  onTerrainStrokesChange: (strokes: TerrainStroke[], suppressHistory?: boolean) => void;
}

const TerrainBrushLayer = ({
  currentTool,
  activeSubtool,
  selectedTilesetId,
  selectedTileId,
  brushSize,
  brushSoftness,
  tileDepth,
  onTerrainStrokesChange,
}: TerrainBrushLayerProps): VNode | null => {
  const app = useApp();
  const { mapData, geometry, screenToWorld, getClientCoords, canvasRef } = useMapState();

  const hasTileSelected = selectedTilesetId != null && selectedTilesetId !== '' && selectedTileId != null && selectedTileId !== '';
  const isBrushActive = currentTool === 'tilePaint' && activeSubtool === 'brush' && hasTileSelected;

  const cellSize = geometry != null ? geometry.cellSize : 32;
  const radiusWorld = Math.max(1, brushSize) * cellSize / 2;

  // ---- Gesture state (refs: no re-render during a stroke) ----
  const pointsRef = useRef<number[]>([]);
  const paintingRef = useRef(false);
  const erasingRef = useRef(false);
  const eraseInitialRef = useRef<TerrainStroke[] | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);

  const getStrokes = useCallback((): TerrainStroke[] => {
    if (mapData == null) return [];
    return getActiveLayer(mapData).terrainStrokes ?? [];
  }, [mapData]);

  const selectedEntry = (() => {
    if (mapData?.tilesets == null || !hasTileSelected) return null;
    const ts = mapData.tilesets.find(t => t.id === selectedTilesetId);
    return ts?.tiles.find(t => t.id === selectedTileId) ?? null;
  })();

  // ---- Overlay (same pattern as WallLayer) ----
  const createOverlay = useCallback((): HTMLCanvasElement | null => {
    if (overlayRef.current != null) return overlayRef.current;
    const mainCanvas = canvasRef.current;
    if (!mainCanvas || !mainCanvas.parentElement) return null;
    const overlay = activeWindow.createEl('canvas');
    overlay.width = mainCanvas.width;
    overlay.height = mainCanvas.height;
    overlay.classList.add('windrose-overlay-layer');
    mainCanvas.parentElement.appendChild(overlay);
    overlayRef.current = overlay;
    return overlay;
  }, [canvasRef]);

  const removeOverlay = useCallback(() => {
    if (overlayRef.current?.parentElement != null) {
      overlayRef.current.parentElement.removeChild(overlayRef.current);
    }
    overlayRef.current = null;
  }, []);

  // ---- Live preview: hard-edged pattern sweep of the in-flight stroke ----
  const drawPreview = useCallback(() => {
    const overlay = overlayRef.current;
    if (overlay == null || mapData == null || geometry == null) return;
    const ctx = overlay.getContext('2d');
    if (ctx == null) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const pts = pointsRef.current;
    if (pts.length < 2) return;

    const { zoom, center } = mapData.viewState ?? { zoom: 1, center: { x: 0, y: 0 } };
    const { offsetX, offsetY } = calculateViewportOffset(
      geometry, center, { width: overlay.width, height: overlay.height }, zoom,
    );
    const radiusPx = radiusWorld * zoom;

    // World-anchored pattern so the preview already sits in the final phase.
    const img = selectedEntry != null ? getCachedImage(selectedEntry.vaultPath) : null;
    if (img?.naturalWidth != null && img.naturalWidth > 0) {
      const origin = geometry.worldToScreen(0, 0, offsetX, offsetY, zoom);
      const meta = getTileMetadataForRender()[selectedEntry?.vaultPath ?? ''];
      const tileset = mapData.tilesets?.find(t => t.id === selectedTilesetId);
      const resolved = resolveTileRender(undefined, meta, tileset);
      const { scale, translateX, translateY } = computeRegionPatternTransform(
        img.naturalWidth, resolved.worldRepeat, cellSize, zoom, origin.screenX, origin.screenY,
      );
      const pattern = ctx.createPattern(img, 'repeat');
      if (pattern != null && typeof pattern.setTransform === 'function') {
        pattern.setTransform(new DOMMatrix([scale, 0, 0, scale, translateX, translateY]));
        ctx.strokeStyle = pattern;
        ctx.fillStyle = pattern;
      }
    } else {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    }

    ctx.globalAlpha = 0.85;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (pts.length === 2) {
      const c = geometry.worldToScreen(pts[0], pts[1], offsetX, offsetY, zoom);
      ctx.beginPath();
      ctx.arc(c.screenX, c.screenY, radiusPx, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const s0 = geometry.worldToScreen(pts[0], pts[1], offsetX, offsetY, zoom);
      ctx.beginPath();
      ctx.moveTo(s0.screenX, s0.screenY);
      for (let i = 2; i + 1 < pts.length; i += 2) {
        const s = geometry.worldToScreen(pts[i], pts[i + 1], offsetX, offsetY, zoom);
        ctx.lineTo(s.screenX, s.screenY);
      }
      ctx.lineWidth = radiusPx * 2;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }, [mapData, geometry, radiusWorld, selectedEntry, selectedTilesetId, cellSize]);

  // ---- Erase gesture ----
  const eraseAt = useCallback((worldX: number, worldY: number) => {
    const current = getStrokes();
    const survivors = current.filter(s =>
      distancePointToPolyline(worldX, worldY, s.points) >= s.radius + radiusWorld
    );
    if (survivors.length !== current.length) {
      const isBatched = eraseInitialRef.current !== null;
      onTerrainStrokesChange(survivors, isBatched);
    }
  }, [getStrokes, radiusWorld, onTerrainStrokesChange]);

  // ---- Pointer handlers ----
  const handlePointerDown = useCallback((e: MouseEvent | TouchEvent | PointerEvent) => {
    if (!isBrushActive || geometry == null || mapData == null) return;
    const { clientX, clientY } = getClientCoords(e);
    const coords = screenToWorld(clientX, clientY);
    if (coords == null) return;

    if ((e as MouseEvent).altKey === true) {
      // Alt+drag: whole-stroke eraser, one history entry per gesture.
      erasingRef.current = true;
      eraseInitialRef.current = [...getStrokes()];
      eraseAt(coords.worldX, coords.worldY);
      return;
    }

    paintingRef.current = true;
    pointsRef.current = [coords.worldX, coords.worldY];
    if (selectedEntry?.vaultPath != null && selectedEntry.vaultPath !== '') {
      void preloadImage(app, selectedEntry.vaultPath);
    }
    createOverlay();
    drawPreview();
  }, [isBrushActive, geometry, mapData, getClientCoords, screenToWorld, getStrokes, eraseAt, selectedEntry, app, createOverlay, drawPreview]);

  const handlePointerMove = useCallback((e: MouseEvent | TouchEvent | PointerEvent) => {
    if (!isBrushActive || geometry == null) return;
    if (!paintingRef.current && !erasingRef.current) return;
    const { clientX, clientY } = getClientCoords(e);
    const coords = screenToWorld(clientX, clientY);
    if (coords == null) return;

    if (erasingRef.current) {
      eraseAt(coords.worldX, coords.worldY);
      return;
    }

    // Min-distance sampling keeps the capsule union smooth and the JSON small.
    if (appendPointIfFar(pointsRef.current, coords.worldX, coords.worldY, 0.35 * radiusWorld)) {
      drawPreview();
    }
  }, [isBrushActive, geometry, getClientCoords, screenToWorld, eraseAt, radiusWorld, drawPreview]);

  const handlePointerUp = useCallback(() => {
    if (erasingRef.current) {
      erasingRef.current = false;
      if (eraseInitialRef.current !== null && mapData != null) {
        // Commit the erase gesture as ONE history entry.
        onTerrainStrokesChange(getStrokes(), false);
        eraseInitialRef.current = null;
      }
      return;
    }
    if (!paintingRef.current) return;
    paintingRef.current = false;

    const raw = pointsRef.current;
    pointsRef.current = [];
    const overlay = overlayRef.current;
    if (overlay != null) {
      const ctx = overlay.getContext('2d');
      ctx?.clearRect(0, 0, overlay.width, overlay.height);
    }
    if (raw.length < 2 || selectedTilesetId == null || selectedTileId == null || mapData == null) return;

    const points = finalizeStrokePoints(raw, radiusWorld / 10);
    const stroke = createTerrainStroke({
      points,
      radius: radiusWorld,
      tilesetId: selectedTilesetId,
      tileId: selectedTileId,
      depth: tileDepth,
      feather: brushSoftness,
    });
    onTerrainStrokesChange([...getStrokes(), stroke], false);
  }, [mapData, selectedTilesetId, selectedTileId, radiusWorld, tileDepth, brushSoftness, getStrokes, onTerrainStrokesChange]);

  // Drop transient state when the brush disarms.
  useEffect(() => {
    if (!isBrushActive) {
      paintingRef.current = false;
      erasingRef.current = false;
      eraseInitialRef.current = null;
      pointsRef.current = [];
      removeOverlay();
    }
  }, [isBrushActive, removeOverlay]);
  useEffect(() => () => removeOverlay(), [removeOverlay]);

  // Register under 'terrainBrush' — the coordinator dispatches tilePaint
  // events to both tile layers; the subtool gate decides which one acts.
  useLayerHandlers('terrainBrush', isBrushActive
    ? { handlePointerDown, handlePointerMove, handlePointerUp }
    : {});

  return null;
};

export { TerrainBrushLayer };
