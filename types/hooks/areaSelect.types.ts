/**
 * Area Select Hook Type Definitions
 * Path: types/hooks/areaSelect.types.ts
 *
 * Types for useAreaSelect hook - two-click rectangle selection tool.
 */

import type { Point, WorldCoords } from '../core/geometry.types';
import type { ToolId } from '../tools/tool.types';

// ===========================================
// Area Select Start Marker
// ===========================================

/**
 * Start corner marker for area selection.
 * Combines world coordinates (for selection calculation)
 * with grid coordinates (for visual rendering).
 */
export interface AreaSelectStart {
  /** World X coordinate of start corner */
  worldX: number;
  /** World Y coordinate of start corner */
  worldY: number;
  /** Grid X coordinate (gridX for square, q for hex) */
  x: number;
  /** Grid Y coordinate (gridY for square, r for hex) */
  y: number;
}

// ===========================================
// Selected Item Reference
// ===========================================

/**
 * Reference to an item found within selection area.
 * Used by multiSelectOperations.getItemsInWorldRect.
 */
export interface SelectableItem {
  /** Item type */
  type: 'object' | 'textLabel' | 'notePin';
  /** Item identifier */
  id: string;
}

// ===========================================
// Hook Return Type
// ===========================================

/**
 * Return type for useAreaSelect hook.
 */
export interface UseAreaSelectResult {
  // State
  /** Current area select start marker (null if not selecting) */
  areaSelectStart: AreaSelectStart | null;
  /** Whether area selection is in progress (first corner placed) */
  isAreaSelecting: boolean;

  // Handlers
  /** Handle click for area select tool (returns true if handled) */
  handleAreaSelectClick: (e: PointerEvent | MouseEvent | TouchEvent) => boolean;
  /** Cancel area selection (e.g., on tool change or Escape) */
  cancelAreaSelect: () => void;
}
