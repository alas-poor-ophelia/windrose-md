/**
 * Object Renderer Module
 *
 * Renders map objects (icons, characters, tokens) on the canvas.
 * Handles fog visibility, multi-object hex slots, rotation, and badge indicators.
 */

interface MapObject {
  id: string;
  type: string;
  position: { x: number; y: number };
  size?: { width: number; height: number };
  color?: string;
  rotation?: number;
  scale?: number;
  alignment?: 'center' | 'north' | 'south' | 'east' | 'west';
  slot?: number;
  linkedNote?: string;
  customTooltip?: string;
  linkedObject?: string;
}

interface ObjectTypeDef {
  id: string;
  char?: string;
  icon?: string;
}

interface MapLayer {
  objects: MapObject[];
  fogOfWar?: {
    enabled: boolean;
  };
}

interface GeometryLike {
  toOffsetCoords: (x: number, y: number) => { col: number; row: number };
  gridToScreen: (x: number, y: number, offsetX: number, offsetY: number, zoom: number) => { screenX: number; screenY: number };
}

interface ObjectRenderContext {
  ctx: CanvasRenderingContext2D;
  offsetX: number;
  offsetY: number;
  zoom: number;
  scaledSize: number;
}

/** Render character result from objectTypeResolver */
interface RenderChar {
  char: string;
  isIcon: boolean;
  isImage?: boolean;
  imagePath?: string;
}

interface ObjectRenderDeps {
  getObjectType: (typeId: string) => ObjectTypeDef | null;
  getRenderChar: (objType: ObjectTypeDef) => RenderChar;
  isCellFogged: (layer: MapLayer, col: number, row: number) => boolean;
  getObjectsInCell: (objects: MapObject[], x: number, y: number) => MapObject[];
  getSlotOffset: (slot: number, count: number, orientation: string) => { offsetX: number; offsetY: number };
  getMultiObjectScale: (count: number) => number;
  renderNoteLinkBadge: (ctx: CanvasRenderingContext2D, position: { screenX: number; screenY: number; objectWidth: number; objectHeight: number }, config: { scaledSize: number }) => void;
  renderTooltipIndicator: (ctx: CanvasRenderingContext2D, position: { screenX: number; screenY: number; objectWidth: number; objectHeight: number }, config: { scaledSize: number }) => void;
  renderObjectLinkIndicator: (ctx: CanvasRenderingContext2D, position: { screenX: number; screenY: number; objectWidth: number; objectHeight: number }, config: { scaledSize: number }) => void;
  getCachedImage?: (path: string) => HTMLImageElement | null;
}

/**
 * Checks if an object is hidden under fog of war.
 */
