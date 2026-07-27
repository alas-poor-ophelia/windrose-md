/**
 * routeOperations Unit Tests
 *
 * Tests multi-waypoint route editing, per-segment distance computation
 * (grid diagonal rules and true hex distance), and saved-route creation.
 */

import { describe, it, expect } from "vitest";

import {
  SAVED_ROUTE_DEFAULTS,
  appendWaypoint,
  removeLastWaypoint,
  appendRouteWaypoint,
  removeLastRouteWaypoint,
  setSegmentTerrain,
  computeSegmentDistances,
  sumDistances,
  createSavedRoute,
  removeSavedRoute,
} from "../../../src/drawing/routeOperations";
import { GridGeometry } from "../../../src/geometry/core/GridGeometry";
import { HexGeometry } from "../../../src/geometry/core/HexGeometry";

const gridGeometry = new GridGeometry(32);
const hexGeometry = new HexGeometry(32, "flat");

describe("routeOperations", () => {
  // ===========================================================================
  // appendWaypoint
  // ===========================================================================

  describe("appendWaypoint", () => {
    it("appends a waypoint to an empty route", () => {
      const result = appendWaypoint([], { x: 3, y: 4 });
      expect(result).toEqual([{ x: 3, y: 4 }]);
    });

    it("appends waypoints in click order", () => {
      const route = appendWaypoint(appendWaypoint([], { x: 0, y: 0 }), { x: 5, y: 0 });
      expect(route).toEqual([{ x: 0, y: 0 }, { x: 5, y: 0 }]);
    });

    it("ignores a repeat click on the last waypoint (no zero-length segments)", () => {
      const route = [{ x: 2, y: 2 }];
      const result = appendWaypoint(route, { x: 2, y: 2 });
      expect(result).toBe(route);
    });

    it("allows revisiting an earlier cell (loops are legitimate routes)", () => {
      const route = [{ x: 0, y: 0 }, { x: 5, y: 0 }];
      const result = appendWaypoint(route, { x: 0, y: 0 });
      expect(result).toHaveLength(3);
    });

    it("does not mutate the input array", () => {
      const route = [{ x: 0, y: 0 }];
      appendWaypoint(route, { x: 1, y: 1 });
      expect(route).toHaveLength(1);
    });

    it("copies the appended point", () => {
      const point = { x: 1, y: 1 };
      const result = appendWaypoint([], point);
      expect(result[0]).not.toBe(point);
    });
  });

  // ===========================================================================
  // removeLastWaypoint
  // ===========================================================================

  describe("removeLastWaypoint", () => {
    it("removes the last waypoint", () => {
      const result = removeLastWaypoint([{ x: 0, y: 0 }, { x: 5, y: 0 }]);
      expect(result).toEqual([{ x: 0, y: 0 }]);
    });

    it("returns an empty array from a single waypoint", () => {
      expect(removeLastWaypoint([{ x: 0, y: 0 }])).toEqual([]);
    });

    it("returns an empty array from an empty route", () => {
      expect(removeLastWaypoint([])).toEqual([]);
    });

    it("does not mutate the input array", () => {
      const route = [{ x: 0, y: 0 }, { x: 5, y: 0 }];
      removeLastWaypoint(route);
      expect(route).toHaveLength(2);
    });
  });

  // ===========================================================================
  // Terrain-aware route editing
  // ===========================================================================

  describe("appendRouteWaypoint", () => {
    it("creates no terrain entry for the first waypoint", () => {
      const route = appendRouteWaypoint({ points: [], segmentTerrains: [] }, { x: 0, y: 0 }, "t-plains");
      expect(route.points).toHaveLength(1);
      expect(route.segmentTerrains).toEqual([]);
    });

    it("defaults the first segment to the provided terrain (TM-21)", () => {
      let route = appendRouteWaypoint({ points: [], segmentTerrains: [] }, { x: 0, y: 0 }, "t-plains");
      route = appendRouteWaypoint(route, { x: 3, y: 0 }, "t-plains");
      expect(route.segmentTerrains).toEqual(["t-plains"]);
    });

    it("inherits the previous segment's terrain for later segments (TM-21)", () => {
      let route = { points: [{ x: 0, y: 0 }, { x: 3, y: 0 }], segmentTerrains: ["t-forest" as string | null] };
      route = appendRouteWaypoint(route, { x: 6, y: 0 }, "t-plains");
      expect(route.segmentTerrains).toEqual(["t-forest", "t-forest"]);
    });

    it("inherits an explicit unassigned (null) rather than re-defaulting", () => {
      let route = { points: [{ x: 0, y: 0 }, { x: 3, y: 0 }], segmentTerrains: [null as string | null] };
      route = appendRouteWaypoint(route, { x: 6, y: 0 }, "t-plains");
      expect(route.segmentTerrains).toEqual([null, null]);
    });

    it("uses null for the first segment when no default terrain exists", () => {
      let route = appendRouteWaypoint({ points: [], segmentTerrains: [] }, { x: 0, y: 0 }, null);
      route = appendRouteWaypoint(route, { x: 3, y: 0 }, null);
      expect(route.segmentTerrains).toEqual([null]);
    });

    it("is a no-op for a repeat click on the last waypoint", () => {
      const route = { points: [{ x: 0, y: 0 }], segmentTerrains: [] };
      expect(appendRouteWaypoint(route, { x: 0, y: 0 }, "t-plains")).toBe(route);
    });
  });

  describe("removeLastRouteWaypoint", () => {
    it("drops the last waypoint and its segment terrain together", () => {
      const route = {
        points: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 6, y: 0 }],
        segmentTerrains: ["t-forest", "t-road"] as (string | null)[],
      };
      const result = removeLastRouteWaypoint(route);
      expect(result.points).toHaveLength(2);
      expect(result.segmentTerrains).toEqual(["t-forest"]);
    });
  });

  describe("setSegmentTerrain", () => {
    const route = {
      points: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 6, y: 0 }],
      segmentTerrains: ["t-forest", "t-road"] as (string | null)[],
    };

    it("assigns a terrain to one segment", () => {
      const result = setSegmentTerrain(route, 1, "t-swamp");
      expect(result.segmentTerrains).toEqual(["t-forest", "t-swamp"]);
    });

    it("assigns null to mark a segment unassigned (TM-22)", () => {
      const result = setSegmentTerrain(route, 0, null);
      expect(result.segmentTerrains).toEqual([null, "t-road"]);
    });

    it("ignores out-of-range indices", () => {
      expect(setSegmentTerrain(route, 5, "t-swamp")).toBe(route);
      expect(setSegmentTerrain(route, -1, "t-swamp")).toBe(route);
    });
  });

  // ===========================================================================
  // computeSegmentDistances
  // ===========================================================================

  describe("computeSegmentDistances", () => {
    it("returns empty for 0 or 1 points", () => {
      expect(computeSegmentDistances([], gridGeometry, "equal")).toEqual([]);
      expect(computeSegmentDistances([{ x: 0, y: 0 }], gridGeometry, "equal")).toEqual([]);
    });

    it("computes straight grid segments", () => {
      const distances = computeSegmentDistances(
        [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }],
        gridGeometry,
        "equal"
      );
      expect(distances).toEqual([4, 3]);
    });

    it("honors the equal diagonal rule on grid maps", () => {
      const distances = computeSegmentDistances(
        [{ x: 0, y: 0 }, { x: 3, y: 3 }],
        gridGeometry,
        "equal"
      );
      expect(distances).toEqual([3]);
    });

    it("honors the alternating (5-10-5) diagonal rule on grid maps", () => {
      // 3 diagonals: 1 + 2 + 1 = 4
      const distances = computeSegmentDistances(
        [{ x: 0, y: 0 }, { x: 3, y: 3 }],
        gridGeometry,
        "alternating"
      );
      expect(distances).toEqual([4]);
    });

    it("honors the euclidean diagonal rule on grid maps", () => {
      const distances = computeSegmentDistances(
        [{ x: 0, y: 0 }, { x: 3, y: 4 }],
        gridGeometry,
        "euclidean"
      );
      expect(distances).toEqual([5]);
    });

    it("computes true hex distance on hex maps", () => {
      const distances = computeSegmentDistances(
        [{ x: 0, y: 0 }, { x: 2, y: 1 }],
        hexGeometry,
        "equal"
      );
      expect(distances).toEqual([3]);
    });

    it("matches the acceptance sketch: 4-waypoint route totals hand-computed distance", () => {
      // (0,0) → (4,0) = 4; (4,0) → (4,3) = 3; (4,3) → (2,3) = 2 under 'equal'
      const points = [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 2, y: 3 },
      ];
      const distances = computeSegmentDistances(points, gridGeometry, "equal");
      expect(sumDistances(distances)).toBe(9);
    });
  });

  // ===========================================================================
  // sumDistances
  // ===========================================================================

  describe("sumDistances", () => {
    it("sums segment distances", () => {
      expect(sumDistances([4, 3, 2.5])).toBe(9.5);
    });

    it("returns 0 for an empty list", () => {
      expect(sumDistances([])).toBe(0);
    });
  });

  // ===========================================================================
  // createSavedRoute
  // ===========================================================================

  describe("createSavedRoute", () => {
    const points = [{ x: 0, y: 0 }, { x: 5, y: 0 }];

    it("creates a route with defaults", () => {
      const route = createSavedRoute(points);
      expect(route.id).toMatch(/^route-/);
      expect(route.points).toEqual(points);
      expect(route.color).toBe(SAVED_ROUTE_DEFAULTS.color);
      expect(route.width).toBe(SAVED_ROUTE_DEFAULTS.width);
      expect(route.showLabel).toBe(SAVED_ROUTE_DEFAULTS.showLabel);
      expect(route.name).toBeUndefined();
    });

    it("applies style overrides", () => {
      const route = createSavedRoute(points, {
        name: "Road to Karst Pass",
        color: "#ff0000",
        width: 5,
        showLabel: false,
      });
      expect(route.name).toBe("Road to Karst Pass");
      expect(route.color).toBe("#ff0000");
      expect(route.width).toBe(5);
      expect(route.showLabel).toBe(false);
    });

    it("omits an empty name", () => {
      const route = createSavedRoute(points, { name: "" });
      expect(route.name).toBeUndefined();
    });

    it("preserves segment terrain assignments", () => {
      const route = createSavedRoute(points, { segmentTerrains: ["forest"] });
      expect(route.segmentTerrains).toEqual(["forest"]);
    });

    it("deep-copies the waypoints", () => {
      const route = createSavedRoute(points);
      expect(route.points).not.toBe(points);
      expect(route.points[0]).not.toBe(points[0]);
    });

    it("generates unique ids", () => {
      const a = createSavedRoute(points);
      const b = createSavedRoute(points);
      expect(a.id).not.toBe(b.id);
    });

    it("throws with fewer than 2 points", () => {
      expect(() => createSavedRoute([{ x: 0, y: 0 }])).toThrow();
      expect(() => createSavedRoute([])).toThrow();
    });
  });

  // ===========================================================================
  // removeSavedRoute
  // ===========================================================================

  describe("removeSavedRoute", () => {
    it("removes a route by id", () => {
      const a = createSavedRoute([{ x: 0, y: 0 }, { x: 1, y: 0 }]);
      const b = createSavedRoute([{ x: 0, y: 0 }, { x: 0, y: 1 }]);
      const result = removeSavedRoute([a, b], a.id);
      expect(result).toEqual([b]);
    });

    it("returns an equivalent array for an unknown id", () => {
      const a = createSavedRoute([{ x: 0, y: 0 }, { x: 1, y: 0 }]);
      expect(removeSavedRoute([a], "route-nope")).toEqual([a]);
    });

    it("does not mutate the input array", () => {
      const a = createSavedRoute([{ x: 0, y: 0 }, { x: 1, y: 0 }]);
      const routes = [a];
      removeSavedRoute(routes, a.id);
      expect(routes).toHaveLength(1);
    });
  });
});
