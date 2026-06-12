/**
 * wallPathOperations.ts
 *
 * Construction and manipulation helpers for WallPath data
 * (textures swept along editable polylines).
 */

import type { WallPath, WallPathId, WallVertex } from '#types/core/wallpath.types';

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

export { createWallPathId, createWallPath };
export type { CreateWallPathOptions };
