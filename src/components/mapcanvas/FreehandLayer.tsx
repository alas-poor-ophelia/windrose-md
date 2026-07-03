/**
 * FreehandLayer.tsx
 *
 * Captures pointer input for freehand curve drawing.
 * Collects world-coordinate points during a stroke, fits them to
 * cubic bezier curves on pointer up, and commits to the curves array.
 * Draws a live preview polyline on a temporary overlay canvas during the stroke,
 * avoiding interference with the main render loop.
 */

import type { Curve } from '#types/core/curve.types';

import { useCallback, useEffect, useRef } from 'preact/hooks';
import { useMapState, useMapOperations } from '../../context/MapContext';
import { useLayerHandlers } from '../../hooks/canvas/useLayerHandlers';
import { fitPointsToBezier } from '../../geometry/curves/curveFitting';
import { calculateViewportOffset } from '../../geometry/core/BaseGeometry';
import { getActiveLayer } from '../../persistence/layerAccessor';




/** Props for FreehandLayer */
export interface FreehandLayerProps {
  currentTool: string;
  selectedColor: string;
  selectedOpacity?: number;
}

/** Generate a unique curve ID */
function generateCurveId(): string {
  return 'curve-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11);
}

const FreehandLayer = ({
  currentTool,
  selectedColor,
  selectedOpacity = 1
}: FreehandLayerProps): null => {

  const { mapData, geometry, screenToWorld, getClientCoords, canvasRef } = useMapState();
  const { onCurvesChange } = useMapOperations();

  // Drawing state
  const isDrawingRef = useRef(false);
  const pointsRef = useRef<{ x: number; y: number }[]>([]);
  // Overlay canvas for live preview (avoids interfering with main render loop)
  const overlayRef = useRef<HTMLCanvasElement | null>(null);

  // Closure snap threshold: half a cell size
  const snapDistance = geometry ? geometry.getScaledCellSize(1) * 0.5 : 20;

  /**
   * Create the overlay canvas, sized and positioned to match the main canvas.
   */
  const createOverlay = useCallback((): HTMLCanvasElement | null => {
    const mainCanvas = canvasRef.current;
    if (!mainCanvas || !mainCanvas.parentElement) return null;

    const overlay = activeDocument.createElement('canvas');
    overlay.width = mainCanvas.width;
    overlay.height = mainCanvas.height;
    overlay.classList.add('windrose-overlay-layer');
    mainCanvas.parentElement.appendChild(overlay);
    overlayRef.current = overlay;
    return overlay;
  }, [canvasRef]);

  /**
   * Remove the overlay canvas.
   */
  const removeOverlay = useCallback(() => {
    if (overlayRef.current && overlayRef.current.parentElement) {
      overlayRef.current.parentElement.removeChild(overlayRef.current);
    }
    overlayRef.current = null;
  }, []);

  /**
   * Draw the live preview polyline on the overlay canvas.
   */
  const drawPreview = useCallback((points: { x: number; y: number }[]) => {
    const overlay = overlayRef.current;
    if (!overlay || points.length < 2 || !mapData || !geometry) return;

    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    // Clear overlay
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const { zoom, center } = mapData.viewState ?? { zoom: 1, center: { x: 0, y: 0 } };
    const { width, height } = overlay;

    const { offsetX, offsetY } = calculateViewportOffset(
      geometry,
      center,
      { width, height },
      zoom
    );

    ctx.save();

    // Apply north rotation if present
    const northDirection = mapData.northDirection ?? 0;
    if (northDirection !== 0) {
      ctx.translate(width / 2, height / 2);
      ctx.rotate((northDirection * Math.PI) / 180);
      ctx.translate(-width / 2, -height / 2);
    }

    // Transform to world coordinates
    ctx.translate(offsetX, offsetY);
    ctx.scale(zoom, zoom);

    // Draw polyline
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }

    ctx.strokeStyle = selectedColor;
    ctx.lineWidth = 2 / zoom; // Constant screen-space width
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.7;
    ctx.stroke();

    // Draw closure indicator if endpoint is near start
    if (points.length > 5) {
      const startPt = points[0];
      const endPt = points[points.length - 1];
      const dx = endPt.x - startPt.x;
      const dy = endPt.y - startPt.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < snapDistance) {
        const radius = snapDistance * 0.5;
        const ringWidth = 2 / zoom;

        // Start point: filled circle with contrasting outline
        ctx.beginPath();
        ctx.arc(startPt.x, startPt.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = selectedColor;
        ctx.globalAlpha = 0.4;
        ctx.fill();
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = ringWidth * 2;
        ctx.stroke();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = ringWidth;
        ctx.stroke();

        // Cursor-tip: smaller ring at endpoint
        ctx.beginPath();
        ctx.arc(endPt.x, endPt.y, radius * 0.5, 0, Math.PI * 2);
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = ringWidth * 1.5;
        ctx.stroke();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = ringWidth * 0.75;
        ctx.stroke();
      }
    }

    ctx.restore();
  }, [mapData, geometry, selectedColor, snapDistance]);

  const handlePointerDown = useCallback((e: MouseEvent | TouchEvent | PointerEvent, _gridX?: number, _gridY?: number, _isTouch?: boolean) => {
    if (currentTool !== 'freehand') return;

    const { clientX, clientY } = getClientCoords(e);
    const coords = screenToWorld(clientX, clientY);
    if (!coords) return;

    // Create overlay canvas for preview
    createOverlay();

    isDrawingRef.current = true;
    pointsRef.current = [{ x: coords.worldX, y: coords.worldY }];
  }, [currentTool, screenToWorld, getClientCoords, createOverlay]);

  const handlePointerMove = useCallback((e: MouseEvent | TouchEvent | PointerEvent) => {
    if (!isDrawingRef.current || currentTool !== 'freehand') return;

    const { clientX, clientY } = getClientCoords(e);
    const coords = screenToWorld(clientX, clientY);
    if (!coords) return;

    pointsRef.current.push({ x: coords.worldX, y: coords.worldY });

    // Draw live preview on overlay
    drawPreview(pointsRef.current);
  }, [currentTool, screenToWorld, getClientCoords, drawPreview]);

  const stopDrawing = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    // Remove overlay canvas
    removeOverlay();

    const points = pointsRef.current;
    if (points.length < 3) {
      pointsRef.current = [];
      return;
    }

    // Fit to bezier curves
    const result = fitPointsToBezier(points);
    if (!result || result.segments.length === 0) {
      pointsRef.current = [];
      return;
    }

    // Closure detection: check if end is near start
    const startPt = points[0];
    const endPt = points[points.length - 1];
    const dx = endPt.x - startPt.x;
    const dy = endPt.y - startPt.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const isClosed = dist < snapDistance;

    if (isClosed && result.segments.length > 0) {
      // Snap last segment endpoint to start
      const lastSeg = result.segments[result.segments.length - 1];
      lastSeg[4] = result.start[0];
      lastSeg[5] = result.start[1];
    }

    // Build curve object
    const curve: Curve = {
      id: generateCurveId(),
      start: result.start,
      segments: result.segments,
      closed: isClosed,
      color: isClosed ? selectedColor : 'transparent',
      opacity: isClosed ? selectedOpacity : 1,
      strokeColor: selectedColor,
      strokeWidth: 2
    };

    // Get current curves and append
    if (mapData) {
      const activeLayer = getActiveLayer(mapData);
      const currentCurves = activeLayer.curves ?? [];
      onCurvesChange([...currentCurves, curve]);
    }

    pointsRef.current = [];
  }, [mapData, selectedColor, selectedOpacity, snapDistance, onCurvesChange, removeOverlay]);

  // Clean up overlay on unmount
  useEffect(() => {
    return () => removeOverlay();
  }, [removeOverlay]);

  useLayerHandlers('freehand', { handlePointerDown, handlePointerMove, stopDrawing });

  // No visual output — drawing happens on the overlay canvas
  return null;
};

export { FreehandLayer };