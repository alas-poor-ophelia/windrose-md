/**
 * Selection Renderer Module
 *
 * Renders selection indicators for text labels and objects.
 * Handles selection rectangles, corner handles, and resize mode overlays.
 */

interface TextLabel {
  id: string;
  content: string;
  position: { x: number; y: number };
  fontSize: number;
  fontFace?: string;
  rotation?: number;
}

interface MapObject {
  id: string;
  type: string;
  position: { x: number; y: number };
  size?: { width: number; height: number };
  alignment?: 'center' | 'north' | 'south' | 'east' | 'west';
  slot?: number;
}

interface SelectedItem {
  id: string;
  type: 'text' | 'object';
}

interface GeometryLike {
  worldToScreen: (worldX: number, worldY: number, offsetX: number, offsetY: number, zoom: number) => { screenX: number; screenY: number };
  gridToScreen: (x: number, y: number, offsetX: number, offsetY: number, zoom: number) => { screenX: number; screenY: number };
}

interface HexGeometryLike {
  hexToWorld: (q: number, r: number) => { worldX: number; worldY: number };
}

interface SelectionRenderContext {
  ctx: CanvasRenderingContext2D;
  offsetX: number;
  offsetY: number;
  zoom: number;
  scaledSize: number;
}

interface SelectionRenderDeps {
  getFontCss: (fontFace: string) => string;
  getObjectsInCell: (objects: MapObject[], x: number, y: number) => MapObject[];
  getSlotOffset: (slot: number, count: number, orientation: string) => { offsetX: number; offsetY: number };
  getMultiObjectScale: (count: number) => number;
}

const SELECTION_COLOR = '#4a9eff';
const SELECTION_LINE_WIDTH = 2;
const SELECTION_DASH = [5, 3];
const HANDLE_SIZE_NORMAL = 8;
const HANDLE_SIZE_RESIZE = 14;

/**
 * Renders selection indicator for a single text label.
 */
function renderTextLabelSelection(
  ctx: CanvasRenderingContext2D,
  label: TextLabel,
  geometry: GeometryLike,
  context: SelectionRenderContext,
  getFontCss: (fontFace: string) => string
): void {
  const { offsetX, offsetY, zoom } = context;

  ctx.save();

  const { screenX, screenY } = geometry.worldToScreen(label.position.x, label.position.y, offsetX, offsetY, zoom);

  ctx.translate(screenX, screenY);
  ctx.rotate(((label.rotation || 0) * Math.PI) / 180);

  const fontSize = label.fontSize * zoom;
  const fontFamily = getFontCss(label.fontFace || 'sans');
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const metrics = ctx.measureText(label.content);
  const textWidth = metrics.width;
  const textHeight = fontSize * 1.2;

  // Draw dashed selection rectangle
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = SELECTION_LINE_WIDTH;
  ctx.setLineDash(SELECTION_DASH);
  ctx.strokeRect(-textWidth/2 - 4, -textHeight/2 - 2, textWidth + 8, textHeight + 4);

  // Draw corner handles
  ctx.setLineDash([]);
  ctx.fillStyle = SELECTION_COLOR;
  const handleSize = 6;

  ctx.fillRect(-textWidth/2 - 4 - handleSize/2, -textHeight/2 - 2 - handleSize/2, handleSize, handleSize);
  ctx.fillRect(textWidth/2 + 4 - handleSize/2, -textHeight/2 - 2 - handleSize/2, handleSize, handleSize);
  ctx.fillRect(-textWidth/2 - 4 - handleSize/2, textHeight/2 + 2 - handleSize/2, handleSize, handleSize);
  ctx.fillRect(textWidth/2 + 4 - handleSize/2, textHeight/2 + 2 - handleSize/2, handleSize, handleSize);

  ctx.restore();
}

/**
 * Renders selection indicators for all selected text labels.
 */
function renderTextLabelSelections(
  selectedItems: SelectedItem[],
  textLabels: TextLabel[],
  context: SelectionRenderContext,
  geometry: GeometryLike,
  getFontCss: (fontFace: string) => string
): void {
  const selectedTextLabels = selectedItems.filter(item => item.type === 'text');
  if (selectedTextLabels.length === 0 || !textLabels) return;

  for (const selectedItem of selectedTextLabels) {
    const label = textLabels.find(l => l.id === selectedItem.id);
    if (label) {
      renderTextLabelSelection(context.ctx, label, geometry, context, getFontCss);
    }
  }
}

/**
 * Calculates object selection position for hex maps.
 */
