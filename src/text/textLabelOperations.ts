/**
 * textLabelOperations.ts
 * 
 * Pure functions for text label manipulation.
 * Text labels are free-floating text elements positioned in world space.
 */

// Type-only imports
import { mintId } from '../core/ids';
import type { HexColor } from '#types/core/common.types';
import type { GeometryLadder } from '../geometry/core/createGeometryLadder';
import { LABEL_FLOOR_PX, depthModeOf, elementScale, elementVisibleAt, elementZoom } from '../geometry/renderers/elementBands';
import type { TextLabel, TextLabelId } from '#types/objects/note.types';
import { updateById, removeById } from '../objects/entityList';
import { getFontCss } from './fontOptions';

// ===========================================
// Type Definitions
// ===========================================

/** Font face options */
type FontFace = 'sans' | 'serif' | 'mono' | 'script' | 'fantasy';

/** Text label styling options */
interface TextLabelOptions {
  fontSize?: number;
  fontFace?: FontFace;
  color?: HexColor;
  opacity?: number;
  /** Ladder rung the label is placed at; stored only when > 0 (absent = 0). */
  homeLevel?: number;
}

/**
 * Camera state for hit-testing labels under the lattice ladder. A null ladder
 * (classic maps) means the unscaled, always-visible behaviour.
 */
interface TextLabelHitView {
  ladder: GeometryLadder | null;
  /** Live camera zoom (screen px per world px). */
  zoom: number;
  activeLevel: number;
}

/** Partial text label for updates */
type TextLabelUpdate = Partial<Omit<TextLabel, 'id'>>;

// ===========================================
// Constants
// ===========================================

/** Maximum allowed content length */
const MAX_CONTENT_LENGTH = 200;

// ===========================================
// ID Generation
// ===========================================

/**
 * Generate a unique ID for a text label
 */
function generateTextLabelId(): TextLabelId {
  return mintId('text');
}

// ===========================================
// Text Label Operations
// ===========================================

/**
 * Add a new text label
 */
function addTextLabel(
  labels: TextLabel[] | null | undefined,
  content: string,
  x: number,
  y: number,
  options: TextLabelOptions = {}
): TextLabel[] {
  // Validate content
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    console.warn('Cannot add empty text label');
    return labels ?? [];
  }

  if (trimmed.length > MAX_CONTENT_LENGTH) {
    console.warn(`Text label content exceeds ${MAX_CONTENT_LENGTH} character limit`);
    return labels ?? [];
  }

  const newLabel: TextLabel = {
    id: generateTextLabelId(),
    content: trimmed,
    position: { x, y },
    rotation: 0,
    fontSize: options.fontSize ?? 16,
    fontFace: options.fontFace ?? 'sans',
    color: options.color ?? '#ffffff',
    ...(options.opacity !== undefined && options.opacity !== 1 ? { opacity: options.opacity } : {}),
    ...(options.homeLevel !== undefined && options.homeLevel > 0 ? { homeLevel: options.homeLevel } : {})
  };
  
  return [...(labels ?? []), newLabel];
}

/**
 * Update an existing text label
 */
function updateTextLabel(
  labels: TextLabel[] | null | undefined,
  id: TextLabelId,
  updates: TextLabelUpdate
): TextLabel[] {
  return updateById<TextLabel>(labels, id, updates);
}

/**
 * Remove a text label by ID
 */
function removeTextLabel(
  labels: TextLabel[] | null | undefined,
  id: TextLabelId
): TextLabel[] {
  return removeById<TextLabel>(labels, id);
}

// ===========================================
// Hit Detection
// ===========================================

/**
 * Check if a point is inside a rotated rectangle (for text label hit detection)
 */
