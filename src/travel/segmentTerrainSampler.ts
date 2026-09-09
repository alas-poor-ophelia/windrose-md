/**
 * segmentTerrainSampler.ts
 *
 * Automatic terrain categorization for route segments: given two waypoints,
 * look at what the map actually holds between them and pick the travel
 * terrain that best describes the crossing.
 *
 * The rule is a plain majority vote over the cells the geometry reports on
 * the line (`IGeometry.getCellsInLine`). Each cell casts at most one vote:
 * a tile tag beats a paint color, and a cell that matches nothing abstains
 * rather than voting for a default — a route crossing four unpainted cells
 * and one swamp is a swamp crossing, not an "unassigned" one. Ties break
 * toward the previous segment's terrain (routes are continuous; a road that
 * ties with forest is still the road you were on) and otherwise toward the
 * first terrain in pack order, so the result never depends on Map iteration
 * or array churn.
 *
 * The module is deliberately pure: no plugin, no vault, no Obsidian. Tile
 * tags arrive through an injected lookup because resolving a placement to
 * its tile entry needs the tileset list and the metadata store, both of
 * which are caller state.
 */

// Type-only imports
import type { Point, IGeometry } from '#types/core/geometry.types';
import type { MapLayer } from '#types/core/map.types';
import type { CellMap } from '#types/core/cell.types';
import type { TileAssignment } from '#types/tiles/tile.types';
import type { TravelTerrain } from '#types/settings/travelPack.types';

import { findTileHitInLayers } from '../assets/tileFootprint';
import { buildCellMap, cellKey } from '../geometry/core/cellAccessor';
import { colorsMatch } from '../drawing/colorOperations';

/**
 * Resolve the tags carried by a placed tile. Injected by the caller, which
 * owns the tilesets and the tile-metadata store:
 * `tile => { const entry = resolveTileEntry(tilesetById(tile.tilesetId), tile.tileId);
 *            return entry ? getAllTags(entry, metadata) : []; }`
 */
type TileTagLookup = (tile: TileAssignment) => readonly string[];

/** Everything a sample needs about the map it is sampling. */
interface TerrainSampleContext {
  /**
   * Visible layers in ASCENDING draw order — bottom first, exactly what
   * `getRenderLayers` / `getActiveBoardLayers` return. Both scans here walk
   * it in reverse so the topmost layer wins.
   */
  layers: readonly MapLayer[];
  /** Candidate terrains flattened across enabled packs, in pack order */
  terrains: readonly TravelTerrain[];
  geometry: IGeometry;
  getTileTags: TileTagLookup;
}

/**
 * Per-layer cell lookups, parallel to `ctx.layers`. Building these once and
 * threading them through turns the paint-color scan from a linear search
 * per cell per layer into a map hit; a long route over a busy map is
 * otherwise quadratic.
 */
type LayerCellMaps = readonly CellMap[];

/** Build the per-layer cell lookups for a context. */
function buildLayerCellMaps(ctx: TerrainSampleContext): LayerCellMaps {
  return ctx.layers.map(layer => buildCellMap(layer.cells, ctx.geometry));
}

/** Case-insensitive tag membership; tags keep their authored casing. */
function hasTag(tags: readonly string[], tag: string): boolean {
  const needle = tag.trim().toLowerCase();
  if (needle === '') return false;
  return tags.some(t => t.trim().toLowerCase() === needle);
}

/**
 * The terrain a tile's tags name, or null. Terrains are tried in pack order
 * so the first pack to claim a tag wins when two packs share one.
 */
function terrainForTags(
  tags: readonly string[],
  terrains: readonly TravelTerrain[]
): string | null {
  for (const terrain of terrains) {
    const tileTag = terrain.tileTag;
    if (tileTag == null || tileTag.trim() === '') continue;
    if (hasTag(tags, tileTag)) return terrain.id;
  }
  return null;
}

/** The terrain whose swatch equals a painted color, or null. */
function terrainForColor(
  color: string | null | undefined,
  terrains: readonly TravelTerrain[]
): string | null {
  if (color == null || color === '') return null;
  for (const terrain of terrains) {
    if (terrain.color == null || terrain.color === '') continue;
    if (colorsMatch(color, terrain.color)) return terrain.id;
  }
  return null;
}

/**
 * The paint color visible at a cell: the topmost layer that has painted it
 * wins, matching how the canvas composites. A cell painted on a top layer
 * shadows one below even when its color names no terrain — the same way it
 * shadows it visually.
 */