function calculateHexObjectSelectionPosition(
  object: MapObject,
  allObjects: MapObject[],
  hexGeometry: HexGeometryLike,
  context: SelectionRenderContext,
  orientation: string,
  deps: Pick<SelectionRenderDeps, 'getObjectsInCell' | 'getSlotOffset' | 'getMultiObjectScale'>
): { screenX: number; screenY: number; objectWidth: number; objectHeight: number; cellWidth: number; cellHeight: number } {
  const { offsetX, offsetY, zoom, scaledSize } = context;
  const size = object.size || { width: 1, height: 1 };
  const alignment = object.alignment || 'center';

  const { worldX, worldY } = hexGeometry.hexToWorld(object.position.x, object.position.y);

  const cellObjects = deps.getObjectsInCell(allObjects, object.position.x, object.position.y);
  const objectCount = cellObjects.length;

  let objectWidth = size.width * scaledSize;
  let objectHeight = size.height * scaledSize;
  const cellWidth = scaledSize;
  const cellHeight = scaledSize;

  if (objectCount > 1) {
    const multiScale = deps.getMultiObjectScale(objectCount);
    objectWidth *= multiScale;
    objectHeight *= multiScale;
  }

  let centerScreenX = offsetX + worldX * zoom;
  let centerScreenY = offsetY + worldY * zoom;

  if (objectCount > 1) {
    const effectiveSlot = object.slot ?? cellObjects.findIndex(o => o.id === object.id);
    const { offsetX: slotOffsetX, offsetY: slotOffsetY } = deps.getSlotOffset(
      effectiveSlot,
      objectCount,
      orientation
    );
    const hexWidth = scaledSize * 2;
    centerScreenX += slotOffsetX * hexWidth;
    centerScreenY += slotOffsetY * hexWidth;
  }

  if (alignment !== 'center') {
    const halfCell = scaledSize / 2;
    switch (alignment) {
      case 'north': centerScreenY -= halfCell; break;
      case 'south': centerScreenY += halfCell; break;
      case 'east': centerScreenX += halfCell; break;
      case 'west': centerScreenX -= halfCell; break;
    }
  }

  const screenX = centerScreenX - objectWidth / 2;
  const screenY = centerScreenY - objectHeight / 2;

  return { screenX, screenY, objectWidth, objectHeight, cellWidth, cellHeight };
}

/**
 * Calculates object selection position for grid maps.
 */
function calculateGridObjectSelectionPosition(
  object: MapObject,
  geometry: GeometryLike,
  context: SelectionRenderContext
): { screenX: number; screenY: number; objectWidth: number; objectHeight: number; cellWidth: number; cellHeight: number } {
  const { offsetX, offsetY, zoom, scaledSize } = context;
  const size = object.size || { width: 1, height: 1 };
  const alignment = object.alignment || 'center';

  const gridPos = geometry.gridToScreen(object.position.x, object.position.y, offsetX, offsetY, zoom);
  let screenX = gridPos.screenX;
  let screenY = gridPos.screenY;

  if (alignment !== 'center') {
    const halfCell = scaledSize / 2;
    switch (alignment) {
      case 'north': screenY -= halfCell; break;
      case 'south': screenY += halfCell; break;
      case 'east': screenX += halfCell; break;
      case 'west': screenX -= halfCell; break;
    }
  }

  const objectWidth = size.width * scaledSize;
  const objectHeight = size.height * scaledSize;
  const cellWidth = scaledSize;
  const cellHeight = scaledSize;

  return { screenX, screenY, objectWidth, objectHeight, cellWidth, cellHeight };
}

/**
 * Renders resize mode overlay showing occupied cells.
 */
function renderResizeOverlay(
  ctx: CanvasRenderingContext2D,
  object: MapObject,
  screenX: number,
  screenY: number,
  cellWidth: number,
  cellHeight: number
): void {
  const size = object.size || { width: 1, height: 1 };

  ctx.fillStyle = 'rgba(74, 158, 255, 0.15)';
  for (let dx = 0; dx < size.width; dx++) {
    for (let dy = 0; dy < size.height; dy++) {
      const cellScreenX = screenX + dx * cellWidth;
      const cellScreenY = screenY + dy * cellHeight;
      ctx.fillRect(cellScreenX + 2, cellScreenY + 2, cellWidth - 4, cellHeight - 4);
    }
  }
}

/**
 * Renders selection rectangle and corner handles for an object.
 */
