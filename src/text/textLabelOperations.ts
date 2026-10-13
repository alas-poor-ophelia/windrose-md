/**
 * textLabelOperations.ts
 * 
 * Pure functions for text label manipulation.
 * Text labels are free-floating text elements positioned in world space.
 */

// Type-only imports
import type { HexColor } from '#types/core/common.types';
import type { TextLabel, TextLabelId } from '#types/objects/note.types';
import { updateById, removeById } from '../objects/entityList';

// ===========================================
// Type Definitions
// ===========================================

/** Font face options */
export type FontFace = 'sans' | 'serif' | 'mono' | 'script' | 'fantasy';

/** Text label styling options */
export interface TextLabelOptions {
  fontSize?: number;
  fontFace?: FontFace;
  color?: HexColor;
  opacity?: number;
}

/** Partial text label for updates */
export type TextLabelUpdate = Partial<Omit<TextLabel, 'id'>>;

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
  return 'text-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11);
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
    ...(options.opacity !== undefined && options.opacity !== 1 ? { opacity: options.opacity } : {})
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

/**
 * Find text label at given coordinates using proper bounding box collision
 */
function getTextLabelAtPosition(
  labels: TextLabel[] | null | undefined,
  x: number,
  y: number,
  ctx: CanvasRenderingContext2D | null = null
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
    
    // Set font to measure text accurately
    const fontSize = label.fontSize || 16;
    const fontFace = label.fontFace || 'sans';
    const fontFamily = fontMap[fontFace] ?? 'sans-serif';
    
    context.font = `${fontSize}px ${fontFamily}`;
    
    // Measure text to get bounding box
    const metrics = context.measureText(label.content);
    const textWidth = metrics.width;
    const textHeight = fontSize * 1.2; // Same multiplier as renderer
    
    // Add padding (same as selection box: 4px horizontal, 2px vertical)
    const paddingX = 4;
    const paddingY = 2;
    const boundingWidth = textWidth + paddingX * 2;
    const boundingHeight = textHeight + paddingY * 2;
    
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

export { generateTextLabelId, addTextLabel, updateTextLabel, removeTextLabel, getTextLabelAtPosition, };