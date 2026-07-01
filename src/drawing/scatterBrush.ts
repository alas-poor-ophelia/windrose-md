/**
 * scatterBrush.ts
 *
 * Pure math for the scatter subtool: spacing (when a dragged pointer drops the
 * next freeform stamp) and per-drop jitter (position, scale, rotation step,
 * flip). The RNG is injected so tests are deterministic; rotation jitter picks
 * from the geometry's legal TileRotation steps because the persisted rotation
 * type is a step union (arbitrary angles are a deliberate follow-up).
 */

import type { TileRotation } from '#types/tiles/tile.types';

export interface ScatterDrop {
  worldX: number;
  worldY: number;
  /** Absolute scale for the placement (already includes the brush tileScale). */
  scale: number;
  rotation: TileRotation;
  flipH: boolean;
}

export interface ScatterParams {
  /** World units per cell (geometry.cellSize). */
  cellSize: number;
  /** The brush's user-set scale — jitter multiplies around it. */
  tileScale: number;
  /** Hex maps jitter rotation in 60° steps, grid maps in 90°. */
  isHex: boolean;
  /** Uniform RNG in [0, 1). */
  rng: () => number;
}

const SCATTER_SPACING_CELLS = 0.9;
const SCATTER_POS_JITTER_CELLS = 0.25;
const SCATTER_SCALE_MIN = 0.8;
const SCATTER_SCALE_MAX = 1.2;

const GRID_ROTATIONS: TileRotation[] = [0, 90, 180, 270];
const HEX_ROTATIONS: TileRotation[] = [0, 60, 120, 180, 240, 300];

/** World distance the pointer must travel before the next drop. */
function scatterSpacing(cellSize: number, tileScale: number): number {
  return SCATTER_SPACING_CELLS * cellSize * Math.max(0.25, tileScale);
}

/** Jittered drop centered on the pointer's world position. */
function makeScatterDrop(worldX: number, worldY: number, params: ScatterParams): ScatterDrop {
  const { cellSize, tileScale, isHex, rng } = params;
  const jitter = SCATTER_POS_JITTER_CELLS * cellSize;
  const steps = isHex ? HEX_ROTATIONS : GRID_ROTATIONS;
  return {
    worldX: worldX + (rng() * 2 - 1) * jitter,
    worldY: worldY + (rng() * 2 - 1) * jitter,
    scale: (SCATTER_SCALE_MIN + rng() * (SCATTER_SCALE_MAX - SCATTER_SCALE_MIN)) * tileScale,
    rotation: steps[Math.floor(rng() * steps.length)],
    flipH: rng() < 0.5,
  };
}

export {
  scatterSpacing,
  makeScatterDrop,
  SCATTER_SPACING_CELLS,
  SCATTER_POS_JITTER_CELLS,
  SCATTER_SCALE_MIN,
  SCATTER_SCALE_MAX,
  GRID_ROTATIONS,
  HEX_ROTATIONS,
};
