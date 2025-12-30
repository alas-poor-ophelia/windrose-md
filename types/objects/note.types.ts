/**
 * Note and Text Label Type Definitions
 * Path: types/objects/note.types.ts
 * 
 * Note pins and text labels for map annotations.
 * Populated during noteOperations.js and textLabelOperations.js migration.
 */

import type { Point } from '../core/geometry.types';
import type { HexColor } from '../core/common.types';

// ===========================================
// Note Pins
// ===========================================

/** Unique note pin ID */
export type NotePinId = string;

/** Note pin placed on the map */
export interface NotePin {
  id: NotePinId;
  position: Point;
  linkedNote?: string;  // Obsidian note path
  label?: string;
  color?: HexColor;
  icon?: string;
}

// ===========================================
// Text Labels
// ===========================================

/** Unique text label ID */
export type TextLabelId = string;

/** Text alignment options */
export type TextAlign = 'left' | 'center' | 'right';

/** Font weight options */
export type FontWeight = 'normal' | 'bold';

/** Text label on the map */
export interface TextLabel {
  id: TextLabelId;
  position: Point;
  text: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: FontWeight;
  color: HexColor;
  backgroundColor?: HexColor;
  align: TextAlign;
  rotation?: number;
}

// TODO: Expand during textLabelOperations.js migration