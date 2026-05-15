/**
 * selectionBounds.ts
 *
 * Centralized bounds computation for selection toolbars and context menus.
 * Consolidates object, text label, and multi-select bounds into one module.
 */

import type { MapData, TextLabel } from '#types/core/map.types';
import type { MapObject } from '#types/objects/object.types';
import type { IGeometry } from '#types/core/geometry.types';

interface SelectionBounds {
  screenX: number;
  screenY: number;
  width: number;
  height: number;
}

interface ContainerRef {
  current: HTMLElement | null;
}

interface SelectedItem {
  type: 'object' | 'text' | 'notePin';
  id: string;
  data?: MapObject;
}

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { calculateObjectScreenPosition } = await requireModuleByName("screenPositionUtils.ts");
const { getActiveLayer } = await requireModuleByName("layerAccessor.ts");

function calculateTextLabelBounds(
  label: TextLabel,
  canvasRef: { current: HTMLCanvasElement | null },
  containerRef: ContainerRef,
  mapData: MapData
): SelectionBounds | null {
  if (!label || !canvasRef.current || !containerRef?.current || !mapData) return null;

  const canvas = canvasRef.current;
  const { gridSize, viewState, northDirection } = mapData;
  const { zoom, center } = viewState;
  const scaledGridSize = gridSize * zoom;

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const offsetX = centerX - center.x * scaledGridSize;
  const offsetY = centerY - center.y * scaledGridSize;

  let screenX = offsetX + label.position.x * zoom;
  let screenY = offsetY + label.position.y * zoom;

  if (northDirection !== 0) {
    const relX = screenX - centerX;
    const relY = screenY - centerY;
    const angleRad = (northDirection * Math.PI) / 180;
    const rotatedX = relX * Math.cos(angleRad) - relY * Math.sin(angleRad);
    const rotatedY = relX * Math.sin(angleRad) + relY * Math.cos(angleRad);
    screenX = centerX + rotatedX;
    screenY = centerY + rotatedY;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const fontSize = label.fontSize * zoom;
  ctx.font = `${fontSize}px sans-serif`;
  const metrics = ctx.measureText(label.content);
  const textWidth = metrics.width;
  const textHeight = fontSize * 1.2;

  const labelAngle = ((label.rotation || 0) * Math.PI) / 180;
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
  geometry: IGeometry
): SelectionBounds | null {
  if (!canvasRef.current) return null;
  const pos = calculateObjectScreenPosition(object, canvasRef.current, mapData, geometry, containerRef);
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
  geometry: IGeometry
): SelectionBounds | null {
  if (!selectedItems?.length || !canvasRef?.current || !containerRef?.current || !mapData) return null;

  if (selectedItems.length === 1) {
    const item = selectedItems[0];
    const activeLayer = getActiveLayer(mapData);

    if (item.type === 'object' || item.type === 'notePin') {
      const obj = activeLayer.objects?.find((o: MapObject) => o.id === item.id);
      if (!obj) return null;
      return getObjectBounds(obj, canvasRef, containerRef, mapData, geometry);
    }

    if (item.type === 'text') {
      const label = activeLayer.textLabels?.find((l: TextLabel) => l.id === item.id);
      if (!label) return null;
      return calculateTextLabelBounds(label, canvasRef, containerRef, mapData);
    }

    if (item.type === 'shapeOverlay') {
      const shape = mapData.shapeOverlays?.find(s => s.id === item.id);
      if (!shape || !canvasRef.current || !containerRef.current) return null;
      const canvas = canvasRef.current;
      const { viewState } = mapData;
      if (!viewState) return null;
      const { zoom, center } = viewState;
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const offsetX = centerX - center.x * zoom;
      const offsetY = centerY - center.y * zoom;
      const screenX = shape.worldPosition.x * zoom + offsetX;
      const screenY = shape.worldPosition.y * zoom + offsetY;
      const screenSize = shape.size * zoom;
      const rect = canvas.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();
      const canvasOffsetX = rect.left - containerRect.left;
      const canvasOffsetY = rect.top - containerRect.top;
      const scaleX = rect.width / canvas.width;
      const scaleY = rect.height / canvas.height;
      return {
        left: (screenX - screenSize) * scaleX + canvasOffsetX,
        top: (screenY - screenSize) * scaleY + canvasOffsetY,
        width: screenSize * 2 * scaleX,
        height: screenSize * 2 * scaleY
      };
    }

    return null;
  }

  // Multi-select: compute bounding box of all items
  const canvas = canvasRef.current;
  const { gridSize, viewState, northDirection } = mapData;
  const { zoom, center } = viewState;
  const scaledGridSize = gridSize * zoom;

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const offsetX = centerX - center.x * scaledGridSize;
  const offsetY = centerY - center.y * scaledGridSize;

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

      const pos = calculateObjectScreenPosition(obj, canvas, mapData, geometry, containerRef);
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

      let screenX = offsetX + label.position.x * zoom;
      let screenY = offsetY + label.position.y * zoom;

      if (northDirection !== 0) {
        const relX = screenX - centerX;
        const relY = screenY - centerY;
        const angleRad = (northDirection * Math.PI) / 180;
        const rotatedX = relX * Math.cos(angleRad) - relY * Math.sin(angleRad);
        const rotatedY = relX * Math.sin(angleRad) + relY * Math.cos(angleRad);
        screenX = centerX + rotatedX;
        screenY = centerY + rotatedY;
      }

      const fontSize = (label.fontSize || 16) * zoom;
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

return { getSelectionBounds, getObjectBounds, calculateTextLabelBounds };
