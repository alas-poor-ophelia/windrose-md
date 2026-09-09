/**
 * segmentTerrainSampler Unit Tests
 *
 * Tests automatic route-segment terrain categorization: per-cell
 * classification (tile tag over paint color, topmost visible layer wins),
 * the majority vote and its tie-breaks, and whole-route sampling on both
 * grid and hex geometry.
 */

import { describe, it, expect } from "vitest";

import type { Cell } from "#types/core/cell.types";
import type { MapLayer } from "#types/core/map.types";
import type { TileAssignment } from "#types/tiles/tile.types";
import type { TravelTerrain } from "#types/settings/travelPack.types";

import {
  classifyCell,
  buildLayerCellMaps,
  sampleSegmentTerrain,
  sampleRouteTerrains,
  type TerrainSampleContext,
} from "../../../src/travel/segmentTerrainSampler";
import { findTileHitInLayers } from "../../../src/assets/tileFootprint";
import { GridGeometry } from "../../../src/geometry/core/GridGeometry";
import { HexGeometry } from "../../../src/geometry/core/HexGeometry";
import { makeLayer } from "../helpers/fixtures";

const gridGeometry = new GridGeometry(32);
const hexGeometry = new HexGeometry(32, "flat");

const PLAINS: TravelTerrain = { id: "plains", name: "Plains", multiplier: 1, color: "#AABBCC" };
const FOREST: TravelTerrain = { id: "forest", name: "Forest", multiplier: 0.5, color: "#00ff00", tileTag: "Forest" };
const ROAD: TravelTerrain = { id: "road", name: "Road", multiplier: 1.5, color: "#ff0000", tileTag: "road" };
const TERRAINS: TravelTerrain[] = [PLAINS, FOREST, ROAD];

/** A painted grid cell */
function paint(x: number, y: number, color: string): Cell {
  return { x, y, color };
}

/** A snapped tile placement whose tags come from the test's tag table */
function tile(col: number, row: number, tileId: string): TileAssignment {
  return { col, row, tilesetId: "ts", tileId };
}

/** A snapped multi-cell tile placement (top-left anchored, extends right/down) */
function spanTile(
  col: number,
  row: number,
  tileId: string,
  spanW: number,
  spanH: number,
  overrides: Partial<Pick<TileAssignment, "placement" | "rotation">> = {}
): TileAssignment {
  return { col, row, tilesetId: "ts", tileId, spanW, spanH, ...overrides };
}

const TAGS: Record<string, string[]> = {
  "forest-tile": ["Nature", "forest"],
  "road-tile": ["road"],
  "rock-tile": ["rock"],
};

function makeCtx(
  layers: MapLayer[],
  overrides: Partial<TerrainSampleContext> = {}
): TerrainSampleContext {
  return {
    layers,
    terrains: TERRAINS,
    geometry: gridGeometry,
    getTileTags: (t: TileAssignment) => TAGS[t.tileId] ?? [],
    ...overrides,
  };
}

/** Paint a horizontal run of grid cells from x=start to x=end inclusive */
function run(start: number, end: number, color: string): Cell[] {
  const cells: Cell[] = [];
  for (let x = start; x <= end; x++) cells.push(paint(x, 0, color));
  return cells;
}

