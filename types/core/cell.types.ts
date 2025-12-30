/**
 * Cell Type Definitions
 * Path: types/core/cell.types.ts
 * 
 * Cell and segment data structures for map storage.
 * Populated during Phase 1 (Tier 1 migration - cellAccessor.js).
 */

import type { GridCoords, AxialCoords } from './geometry.types';

// ===========================================
// Segment System
// ===========================================

/** 
 * Segment identifiers for partial cell painting.
 * Each cell can be divided into 8 triangular segments.
 */
export type SegmentId = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

/** Segment paint state within a cell */
export type SegmentMap = Partial<Record<SegmentId, boolean>>;

// ===========================================
// Cell Types
// ===========================================

/** Base cell properties shared by all cell types */
interface CellBase {
  color: string;
  opacity?: number;
}

/** Simple painted cell (full cell, no segments) */
export interface SimpleCell extends CellBase {
  type?: 'simple';  // Optional for backwards compatibility
}

/** Cell with segment-level painting */
export interface SegmentCell extends CellBase {
  type: 'segment';
  segments: SegmentMap;
}

/** Union type for all cell variants */
export type Cell = SimpleCell | SegmentCell;

// ===========================================
// Cell Maps (Storage)
// ===========================================

/** Key format for cell storage: "x,y" or "q,r" */
export type CellKey = string;

/** Map of cell keys to cell data */
export type CellMap = Map<CellKey, Cell>;

/** Legacy object-based cell storage (for migration) */
export type CellRecord = Record<CellKey, Cell>;

// ===========================================
// Cell Operations
// ===========================================

/** Result of cell lookup */
export interface CellLookupResult {
  exists: boolean;
  cell: Cell | null;
  coords: GridCoords | AxialCoords;
}

// TODO: Add more cell operation types during cellAccessor.js migration