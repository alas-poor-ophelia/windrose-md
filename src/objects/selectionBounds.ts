/**
 * selectionBounds.ts
 *
 * Centralized bounds computation for selection toolbars and context menus.
 * Consolidates object, text label, and multi-select bounds into one module.
 */

import type { MapData, TextLabel } from '#types/core/map.types';
import type { MapObject } from '#types/objects/object.types';
import type { IGeometry } from '#types/core/geometry.types';
import type { GeometryLadder } from '../geometry/core/createGeometryLadder';

import { calculateObjectScreenPosition } from './screenPositionUtils';
import { getShapeBoundingHalfExtents } from './shapeOverlayOperations';
import { calculateViewportOffset } from '../geometry/core/BaseGeometry';
import { getActiveLayer } from '../persistence/layerAccessor';

interface SelectionBounds {
  screenX: number;
  screenY: number;
  width: number;
  height: number;
  left?: number;
  top?: number;
}

interface ContainerRef {
  current: HTMLElement | null;
}

interface SelectedItem {
  type: 'object' | 'text' | 'notePin' | 'shapeOverlay';
  id: string;
  data?: MapObject;
}

/**
 * Pan offset in canvas buffer pixels, matching the renderer exactly
 * (useCanvasRenderer → calculateViewportOffset). viewState.center is stored in
 * CELL units on grid maps but in world pixels on hex maps, so only the grid
 * path scales the center by the cell size. Getting this wrong puts a selection
 * card thousands of pixels away from its item.
 */
function getViewportOffset(
  canvas: HTMLCanvasElement,
  center: { x: number; y: number },
  zoom: number,
  geometry: IGeometry,
  gridSize: number | undefined
): { offsetX: number; offsetY: number } {
  return calculateViewportOffset(
    { type: geometry.type, cellSize: geometry.cellSize ?? gridSize ?? 32 },
    center,
    { width: canvas.width, height: canvas.height },
    zoom
  );
}

/** Rotate a buffer-space point about the canvas center, as the renderer does. */
function applyNorthRotation(
  screenX: number,
  screenY: number,
  canvas: HTMLCanvasElement,
  northDirection: number | undefined
): { x: number; y: number } {
  const angle = northDirection ?? 0;
  if (angle === 0) return { x: screenX, y: screenY };

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const relX = screenX - centerX;
  const relY = screenY - centerY;
  const angleRad = (angle * Math.PI) / 180;

  return {
    x: centerX + relX * Math.cos(angleRad) - relY * Math.sin(angleRad),
    y: centerY + relX * Math.sin(angleRad) + relY * Math.cos(angleRad)
  };
}