describe("segmentTerrainSampler", () => {
  // ===========================================
  // classifyCell
  // ===========================================

  describe("classifyCell", () => {
    it("matches a painted cell against a terrain swatch", () => {
      const ctx = makeCtx([makeLayer({ cells: [paint(0, 0, "#00ff00")] })]);
      expect(classifyCell({ x: 0, y: 0 }, ctx)).toBe("forest");
    });

    it("matches hex colors case-insensitively and expands shorthand", () => {
      const ctx = makeCtx([makeLayer({ cells: [paint(0, 0, "#0F0"), paint(1, 0, "#aAbBcC")] })]);
      expect(classifyCell({ x: 0, y: 0 }, ctx)).toBe("forest");
      expect(classifyCell({ x: 1, y: 0 }, ctx)).toBe("plains");
    });

    it("returns null for a cell whose color names no terrain", () => {
      const ctx = makeCtx([makeLayer({ cells: [paint(0, 0, "#123456")] })]);
      expect(classifyCell({ x: 0, y: 0 }, ctx)).toBeNull();
    });

    it("returns null for an empty cell", () => {
      const ctx = makeCtx([makeLayer({ cells: [] })]);
      expect(classifyCell({ x: 9, y: 9 }, ctx)).toBeNull();
    });

    it("matches a tile tag case-insensitively", () => {
      const ctx = makeCtx([makeLayer({ cells: [], tiles: [tile(0, 0, "forest-tile")] })]);
      expect(classifyCell({ x: 0, y: 0 }, ctx)).toBe("forest");
    });

    it("lets a tile tag beat the paint color underneath it", () => {
      const ctx = makeCtx([
        makeLayer({ cells: [paint(0, 0, "#AABBCC")], tiles: [tile(0, 0, "forest-tile")] }),
      ]);
      expect(classifyCell({ x: 0, y: 0 }, ctx)).toBe("forest");
    });

    it("falls back to paint color when the tile's tags name no terrain", () => {
      const ctx = makeCtx([
        makeLayer({ cells: [paint(0, 0, "#AABBCC")], tiles: [tile(0, 0, "rock-tile")] }),
      ]);
      expect(classifyCell({ x: 0, y: 0 }, ctx)).toBe("plains");
    });

    it("ignores a terrain with no tileTag when matching tags", () => {
      const ctx = makeCtx([makeLayer({ cells: [], tiles: [tile(0, 0, "rock-tile")] })], {
        terrains: [{ id: "bare", name: "Bare", multiplier: 1 }],
      });
      expect(classifyCell({ x: 0, y: 0 }, ctx)).toBeNull();
    });

    it("takes the paint color from the topmost layer that painted the cell", () => {
      const ctx = makeCtx([
        makeLayer({ id: "bottom", order: 0, cells: [paint(0, 0, "#00ff00")] }),
        makeLayer({ id: "top", order: 1, cells: [paint(0, 0, "#AABBCC")] }),
      ]);
      expect(classifyCell({ x: 0, y: 0 }, ctx)).toBe("plains");
    });

    it("lets an unmatched top-layer color shadow a matching one below", () => {
      const ctx = makeCtx([
        makeLayer({ id: "bottom", order: 0, cells: [paint(0, 0, "#00ff00")] }),
        makeLayer({ id: "top", order: 1, cells: [paint(0, 0, "#123456")] }),
      ]);
      expect(classifyCell({ x: 0, y: 0 }, ctx)).toBeNull();
    });

    it("takes the tile from the topmost layer holding one", () => {
      const ctx = makeCtx([
        makeLayer({ id: "bottom", order: 0, tiles: [tile(0, 0, "forest-tile")] }),
        makeLayer({ id: "top", order: 1, tiles: [tile(0, 0, "road-tile")] }),
      ]);
      expect(classifyCell({ x: 0, y: 0 }, ctx)).toBe("road");
    });
  });

  // ===========================================
  // tile hit index (buildLayerCellMaps) parity with findTileHitInLayers
  // ===========================================

  describe("tile hit index", () => {
    it("finds a multi-cell footprint tile on every covered cell, matching findTileHitInLayers", () => {
      // A 3x2 footprint anchored at (2, 1): covers cols 2-4, rows 1-2.
      const layer = makeLayer({ tiles: [spanTile(2, 1, "road-tile", 3, 2)] });
      const ctx = makeCtx([layer]);
      const cellMaps = buildLayerCellMaps(ctx);

      // Grid of cells spanning the footprint plus a one-cell border outside it.
      for (let x = 1; x <= 5; x++) {
        for (let y = 0; y <= 3; y++) {
          const cell = { x, y };
          const viaIndex = classifyCell(cell, ctx, cellMaps);
          const viaLinearScan = findTileHitInLayers(ctx.layers, cell.x, cell.y);
          const viaLinear = classifyCell(cell, ctx);
          expect(viaIndex).toBe(viaLinear);
          // Sanity: the covered cells actually hit, the border cells don't.
          const inFootprint = x >= 2 && x <= 4 && y >= 1 && y <= 2;
          expect(viaLinearScan != null).toBe(inFootprint);
          if (inFootprint) expect(viaIndex).toBe("road");
        }
      }
    });

    it("prefers the topmost layer's tile via the index, matching the unindexed scan", () => {
      const ctx = makeCtx([
        makeLayer({ id: "bottom", order: 0, tiles: [spanTile(0, 0, "forest-tile", 2, 2)] }),
        makeLayer({ id: "top", order: 1, tiles: [tile(1, 1, "road-tile")] }),
      ]);
      const cellMaps = buildLayerCellMaps(ctx);

      // (1,1) is covered by both layers' tiles; the top layer's road tile wins.
      expect(classifyCell({ x: 1, y: 1 }, ctx, cellMaps)).toBe("road");
      expect(classifyCell({ x: 1, y: 1 }, ctx, cellMaps)).toBe(classifyCell({ x: 1, y: 1 }, ctx));

      // (0,0) is only covered by the bottom layer's forest tile.
      expect(classifyCell({ x: 0, y: 0 }, ctx, cellMaps)).toBe("forest");
      expect(classifyCell({ x: 0, y: 0 }, ctx, cellMaps)).toBe(classifyCell({ x: 0, y: 0 }, ctx));
    });

    it("resolves overlay-over-fill precedence identically via the index", () => {
      const layer = makeLayer({
        tiles: [
          tile(0, 0, "forest-tile"),
          { ...tile(0, 0, "road-tile"), placement: "overlay" as const },
        ],
      });
      const ctx = makeCtx([layer]);
      const cellMaps = buildLayerCellMaps(ctx);
      expect(classifyCell({ x: 0, y: 0 }, ctx, cellMaps)).toBe("road");
      expect(classifyCell({ x: 0, y: 0 }, ctx, cellMaps)).toBe(classifyCell({ x: 0, y: 0 }, ctx));
    });
  });

  // ===========================================
  // sampleSegmentTerrain
  // ===========================================

  describe("sampleSegmentTerrain", () => {
    it("returns the majority terrain over the cells on the line", () => {
      const ctx = makeCtx([
        makeLayer({ cells: [...run(0, 2, "#00ff00"), ...run(3, 4, "#AABBCC")] }),
      ]);
      expect(sampleSegmentTerrain({ x: 0, y: 0 }, { x: 4, y: 0 }, ctx)).toBe("forest");
    });

    it("does not let unmatched cells vote", () => {
      const ctx = makeCtx([
        makeLayer({ cells: [paint(0, 0, "#00ff00"), ...run(1, 4, "#123456")] }),
      ]);
      expect(sampleSegmentTerrain({ x: 0, y: 0 }, { x: 4, y: 0 }, ctx)).toBe("forest");
    });

    it("returns null when no cell on the line matches", () => {
      const ctx = makeCtx([makeLayer({ cells: run(0, 4, "#123456") })]);
      expect(sampleSegmentTerrain({ x: 0, y: 0 }, { x: 4, y: 0 }, ctx)).toBeNull();
    });

    it("returns null when the route has nothing under it at all", () => {
      const ctx = makeCtx([makeLayer({ cells: [] })]);
      expect(sampleSegmentTerrain({ x: 0, y: 0 }, { x: 4, y: 0 }, ctx)).toBeNull();
    });

    it("returns null when there are no terrains to vote for", () => {
      const ctx = makeCtx([makeLayer({ cells: run(0, 4, "#00ff00") })], { terrains: [] });
      expect(sampleSegmentTerrain({ x: 0, y: 0 }, { x: 4, y: 0 }, ctx)).toBeNull();
    });

    it("breaks a tie toward the previous segment's terrain", () => {
      const ctx = makeCtx([
        makeLayer({ cells: [...run(0, 1, "#AABBCC"), ...run(2, 3, "#ff0000")] }),
      ]);
      expect(sampleSegmentTerrain({ x: 0, y: 0 }, { x: 3, y: 0 }, ctx, "road")).toBe("road");
    });

    it("breaks a tie toward pack order when there is no previous terrain", () => {
      const ctx = makeCtx([
        makeLayer({ cells: [...run(0, 1, "#AABBCC"), ...run(2, 3, "#ff0000")] }),
      ]);
      expect(sampleSegmentTerrain({ x: 0, y: 0 }, { x: 3, y: 0 }, ctx, null)).toBe("plains");
    });

    it("ignores a previous terrain that is not among the tied leaders", () => {
      const ctx = makeCtx([
        makeLayer({ cells: [...run(0, 1, "#AABBCC"), ...run(2, 3, "#ff0000")] }),
      ]);
      expect(sampleSegmentTerrain({ x: 0, y: 0 }, { x: 3, y: 0 }, ctx, "forest")).toBe("plains");
    });

    it("does not let the previous terrain beat an outright majority", () => {
      const ctx = makeCtx([
        makeLayer({ cells: [...run(0, 2, "#00ff00"), ...run(3, 4, "#ff0000")] }),
      ]);
      expect(sampleSegmentTerrain({ x: 0, y: 0 }, { x: 4, y: 0 }, ctx, "road")).toBe("forest");
    });

    it("counts tagged tiles alongside painted cells", () => {
      const ctx = makeCtx([
        makeLayer({
          cells: run(0, 4, "#AABBCC"),
          tiles: [tile(0, 0, "road-tile"), tile(1, 0, "road-tile"), tile(2, 0, "road-tile")],
        }),
      ]);
      expect(sampleSegmentTerrain({ x: 0, y: 0 }, { x: 4, y: 0 }, ctx)).toBe("road");
    });

    it("samples a single-cell segment", () => {
      const ctx = makeCtx([makeLayer({ cells: [paint(2, 2, "#ff0000")] })]);
      expect(sampleSegmentTerrain({ x: 2, y: 2 }, { x: 2, y: 2 }, ctx)).toBe("road");
    });

    it("samples a diagonal grid line", () => {
      const ctx = makeCtx([
        makeLayer({ cells: [paint(0, 0, "#ff0000"), paint(1, 1, "#ff0000"), paint(2, 2, "#ff0000")] }),
      ]);
      expect(sampleSegmentTerrain({ x: 0, y: 0 }, { x: 2, y: 2 }, ctx)).toBe("road");
    });

    it("samples a hex line in axial coordinates", () => {
      const ctx = makeCtx(
        [makeLayer({ cells: [
          { q: 0, r: 0, color: "#00ff00" },
          { q: 1, r: 0, color: "#00ff00" },
          { q: 2, r: 0, color: "#AABBCC" },
          { q: 3, r: 0, color: "#AABBCC" },
        ] })],
        { geometry: hexGeometry }
      );
      expect(sampleSegmentTerrain({ x: 0, y: 0 }, { x: 1, y: 0 }, ctx)).toBe("forest");
      expect(sampleSegmentTerrain({ x: 2, y: 0 }, { x: 3, y: 0 }, ctx)).toBe("plains");
      expect(sampleSegmentTerrain({ x: 0, y: 0 }, { x: 3, y: 0 }, ctx, "plains")).toBe("plains");
    });
  });

  // ===========================================
  // sampleRouteTerrains
  // ===========================================

  describe("sampleRouteTerrains", () => {
    it("returns one result per segment", () => {
      const ctx = makeCtx([makeLayer({ cells: run(0, 4, "#00ff00") })]);
      const results = sampleRouteTerrains(
        [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }],
        ctx
      );
      expect(results).toEqual(["forest", "forest"]);
    });

    it("returns an empty array for fewer than two points", () => {
      const ctx = makeCtx([makeLayer({ cells: [] })]);
      expect(sampleRouteTerrains([], ctx)).toEqual([]);
      expect(sampleRouteTerrains([{ x: 0, y: 0 }], ctx)).toEqual([]);
    });

    it("chains the tie-break through the segment it just decided", () => {
      // Segment 1 (x 0..3) is an outright road majority; segment 2 (x 3..6)
      // ties road against plains 2-2 and must follow the road it came from
      // rather than falling back to pack order (which would say plains).
      const ctx = makeCtx([
        makeLayer({ cells: [...run(0, 3, "#ff0000"), ...run(4, 5, "#AABBCC"), paint(6, 0, "#ff0000")] }),
      ]);
      const results = sampleRouteTerrains(
        [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 6, y: 0 }],
        ctx
      );
      expect(results).toEqual(["road", "road"]);
    });

    it("seeds the first segment's tie-break with the supplied default", () => {
      const ctx = makeCtx([
        makeLayer({ cells: [...run(0, 1, "#AABBCC"), ...run(2, 3, "#ff0000")] }),
      ]);
      expect(sampleRouteTerrains([{ x: 0, y: 0 }, { x: 3, y: 0 }], ctx, "road")).toEqual(["road"]);
      expect(sampleRouteTerrains([{ x: 0, y: 0 }, { x: 3, y: 0 }], ctx)).toEqual(["plains"]);
    });

    it("keeps carrying the last matched terrain across an unmatched segment", () => {
      const ctx = makeCtx([
        makeLayer({ cells: [...run(0, 1, "#ff0000"), ...run(2, 5, "#123456"), ...run(6, 7, "#AABBCC"), ...run(8, 9, "#ff0000")] }),
      ]);
      const results = sampleRouteTerrains(
        [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 5, y: 0 }, { x: 9, y: 0 }],
        ctx
      );
      // Segment 2 matches nothing; segment 3 ties plains against road and
      // still remembers the road from segment 1.
      expect(results).toEqual(["road", null, "road"]);
    });
  });
});