function renderObjectSelectionRectangle(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  objectWidth: number,
  objectHeight: number,
  isResizeMode: boolean
): void {
  // Draw selection rectangle
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = SELECTION_LINE_WIDTH;
  ctx.setLineDash(SELECTION_DASH);
  ctx.strokeRect(screenX + 2, screenY + 2, objectWidth - 4, objectHeight - 4);

  // Draw corner handles
  ctx.setLineDash([]);
  ctx.fillStyle = SELECTION_COLOR;
  const handleSize = isResizeMode ? HANDLE_SIZE_RESIZE : HANDLE_SIZE_NORMAL;

  ctx.fillRect(screenX + 2 - handleSize/2, screenY + 2 - handleSize/2, handleSize, handleSize);
  ctx.fillRect(screenX + objectWidth - 2 - handleSize/2, screenY + 2 - handleSize/2, handleSize, handleSize);
  ctx.fillRect(screenX + 2 - handleSize/2, screenY + objectHeight - 2 - handleSize/2, handleSize, handleSize);
  ctx.fillRect(screenX + objectWidth - 2 - handleSize/2, screenY + objectHeight - 2 - handleSize/2, handleSize, handleSize);
}

/**
 * Renders selection indicator for a single object.
 */
function renderObjectSelection(
  ctx: CanvasRenderingContext2D,
  object: MapObject,
  allObjects: MapObject[],
  geometry: GeometryLike,
  hexGeometry: HexGeometryLike | null,
  context: SelectionRenderContext,
  isHexMap: boolean,
  isResizeMode: boolean,
  orientation: string,
  deps: Pick<SelectionRenderDeps, 'getObjectsInCell' | 'getSlotOffset' | 'getMultiObjectScale'>
): void {
  let position: { screenX: number; screenY: number; objectWidth: number; objectHeight: number; cellWidth: number; cellHeight: number };

  if (isHexMap && hexGeometry) {
    position = calculateHexObjectSelectionPosition(object, allObjects, hexGeometry, context, orientation, deps);
  } else {
    position = calculateGridObjectSelectionPosition(object, geometry, context);
  }

  const { screenX, screenY, objectWidth, objectHeight, cellWidth, cellHeight } = position;

  // Draw occupied cells overlay in resize mode
  if (isResizeMode) {
    renderResizeOverlay(ctx, object, screenX, screenY, cellWidth, cellHeight);
  }

  // Draw selection rectangle and handles
  renderObjectSelectionRectangle(ctx, screenX, screenY, objectWidth, objectHeight, isResizeMode);
}

/**
 * Renders selection indicators for all selected objects.
 */
function renderObjectSelections(
  selectedItems: SelectedItem[],
  objects: MapObject[],
  context: SelectionRenderContext,
  geometry: GeometryLike,
  hexGeometry: HexGeometryLike | null,
  isHexMap: boolean,
  isResizeMode: boolean,
  orientation: string,
  deps: Pick<SelectionRenderDeps, 'getObjectsInCell' | 'getSlotOffset' | 'getMultiObjectScale'>
): void {
  const selectedObjects = selectedItems.filter(item => item.type === 'object');
  if (selectedObjects.length === 0 || !objects) return;

  const showResizeOverlay = isResizeMode && selectedObjects.length === 1;

  for (const selectedItem of selectedObjects) {
    const object = objects.find(obj => obj.id === selectedItem.id);
    if (object) {
      renderObjectSelection(
        context.ctx,
        object,
        objects,
        geometry,
        hexGeometry,
        context,
        isHexMap,
        showResizeOverlay,
        orientation,
        deps
      );
    }
  }
}

/**
 * Main entry point for rendering all selection indicators.
 */
function renderSelections(
  selectedItems: SelectedItem[],
  textLabels: TextLabel[] | undefined,
  objects: MapObject[] | undefined,
  context: SelectionRenderContext,
  geometry: GeometryLike,
  hexGeometry: HexGeometryLike | null,
  isHexMap: boolean,
  isResizeMode: boolean,
  orientation: string,
  showCoordinates: boolean,
  visibility: { textLabels?: boolean; objects?: boolean },
  deps: SelectionRenderDeps
): void {
  if (selectedItems.length === 0 || showCoordinates) return;

  // Render text label selections
  if (textLabels && visibility.textLabels !== false) {
    renderTextLabelSelections(selectedItems, textLabels, context, geometry, deps.getFontCss);
  }

  // Render object selections
  if (objects && visibility.objects !== false) {
    renderObjectSelections(
      selectedItems,
      objects,
      context,
      geometry,
      hexGeometry,
      isHexMap,
      isResizeMode,
      orientation,
      deps
    );
  }
}

return {
  renderTextLabelSelection,
  renderTextLabelSelections,
  calculateHexObjectSelectionPosition,
  calculateGridObjectSelectionPosition,
  renderResizeOverlay,
  renderObjectSelectionRectangle,
  renderObjectSelection,
  renderObjectSelections,
  renderSelections,
};