function visibleCellColor(
  cell: Point,
  ctx: TerrainSampleContext,
  cellMaps: LayerCellMaps
): string | null {
  const key = cellKey(cell, ctx.geometry);
  for (let i = cellMaps.length - 1; i >= 0; i--) {
    const found = cellMaps[i].get(key);
    if (found != null) return found.color ?? null;
  }
  return null;
}

/**
 * Classify one cell as a terrain, or null when nothing on it matches.
 *
 * Tile tag first: only the topmost tile on the cell is consulted (first
 * tile found wins), so a tagged tile under an untagged one does not leak a
 * vote. Paint color is the fallback, never an override.
 *
 * `cellMaps` is an optional prebuilt lookup — pass the one from a route
 * sample to avoid rebuilding it per cell.
 */
function classifyCell(
  cell: Point,
  ctx: TerrainSampleContext,
  cellMaps?: LayerCellMaps
): string | null {
  const hit = findTileHitInLayers(ctx.layers, cell.x, cell.y);
  if (hit != null) {
    const tile = hit.layer.tiles?.[hit.index];
    if (tile != null) {
      const byTag = terrainForTags(ctx.getTileTags(tile), ctx.terrains);
      if (byTag != null) return byTag;
    }
  }
  const maps = cellMaps ?? buildLayerCellMaps(ctx);
  return terrainForColor(visibleCellColor(cell, ctx, maps), ctx.terrains);
}

/**
 * Resolve a vote tally to a winner. Ties break toward `previousTerrainId`
 * when it is among the leaders, otherwise toward whichever leader comes
 * first in pack order.
 */
function resolveWinner(
  votes: ReadonlyMap<string, number>,
  terrains: readonly TravelTerrain[],
  previousTerrainId: string | null
): string | null {
  let best = 0;
  for (const count of votes.values()) {
    if (count > best) best = count;
  }
  if (best === 0) return null;

  if (previousTerrainId != null && votes.get(previousTerrainId) === best) {
    return previousTerrainId;
  }
  for (const terrain of terrains) {
    if (votes.get(terrain.id) === best) return terrain.id;
  }
  // Votes for a terrain that vanished from the packs mid-sample: fall back
  // to the first tallied id rather than reporting no result at all.
  for (const [id, count] of votes) {
    if (count === best) return id;
  }
  return null;
}

/**
 * Sample the terrain of one segment: majority vote over the cells between
 * two waypoints. Returns the winning terrain id, or null when no cell on
 * the line matched any terrain.
 */
function sampleSegmentTerrain(
  a: Point,
  b: Point,
  ctx: TerrainSampleContext,
  previousTerrainId: string | null = null,
  cellMaps?: LayerCellMaps
): string | null {
  if (ctx.terrains.length === 0) return null;
  const maps = cellMaps ?? buildLayerCellMaps(ctx);
  const cells = ctx.geometry.getCellsInLine(a.x, a.y, b.x, b.y);
  const votes = new Map<string, number>();
  for (const cell of cells) {
    const terrainId = classifyCell(cell, ctx, maps);
    if (terrainId == null) continue;
    votes.set(terrainId, (votes.get(terrainId) ?? 0) + 1);
  }
  return resolveWinner(votes, ctx.terrains, previousTerrainId);
}

/**
 * Sample every segment of a waypoint sequence. Returns one entry per
 * segment (`points.length - 1`, empty for 0 or 1 points), aligned with
 * `segmentTerrains` so the result feeds straight into `applyAutoTerrains`.
 *
 * Each segment's tie-break looks at the segment before it — the value this
 * pass just produced, not the route's stored one, so a fresh sample is
 * self-consistent. `firstSegmentTerrainId` seeds that chain for segment 0
 * (pass the map's default terrain, or null).
 */
function sampleRouteTerrains(
  points: readonly Point[],
  ctx: TerrainSampleContext,
  firstSegmentTerrainId: string | null = null
): (string | null)[] {
  if (points.length < 2) return [];
  const cellMaps = buildLayerCellMaps(ctx);
  const results: (string | null)[] = [];
  let previous = firstSegmentTerrainId;
  for (let i = 1; i < points.length; i++) {
    const terrainId = sampleSegmentTerrain(points[i - 1], points[i], ctx, previous, cellMaps);
    results.push(terrainId);
    if (terrainId != null) previous = terrainId;
  }
  return results;
}

export type { TileTagLookup, TerrainSampleContext, LayerCellMaps };
export {
  buildLayerCellMaps,
  classifyCell,
  sampleSegmentTerrain,
  sampleRouteTerrains,
};