function isObjectUnderFog(
  obj: MapObject,
  layer: MapLayer,
  geometry: GeometryLike,
  isHexMap: boolean,
  isCellFogged: (layer: MapLayer, col: number, row: number) => boolean
): boolean {
  if (!layer.fogOfWar?.enabled) return false;

  const size = obj.size || { width: 1, height: 1 };
  const baseOffset = geometry.toOffsetCoords(obj.position.x, obj.position.y);

  if (isHexMap) {
    return isCellFogged(layer, baseOffset.col, baseOffset.row);
  }

  // Grid maps: check all cells the object occupies
  for (let dx = 0; dx < size.width; dx++) {
    for (let dy = 0; dy < size.height; dy++) {
      if (isCellFogged(layer, baseOffset.col + dx, baseOffset.row + dy)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Calculates object screen position, handling multi-object hex slots.
 */
function calculateObjectPosition(
  obj: MapObject,
  allObjects: MapObject[],
  geometry: GeometryLike,
  context: ObjectRenderContext,
  isHexMap: boolean,
  orientation: string,
  deps: Pick<ObjectRenderDeps, 'getObjectsInCell' | 'getSlotOffset' | 'getMultiObjectScale'>
): { screenX: number; screenY: number; objectWidth: number; objectHeight: number } {
  const { offsetX, offsetY, zoom, scaledSize } = context;
  const size = obj.size || { width: 1, height: 1 };

  let { screenX, screenY } = geometry.gridToScreen(obj.position.x, obj.position.y, offsetX, offsetY, zoom);
  let objectWidth = size.width * scaledSize;
  let objectHeight = size.height * scaledSize;

  // Multi-object support for hex maps
  if (isHexMap) {
    const cellObjects = deps.getObjectsInCell(allObjects, obj.position.x, obj.position.y);
    const objectCount = cellObjects.length;

    if (objectCount > 1) {
      const multiScale = deps.getMultiObjectScale(objectCount);
      objectWidth *= multiScale;
      objectHeight *= multiScale;

      let effectiveSlot = obj.slot;
      if (effectiveSlot === undefined || effectiveSlot === null) {
        effectiveSlot = cellObjects.findIndex(o => o.id === obj.id);
      }

      const { offsetX: slotOffsetX, offsetY: slotOffsetY } = deps.getSlotOffset(
        effectiveSlot,
        objectCount,
        orientation
      );

      const hexCenterX = screenX + scaledSize / 2;
      const hexCenterY = screenY + scaledSize / 2;
      const hexWidth = scaledSize * 2;
      const objectCenterX = hexCenterX + slotOffsetX * hexWidth;
      const objectCenterY = hexCenterY + slotOffsetY * hexWidth;

      screenX = objectCenterX - objectWidth / 2;
      screenY = objectCenterY - objectHeight / 2;
    }
  }

  // Apply alignment offset
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

  return { screenX, screenY, objectWidth, objectHeight };
}

/**
 * Renders a single object on the canvas.
 * Handles three rendering modes: custom images, RPGAwesome icons, and Unicode symbols.
 */
function renderSingleObject(
  ctx: CanvasRenderingContext2D,
  obj: MapObject,
  objType: ObjectTypeDef,
  position: { screenX: number; screenY: number; objectWidth: number; objectHeight: number },
  scaledSize: number,
  getRenderChar: (objType: ObjectTypeDef) => RenderChar,
  getCachedImage?: (path: string) => HTMLImageElement | null
): void {
  const { screenX, screenY, objectWidth, objectHeight } = position;

  const centerX = screenX + objectWidth / 2;
  const centerY = screenY + objectHeight / 2;

  const objectScale = obj.scale ?? 1.0;
  const rotation = obj.rotation || 0;

  const renderInfo = getRenderChar(objType);

  // Handle custom image rendering
  if (renderInfo.isImage && renderInfo.imagePath && getCachedImage) {
    const img = getCachedImage(renderInfo.imagePath);
    if (img && img.complete) {
      // Calculate image size (fits within object bounds with 90% fill)
      const imgSize = Math.min(objectWidth, objectHeight) * 0.9 * objectScale;

      ctx.save();

      // Apply rotation if needed
      if (rotation !== 0) {
        ctx.translate(centerX, centerY);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.translate(-centerX, -centerY);
      }

      // Draw the image centered
      ctx.drawImage(
        img,
        centerX - imgSize / 2,
        centerY - imgSize / 2,
        imgSize,
        imgSize
      );

      ctx.restore();
      return;
    }
    // Image not loaded yet - fall through to render placeholder
  }

  // Font-based rendering (icons and Unicode symbols)
  const fontSize = Math.min(objectWidth, objectHeight) * 0.8 * objectScale;

  if (rotation !== 0) {
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-centerX, -centerY);
  }

  if (renderInfo.isIcon) {
    ctx.font = `${fontSize}px rpgawesome`;
  } else {
    ctx.font = `${fontSize}px 'Noto Emoji', 'Noto Sans Symbols 2', monospace`;
  }

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = Math.max(2, fontSize * 0.08);
  ctx.strokeText(renderInfo.char, centerX, centerY);

  ctx.fillStyle = obj.color || '#ffffff';
  ctx.fillText(renderInfo.char, centerX, centerY);

  if (rotation !== 0) {
    ctx.restore();
  }
}

/**
 * Renders object badge indicators (note link, tooltip, object link).
 */
function renderObjectBadges(
  ctx: CanvasRenderingContext2D,
  obj: MapObject,
  position: { screenX: number; screenY: number; objectWidth: number; objectHeight: number },
  scaledSize: number,
  deps: Pick<ObjectRenderDeps, 'renderNoteLinkBadge' | 'renderTooltipIndicator' | 'renderObjectLinkIndicator'>
): void {
  // Draw note badge if object has linkedNote
  if (obj.linkedNote && obj.type !== 'note_pin') {
    deps.renderNoteLinkBadge(ctx, position, { scaledSize });
  }

  // Draw note indicator for custom tooltip
  if (obj.customTooltip) {
    deps.renderTooltipIndicator(ctx, position, { scaledSize });
  }

  // Draw link indicator for inter-object links
  if (obj.linkedObject) {
    deps.renderObjectLinkIndicator(ctx, position, { scaledSize });
  }
}

/**
 * Main entry point for rendering all objects on the map.
 */
function renderObjects(
  layer: MapLayer,
  context: ObjectRenderContext,
  geometry: GeometryLike,
  isHexMap: boolean,
  orientation: string,
  deps: ObjectRenderDeps
): void {
  if (!layer.objects || layer.objects.length === 0) return;

  const { ctx, scaledSize } = context;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const obj of layer.objects) {
    const objType = deps.getObjectType(obj.type);
    if (!objType) continue;

    // Skip if under fog
    if (isObjectUnderFog(obj, layer, geometry, isHexMap, deps.isCellFogged)) {
      continue;
    }

    // Calculate position
    const position = calculateObjectPosition(
      obj,
      layer.objects,
      geometry,
      context,
      isHexMap,
      orientation,
      deps
    );

    // Render the object
    renderSingleObject(ctx, obj, objType, position, scaledSize, deps.getRenderChar, deps.getCachedImage);

    // Render badges
    renderObjectBadges(ctx, obj, position, scaledSize, deps);
  }
}

return {
  isObjectUnderFog,
  calculateObjectPosition,
  renderSingleObject,
  renderObjectBadges,
  renderObjects,
};
