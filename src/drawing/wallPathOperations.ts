/**
 * wallPathOperations.ts
 *
 * Construction and manipulation helpers for WallPath data
 * (textures swept along editable polylines).
 */

import type { WallPath, WallPathId, WallVertex } from '#types/core/wallpath.types';

import { flattenWallPath } from '../geometry/renderers/wallPathRenderer';
import { closestPointOnSegment } from './segmentMath';

/** Nearest-point projection of a world point onto a flattened polyline. */
interface PolylineProjection {
	/** Index of the sub-segment the nearest point lies on (points[i-1] -> points[i]). */
	segIndex: number;
	/** 0..1 parameter of the nearest point within that sub-segment. */
	t: number;
	/** Nearest point coordinates. */
	x: number;
	y: number;
	/** Distance from (wx, wy) to the nearest point. */
	dist: number;
}

/**
 * Project a world point onto a flattened polyline, returning WHICH sub-segment
 * the nearest point falls on, its in-segment parameter, and the distance.
 * The load-bearing primitive behind distanceToWallPath and (via wallGapOperations)
 * projectToWall. Returns null for a degenerate polyline (< 2 points).
 */
function projectPointToPolyline(
	points: ReadonlyArray<readonly [number, number]>,
	wx: number,
	wy: number,
): PolylineProjection | null {
	if (points.length < 2) return null;
	let best: PolylineProjection | null = null;
	for (let i = 1; i < points.length; i++) {
		const [x0, y0] = points[i - 1];
		const [x1, y1] = points[i];
		const proj = closestPointOnSegment(x0, y0, x1, y1, wx, wy);
		if (best == null || proj.dist < best.dist) {
			best = { segIndex: i, t: proj.t, x: proj.x, y: proj.y, dist: proj.dist };
		}
	}
	return best;
}

/** Min distance from a world point to a wall's flattened centerline. */
function distanceToWallPath(wall: WallPath, wx: number, wy: number): number {
	const flat = flattenWallPath(wall);
	return projectPointToPolyline(flat.points, wx, wy)?.dist ?? Infinity;
}

/** Create a unique wall path ID */
function createWallPathId(): WallPathId {
	return 'wall-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

interface CreateWallPathOptions {
	vertices: WallVertex[];
	tilesetId: string;
	tileId: string;
	kind: 'wall' | 'path';
	closed?: boolean;
	widthScale?: number;
	tint?: string;
	flip?: boolean;
}

/** Construct a WallPath with defaults applied. */
function createWallPath(opts: CreateWallPathOptions): WallPath {
	return {
		id: createWallPathId(),
		vertices: opts.vertices,
		closed: opts.closed ?? false,
		tilesetId: opts.tilesetId,
		tileId: opts.tileId,
		kind: opts.kind,
		widthScale: opts.widthScale ?? 1,
		...(opts.tint != null ? { tint: opts.tint } : {}),
		...(opts.flip === true ? { flip: true } : {}),
	};
}

export { createWallPathId, createWallPath, distanceToWallPath, projectPointToPolyline };
export type { CreateWallPathOptions, PolylineProjection };
