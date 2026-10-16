/**
 * Note and Text Label Type Definitions
 * Path: types/objects/note.types.ts
 * 
 * Note pins and text labels for map annotations.
 * Populated during noteOperations.ts and textLabelOperations.ts migration.
 */

import type { Point } from '../core/geometry.types';
import type { HexColor } from '../core/common.types';

// ===========================================
// Note Index
// ===========================================

/** Note index entry for vault note lookup */
export interface NoteIndexEntry {
  path: string;           // Full path with .md extension
  displayName: string;    // Name without extension
  subtitle?: string;      // Parent folder path shown when multiple notes share the same name
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
  /** Ladder rung this entity was placed at (absent = 0). Read by the ladder's live element pass. */
  homeLevel?: number;
  /**
   * Ladder depth mode (absent = persist). `pop`: hidden once the camera is finer
   * than the home rung. `persist`: drawn at every finer rung, font held at the
   * size it had when the next rung activated.
   */
  depthMode?: 'pop' | 'persist';
  /**
   * Explicit ladder rungs this entity is visible on (sorted unique integers).
   * Absent = Auto (the home band plus `depthMode`). Present overrides the band;
   * the size floors still apply. Classic maps ignore it.
   */
  visibleLevels?: number[];
  position: Point;
  content: string;
  fontSize: number;
  fontFace: string;
  fontWeight?: FontWeight;
  color: HexColor;
  opacity?: number;
  backgroundColor?: HexColor;
  align?: TextAlign;
  rotation?: number;
}

// TODO: Expand during textLabelOperations.ts migration