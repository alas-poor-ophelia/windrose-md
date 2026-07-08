/**
 * wallPathOperations.ts
 *
 * Construction and manipulation helpers for WallPath data
 * (textures swept along editable polylines).
 */

import type { WallPath, WallPathId, WallVertex } from '#types/core/wallpath.types';

import { flattenWallPath } from '../geometry/renderers/wallPathRenderer';

/** Min distance from a world point to a wall's flattened centerline. */
function distanceToWallPath(wall: WallPath, wx: number, wy: number): number {
	const flat = flattenWallPath(wall);
	let best = Infinity;
	const pts = flat.points;
	for (let i = 1; i < pts.length; i++) {
		const [x0, y0] = pts[i - 1];
		const [x1, y1] = pts[i];
		const len2 = (x1 - x0) ** 2 + (y1 - y0) ** 2;
		let t = 0;
		if (len2 > 0) {
			t = Math.max(0, Math.min(1, ((wx - x0) * (x1 - x0) + (wy - y0) * (y1 - y0)) / len2));
		}
		const d = Math.hypot(wx - (x0 + t * (x1 - x0)), wy - (y0 + t * (y1 - y0)));
		if (d < best) best = d;
	}
	return best;
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

export { createWallPathId, createWallPath, distanceToWallPath };
export type { CreateWallPathOptions };
