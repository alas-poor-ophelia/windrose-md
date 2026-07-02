/**
 * terrainStrokeOperations.ts
 *
 * Construction helpers for TerrainStroke data (soft-edged terrain brush
 * strokes painted in world space). Mirrors wallPathOperations.
 */

import type { TileLayerRole } from '#types/tiles/tile.types';
import type { TerrainStroke, TerrainStrokeId } from '#types/core/terrainstroke.types';

/** Create a unique terrain stroke ID */
function createTerrainStrokeId(): TerrainStrokeId {
	return 'tstroke-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

interface CreateTerrainStrokeOptions {
	/** Flat world-coordinate pairs [x0, y0, x1, y1, ...]. */
	points: number[];
	/** Brush radius in world units. */
	radius: number;
	tilesetId: string;
	tileId: string;
	depth?: TileLayerRole;
	/** Edge softness (fraction of a cell, 0 = hard); captured from brush softness. */
	feather?: number;
	opacity?: number;
}

/** Construct a TerrainStroke with defaults applied ('ground' depth implicit). */
function createTerrainStroke(opts: CreateTerrainStrokeOptions): TerrainStroke {
	return {
		id: createTerrainStrokeId(),
		points: opts.points,
		radius: opts.radius,
		tilesetId: opts.tilesetId,
		tileId: opts.tileId,
		...(opts.depth != null && opts.depth !== 'ground' ? { depth: opts.depth } : {}),
		...(opts.feather != null ? { feather: opts.feather } : {}),
		...(opts.opacity != null && opts.opacity !== 1 ? { opacity: opts.opacity } : {}),
	};
}

export { createTerrainStrokeId, createTerrainStroke };
export type { CreateTerrainStrokeOptions };
