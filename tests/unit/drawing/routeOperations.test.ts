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
