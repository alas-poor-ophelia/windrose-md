/**
 * Terrain Stroke Type Definitions
 *
 * Soft-edged terrain brush strokes: a seamless region texture painted along a
 * freehand polyline in WORLD coordinates (not snapped to grid cells). Rendered
 * as a round-cap swept mask filled with the same world-anchored pattern as
 * region cell fills, so strokes and cells of one texture merge seamlessly.
 *
 * worldRepeat is deliberately NOT persisted per stroke — it resolves at render
 * time from the tile's metadata (tileRenderResolution), so a stroke always
 * shares pattern phase with cell fills of the same texture. Edge softness IS
 * per stroke (`feather`, captured from the brush softness at paint time);
 * strokes whose effective feather matches a cell fill's still merge into the
 * same render group and blend seamlessly.
 */

import type { TileLayerRole } from '../tiles/tile.types';

// ===========================================
// Terrain Stroke
// ===========================================

/** Terrain stroke identifier */
export type TerrainStrokeId = string;

/** A soft-edged terrain brush stroke in world coordinates. */
export interface TerrainStroke {
  id: TerrainStrokeId;
  /**
   * Flat world-coordinate pairs [x0, y0, x1, y1, ...]. Even length, >= 2
   * (a single point renders as a dab). Flat pairs halve the JSON footprint
   * vs vertex objects at typical stroke lengths (30-300 points).
   */
  points: number[];
  /** Brush RADIUS in world units (captured from the brush size at paint time). */
  radius: number;
  /** Texture reference, resolved like a tile. */
  tilesetId: string;
  tileId: string;
  /** Tile depth tier the stroke renders in. @default 'ground' */
  depth?: TileLayerRole;
  /** Edge softness as a fraction of one cell (same semantics as edgeFeather;
   *  0 = hard). Captured from the brush softness at paint time; absent =
   *  resolve from the tile like cell fills. */
  feather?: number;
  /** Stroke opacity 0-1. Reserved; no UI yet. @default 1 */
  opacity?: number;
}
