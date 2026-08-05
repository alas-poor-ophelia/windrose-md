/**
 * wallPathOperations.ts
 *
 * Construction and manipulation helpers for WallPath data
 * (textures swept along editable polylines).
 */

import type { WallPath, WallPathId, WallVertex } from '#types/core/wallpath.types';

import { flattenWallPath } from './wallPathFlatten';
import { projectPointToPolyline } from './segmentMath';
import type { PolylineProjection } from './segmentMath';

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