function calculateTextLabelBounds(
  label: TextLabel,
  canvasRef: { current: HTMLCanvasElement | null },
  containerRef: ContainerRef,
  mapData: MapData,
  geometry: IGeometry
): SelectionBounds | null {
  if (label == null || canvasRef.current == null || containerRef?.current == null || mapData == null) return null;

  const canvas = canvasRef.current;
  const { gridSize, viewState, northDirection } = mapData;
  if (viewState == null) return null;
  const { zoom, center } = viewState;

  const { offsetX, offsetY } = getViewportOffset(canvas, center, zoom, geometry, gridSize);

  const rotated = applyNorthRotation(
    offsetX + label.position.x * zoom,
    offsetY + label.position.y * zoom,
    canvas,
    northDirection
  );
  const screenX = rotated.x;
  const screenY = rotated.y;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const fontSize = label.fontSize * zoom;
  ctx.font = `${fontSize}px sans-serif`;
  const metrics = ctx.measureText(label.content);
  const textWidth = metrics.width;
  const textHeight = fontSize * 1.2;

  const labelAngle = ((label.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(labelAngle));
  const sin = Math.abs(Math.sin(labelAngle));
  const rotatedWidth = textWidth * cos + textHeight * sin;
  const rotatedHeight = textWidth * sin + textHeight * cos;

  const rect = canvas.getBoundingClientRect();
  const containerRect = containerRef.current.getBoundingClientRect();
  const canvasOffsetX = rect.left - containerRect.left;
  const canvasOffsetY = rect.top - containerRect.top;
  const scaleX = rect.width / canvas.width;
  const scaleY = rect.height / canvas.height;

  const paddingX = 4;
  const paddingY = 2;

  return {
    screenX: (screenX * scaleX) + canvasOffsetX,
    screenY: (screenY * scaleY) + canvasOffsetY,
    width: (rotatedWidth + paddingX * 2) * scaleX,
    height: (rotatedHeight + paddingY * 2) * scaleY
  };
}

function getObjectBounds(
  object: MapObject,
  canvasRef: { current: HTMLCanvasElement | null },
  containerRef: ContainerRef,
  mapData: MapData,
  geometry: IGeometry,
  ladder: GeometryLadder | null = null
): SelectionBounds | null {
  if (!canvasRef.current) return null;
  const pos = calculateObjectScreenPosition(object, canvasRef.current, mapData, geometry, containerRef, ladder);
  if (!pos) return null;
  return {
    screenX: pos.screenX,
    screenY: pos.screenY,
    width: pos.objectWidth,
    height: pos.objectHeight
  };
}

function getSelectionBounds(
  selectedItems: SelectedItem[],
  mapData: MapData,
  canvasRef: { current: HTMLCanvasElement | null },
  containerRef: ContainerRef,
  geometry: IGeometry,
  ladder: GeometryLadder | null = null
): SelectionBounds | null {
  if (selectedItems == null || selectedItems.length === 0 || canvasRef?.current == null || containerRef?.current == null || mapData == null) return null;

  if (selectedItems.length === 1) {
    const item = selectedItems[0];
    const activeLayer = getActiveLayer(mapData);

    if (item.type === 'object' || item.type === 'notePin') {
      const obj = activeLayer.objects?.find((o: MapObject) => o.id === item.id);
      if (!obj) return null;
      return getObjectBounds(obj, canvasRef, containerRef, mapData, geometry, ladder);
    }

    if (item.type === 'text') {
      const label = activeLayer.textLabels?.find((l: TextLabel) => l.id === item.id);
      if (!label) return null;
      return calculateTextLabelBounds(label, canvasRef, containerRef, mapData, geometry);
    }

    if (item.type === 'shapeOverlay') {
      const shape = mapData.shapeOverlays?.find(s => s.id === item.id);
      if (shape == null || canvasRef.current == null || containerRef.current == null) return null;
      const canvas = canvasRef.current;
      const { gridSize, viewState, northDirection } = mapData;
      if (viewState == null) return null;
      const { zoom, center } = viewState;
      const { offsetX, offsetY } = getViewportOffset(canvas, center, zoom, geometry, gridSize);
      const rotated = applyNorthRotation(
        shape.worldPosition.x * zoom + offsetX,
        shape.worldPosition.y * zoom + offsetY,
        canvas,
        northDirection
      );
      const screenX = rotated.x;
      const screenY = rotated.y;
      // The canvas is turned by northDirection, so the card must bound the
      // shape at its own rotation PLUS north's
      const bounding = getShapeBoundingHalfExtents(shape, northDirection ?? 0);
      const screenHalfWidth = bounding.halfWidth * zoom;
      const screenHalfHeight = bounding.halfHeight * zoom;
      const rect = canvas.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();
      const canvasOffsetX = rect.left - containerRect.left;
      const canvasOffsetY = rect.top - containerRect.top;
      const scaleX = rect.width / canvas.width;
      const scaleY = rect.height / canvas.height;
      // screenX/screenY are the item CENTRE everywhere else (the toolbar
      // centres on them and flips around them); left/top keep the corner.
      return {
        screenX: screenX * scaleX + canvasOffsetX,
        screenY: screenY * scaleY + canvasOffsetY,
        left: (screenX - screenHalfWidth) * scaleX + canvasOffsetX,
        top: (screenY - screenHalfHeight) * scaleY + canvasOffsetY,
        width: screenHalfWidth * 2 * scaleX,
        height: screenHalfHeight * 2 * scaleY
      };
    }

    return null;
  }

  // Multi-select: compute bounding box of all items
  const canvas = canvasRef.current;
  const { gridSize, viewState, northDirection } = mapData;
  if (viewState == null) return null;
  const { zoom, center } = viewState;

  const { offsetX, offsetY } = getViewportOffset(canvas, center, zoom, geometry, gridSize);

  const rect = canvas.getBoundingClientRect();
  const containerRect = containerRef.current.getBoundingClientRect();
  const canvasOffsetX = rect.left - containerRect.left;
  const canvasOffsetY = rect.top - containerRect.top;
  const scaleX = rect.width / canvas.width;
  const scaleY = rect.height / canvas.height;

  const activeLayer = getActiveLayer(mapData);

  let minScreenX = Infinity;
  let minScreenY = Infinity;
  let maxScreenX = -Infinity;
  let maxScreenY = -Infinity;

  for (const item of selectedItems) {
    if (item.type === 'object' || item.type === 'notePin') {
      const obj = activeLayer.objects?.find((o: MapObject) => o.id === item.id);
      if (!obj) continue;

      const pos = calculateObjectScreenPosition(obj, canvas, mapData, geometry, containerRef, ladder);
      if (!pos) continue;

      const left = pos.screenX - pos.objectWidth / 2;
      const right = pos.screenX + pos.objectWidth / 2;
      const top = pos.screenY - pos.objectHeight / 2;
      const bottom = pos.screenY + pos.objectHeight / 2;

      minScreenX = Math.min(minScreenX, left);
      maxScreenX = Math.max(maxScreenX, right);
      minScreenY = Math.min(minScreenY, top);
      maxScreenY = Math.max(maxScreenY, bottom);
    } else if (item.type === 'text') {
      const label = activeLayer.textLabels?.find((l: TextLabel) => l.id === item.id);
      if (!label) continue;

      const rotated = applyNorthRotation(
        offsetX + label.position.x * zoom,
        offsetY + label.position.y * zoom,
        canvas,
        northDirection
      );
      const screenX = rotated.x;
      const screenY = rotated.y;

      const fontSize = (label.fontSize ?? 16) * zoom;
      const approxWidth = fontSize * 3;
      const approxHeight = fontSize * 1.5;

      const left = (screenX * scaleX) + canvasOffsetX - approxWidth / 2;
      const right = (screenX * scaleX) + canvasOffsetX + approxWidth / 2;
      const top = (screenY * scaleY) + canvasOffsetY - approxHeight / 2;
      const bottom = (screenY * scaleY) + canvasOffsetY + approxHeight / 2;

      minScreenX = Math.min(minScreenX, left);
      maxScreenX = Math.max(maxScreenX, right);
      minScreenY = Math.min(minScreenY, top);
      maxScreenY = Math.max(maxScreenY, bottom);
    }
  }

  if (minScreenX === Infinity) return null;

  return {
    screenX: (minScreenX + maxScreenX) / 2,
    screenY: (minScreenY + maxScreenY) / 2,
    width: maxScreenX - minScreenX,
    height: maxScreenY - minScreenY
  };
}

export { getSelectionBounds, getObjectBounds, calculateTextLabelBounds };