function isPointInRotatedRect(
  px: number,
  py: number,
  rectX: number,
  rectY: number,
  rectWidth: number,
  rectHeight: number,
  rotation: number
): boolean {
  // Translate point to rectangle's local space (centered at origin)
  const dx = px - rectX;
  const dy = py - rectY;
  
  // Rotate point by negative rotation to "unrotate" it
  const angleRad = (-rotation * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const rotatedX = dx * cos - dy * sin;
  const rotatedY = dx * sin + dy * cos;
  
  // Check if point is inside the axis-aligned rectangle
  const halfWidth = rectWidth / 2;
  const halfHeight = rectHeight / 2;
  
  return Math.abs(rotatedX) <= halfWidth && Math.abs(rotatedY) <= halfHeight;
}

/** Camera for `ladderLabelBounds`: a ladder view, never the classic path. */
interface LadderLabelView {
  ladder: GeometryLadder;
  /** Live camera zoom (screen px per world px). */
  zoom: number;
  activeLevel: number;
}

/**
 * Size of a label's selection box on the ladder view, in world px, unrotated and
 * centred on `label.position`; null when the label is not drawn at this rung
 * (outside its band or its explicit `visibleLevels`, or under the label floor).
 * The text is measured at the held size (`elementScale`); the 4/2 px selection
 * padding is screen px, so it is divided by zoom. The one definition shared by
 * the point pick and the marquee, so hit-testing agrees with what is drawn.
 * Without a ctx the width is estimated (0.6 em per character).
 */
function ladderLabelBounds(
  label: TextLabel,
  ctx: CanvasRenderingContext2D | null,
  view: LadderLabelView
): { width: number; height: number } | null {
  const { ladder, zoom, activeLevel } = view;
  const home = label.homeLevel ?? 0;
  const mode = depthModeOf(label);
  const baseSize = label.fontSize || 16;
  if (!elementVisibleAt(label, activeLevel, 'label')) return null;
  if (baseSize * elementZoom(ladder, home, zoom, mode) < LABEL_FLOOR_PX) return null;
  const fontSize = baseSize * elementScale(ladder, home, zoom, mode);
  let textWidth: number;
  if (ctx) {
    ctx.font = `${fontSize}px ${getFontCss(label.fontFace || 'sans')}`;
    textWidth = ctx.measureText(label.content || '').width;
  } else {
    textWidth = (label.content || '').length * fontSize * 0.6;
  }
  const padScale = zoom > 0 ? 1 / zoom : 1;
  return { width: textWidth + 8 * padScale, height: fontSize * 1.2 + 4 * padScale };
}

/**
 * Find text label at given coordinates using proper bounding box collision
 */
function getTextLabelAtPosition(
  labels: TextLabel[] | null | undefined,
  x: number,
  y: number,
  ctx: CanvasRenderingContext2D | null = null,
  view?: TextLabelHitView
): TextLabel | null {
  if (!labels || !Array.isArray(labels)) return null;
  
  // Create temporary canvas context if none provided
  let tempCanvas: HTMLCanvasElement | null = null;
  let context = ctx;
  if (!context) {
    tempCanvas = activeWindow.createEl('canvas');
    context = tempCanvas.getContext('2d');
    if (!context) return null;
  }
  
  // Font family mapping
  const fontMap: Partial<Record<string, string>> = {
    'sans': 'system-ui, -apple-system, sans-serif',
    'serif': 'Georgia, Times, serif',
    'mono': '"Courier New", monospace',
    'script': '"Brush Script MT", cursive',
    'fantasy': 'Impact, sans-serif'
  };
  
  // Check labels in reverse order (top to bottom, most recent first)
  for (let i = labels.length - 1; i >= 0; i--) {
    const label = labels[i];

    let boundingWidth: number;
    let boundingHeight: number;
    const ladder = view?.ladder ?? null;
    if (view !== undefined && ladder !== null) {
      // Ladder maps: hidden outside its band, sized at the held zoom.
      const box = ladderLabelBounds(label, context, { ladder, zoom: view.zoom, activeLevel: view.activeLevel });
      if (box === null) continue;
      boundingWidth = box.width;
      boundingHeight = box.height;
    } else {
      // Set font to measure text accurately
      const fontSize = label.fontSize || 16;
      const fontFace = label.fontFace || 'sans';
      const fontFamily = fontMap[fontFace] ?? 'sans-serif';

      context.font = `${fontSize}px ${fontFamily}`;

      // Measure text to get bounding box
      const metrics = context.measureText(label.content);
      const textWidth = metrics.width;
      const textHeight = fontSize * 1.2; // Same multiplier as renderer

      // Add padding (same as selection box: 4px horizontal, 2px vertical), world px.
      boundingWidth = textWidth + 4 * 2;
      boundingHeight = textHeight + 2 * 2;
    }

    // Check if point is inside the rotated bounding box
    if (isPointInRotatedRect(
      x, y,
      label.position.x, label.position.y,
      boundingWidth, boundingHeight,
      label.rotation ?? 0
    )) {
      return label;
    }
  }
  
  return null;
}

// ===========================================
// Exports
// ===========================================

export { addTextLabel, updateTextLabel, removeTextLabel, getTextLabelAtPosition, ladderLabelBounds };
export type { TextLabel };