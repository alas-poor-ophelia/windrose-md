/**
 * edgeOperations Unit Tests
 *
 * Tests edge manipulation for grid maps.
 * Edges represent painted grid lines between cells.
 *
 * Key concept: Edge normalization
 * - 'left' → 'right' of x-1
 * - 'top' → 'bottom' of y-1
 */

import { describe, it, expect } from "vitest";

import {
  normalizeEdge,
  generateEdgeId,
  getEdgeAt,
  addEdge,
  removeEdge,
  removeEdgeById,
  updateEdge,
  generateEdgeLine,
  mergeEdges,
  removeEdgeLine,
  getEdgesForCell,
  clearAllEdges,
} from "../../../src/drawing/edgeOperations";

import type { Edge } from "../../../src/drawing/edgeOperations";

// Helper to create test edges
function createEdge(
  x: number,
  y: number,
  side: "right" | "bottom",
  color = "#ff0000",
  id = `edge-${x}-${y}-${side}`
): Edge {
  return { id, x, y, side, color };
}

describe("edgeOperations", () => {
  // ===========================================================================
  // normalizeEdge
  // ===========================================================================

  describe("normalizeEdge", () => {
    it("keeps 'right' side unchanged", () => {
      const result = normalizeEdge(5, 3, "right");
      expect(result).toEqual({ x: 5, y: 3, side: "right" });
    });

    it("keeps 'bottom' side unchanged", () => {
      const result = normalizeEdge(5, 3, "bottom");
      expect(result).toEqual({ x: 5, y: 3, side: "bottom" });
    });

    it("converts 'left' to 'right' of x-1", () => {
      // Left edge of (5,3) = Right edge of (4,3)
      const result = normalizeEdge(5, 3, "left");
      expect(result).toEqual({ x: 4, y: 3, side: "right" });
    });

    it("converts 'top' to 'bottom' of y-1", () => {
      // Top edge of (5,3) = Bottom edge of (5,2)
      const result = normalizeEdge(5, 3, "top");
      expect(result).toEqual({ x: 5, y: 2, side: "bottom" });
    });

    it("handles origin coordinates", () => {
      expect(normalizeEdge(0, 0, "left")).toEqual({ x: -1, y: 0, side: "right" });
      expect(normalizeEdge(0, 0, "top")).toEqual({ x: 0, y: -1, side: "bottom" });
    });

    it("handles negative coordinates", () => {
      expect(normalizeEdge(-3, -2, "left")).toEqual({
        x: -4,
        y: -2,
        side: "right",
      });
      expect(normalizeEdge(-3, -2, "top")).toEqual({
        x: -3,
        y: -3,
        side: "bottom",
      });
    });
  });

  // ===========================================================================
  // generateEdgeId
  // ===========================================================================

  describe("generateEdgeId", () => {
    it("returns string starting with 'edge-'", () => {
      const id = generateEdgeId();
      expect(id.startsWith("edge-")).toBe(true);
    });

    it("generates unique IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateEdgeId());
      }
      // All 100 should be unique
      expect(ids.size).toBe(100);
    });
  });

  // ===========================================================================
  // getEdgeAt
  // ===========================================================================

  describe("getEdgeAt", () => {
    it("returns edge when found", () => {
      const edges = [createEdge(5, 3, "right")];
      const result = getEdgeAt(edges, 5, 3, "right");

      expect(result).not.toBeNull();
      expect(result!.x).toBe(5);
      expect(result!.y).toBe(3);
      expect(result!.side).toBe("right");
    });

    it("returns null when edge not found", () => {
      const edges = [createEdge(5, 3, "right")];
      expect(getEdgeAt(edges, 5, 3, "bottom")).toBeNull();
      expect(getEdgeAt(edges, 6, 3, "right")).toBeNull();
    });

    it("handles 'left' side normalization", () => {
      // Edge stored as right of (4,3), queried as left of (5,3)
      const edges = [createEdge(4, 3, "right")];
      const result = getEdgeAt(edges, 5, 3, "left");
      expect(result).not.toBeNull();
    });

    it("handles 'top' side normalization", () => {
      // Edge stored as bottom of (5,2), queried as top of (5,3)
      const edges = [createEdge(5, 2, "bottom")];
      const result = getEdgeAt(edges, 5, 3, "top");
      expect(result).not.toBeNull();
    });

    it("returns null for null edges", () => {
      expect(getEdgeAt(null, 0, 0, "right")).toBeNull();
    });

    it("returns null for undefined edges", () => {
      expect(getEdgeAt(undefined, 0, 0, "right")).toBeNull();
    });

    it("returns null for empty array", () => {
      expect(getEdgeAt([], 0, 0, "right")).toBeNull();
    });
  });

  // ===========================================================================
  // addEdge
  // ===========================================================================

  describe("addEdge", () => {
    it("adds new edge to empty array", () => {
      const result = addEdge([], 5, 3, "right", "#ff0000");

      expect(result).toHaveLength(1);
      expect(result[0].x).toBe(5);
      expect(result[0].y).toBe(3);
      expect(result[0].side).toBe("right");
      expect(result[0].color).toBe("#ff0000");
    });

    it("adds new edge to existing array", () => {
      const edges = [createEdge(0, 0, "right")];
      const result = addEdge(edges, 5, 3, "bottom", "#00ff00");

      expect(result).toHaveLength(2);
    });

    it("normalizes 'left' side", () => {
      const result = addEdge([], 5, 3, "left", "#ff0000");

      expect(result).toHaveLength(1);
      expect(result[0].x).toBe(4);
      expect(result[0].y).toBe(3);
      expect(result[0].side).toBe("right");
    });

    it("normalizes 'top' side", () => {
      const result = addEdge([], 5, 3, "top", "#ff0000");

      expect(result).toHaveLength(1);
      expect(result[0].x).toBe(5);
      expect(result[0].y).toBe(2);
      expect(result[0].side).toBe("bottom");
    });

    it("updates color when edge exists", () => {
      const edges = [createEdge(5, 3, "right", "#ff0000")];
      const result = addEdge(edges, 5, 3, "right", "#00ff00");

      expect(result).toHaveLength(1);
      expect(result[0].color).toBe("#00ff00");
    });

    it("updates color via normalized lookup", () => {
      const edges = [createEdge(4, 3, "right", "#ff0000")];
      const result = addEdge(edges, 5, 3, "left", "#00ff00"); // Same edge, different representation

      expect(result).toHaveLength(1);
      expect(result[0].color).toBe("#00ff00");
    });

    it("sets default opacity to 1", () => {
      const result = addEdge([], 5, 3, "right", "#ff0000");
      expect(result[0].opacity).toBe(1);
    });

    it("accepts custom opacity", () => {
      const result = addEdge([], 5, 3, "right", "#ff0000", 0.5);
      expect(result[0].opacity).toBe(0.5);
    });

    it("handles null edges", () => {
      const result = addEdge(null, 5, 3, "right", "#ff0000");
      expect(result).toHaveLength(1);
    });

    it("handles undefined edges", () => {
      const result = addEdge(undefined, 5, 3, "right", "#ff0000");
      expect(result).toHaveLength(1);
    });

    it("returns original for invalid inputs", () => {
      const edges = [createEdge(0, 0, "right")];
      expect(addEdge(edges, null, 3, "right", "#ff0000")).toEqual(edges);
      expect(addEdge(edges, 5, null, "right", "#ff0000")).toEqual(edges);
      expect(addEdge(edges, 5, 3, null, "#ff0000")).toEqual(edges);
      expect(addEdge(edges, 5, 3, "right", null)).toEqual(edges);
    });

    it("generates unique ID for new edge", () => {
      const result = addEdge([], 5, 3, "right", "#ff0000");
      expect(result[0].id).toBeDefined();
      expect(result[0].id.startsWith("edge-")).toBe(true);
    });
  });

  // ===========================================================================
  // removeEdge
  // ===========================================================================

  describe("removeEdge", () => {
    it("removes existing edge", () => {
      const edges = [
        createEdge(5, 3, "right"),
        createEdge(5, 3, "bottom"),
      ];
      const result = removeEdge(edges, 5, 3, "right");

      expect(result).toHaveLength(1);
      expect(result[0].side).toBe("bottom");
    });

    it("handles 'left' side normalization", () => {
      const edges = [createEdge(4, 3, "right")];
      const result = removeEdge(edges, 5, 3, "left"); // Normalized: right of (4,3)

      expect(result).toHaveLength(0);
    });

    it("handles 'top' side normalization", () => {
      const edges = [createEdge(5, 2, "bottom")];
      const result = removeEdge(edges, 5, 3, "top"); // Normalized: bottom of (5,2)

      expect(result).toHaveLength(0);
    });

    it("returns empty array if edge not found", () => {
      const edges = [createEdge(5, 3, "right")];
      const result = removeEdge(edges, 5, 3, "bottom");

      expect(result).toHaveLength(1);
    });

    it("returns empty array for null edges", () => {
      expect(removeEdge(null, 0, 0, "right")).toEqual([]);
    });

    it("returns empty array for undefined edges", () => {
      expect(removeEdge(undefined, 0, 0, "right")).toEqual([]);
    });
  });

  // ===========================================================================
  // removeEdgeById
  // ===========================================================================

  describe("removeEdgeById", () => {
    it("removes edge by ID", () => {
      const edges = [
        createEdge(5, 3, "right", "#ff0000", "edge-1"),
        createEdge(5, 3, "bottom", "#ff0000", "edge-2"),
      ];
      const result = removeEdgeById(edges, "edge-1");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("edge-2");
    });

    it("returns unchanged array if ID not found", () => {
      const edges = [createEdge(5, 3, "right", "#ff0000", "edge-1")];
      const result = removeEdgeById(edges, "edge-99");

      expect(result).toHaveLength(1);
    });

    it("returns empty array for null edges", () => {
      expect(removeEdgeById(null, "edge-1")).toEqual([]);
    });
  });

  // ===========================================================================
  // updateEdge
  // ===========================================================================

  describe("updateEdge", () => {
    it("updates edge color by ID", () => {
      const edges = [createEdge(5, 3, "right", "#ff0000", "edge-1")];
      const result = updateEdge(edges, "edge-1", { color: "#00ff00" });

      expect(result[0].color).toBe("#00ff00");
    });

    it("updates edge opacity by ID", () => {
      const edges = [createEdge(5, 3, "right", "#ff0000", "edge-1")];
      const result = updateEdge(edges, "edge-1", { opacity: 0.5 });

      expect(result[0].opacity).toBe(0.5);
    });

    it("updates multiple properties", () => {
      const edges = [createEdge(5, 3, "right", "#ff0000", "edge-1")];
      const result = updateEdge(edges, "edge-1", {
        color: "#00ff00",
        opacity: 0.7,
      });

      expect(result[0].color).toBe("#00ff00");
      expect(result[0].opacity).toBe(0.7);
    });

    it("preserves other edges", () => {
      const edges = [
        createEdge(5, 3, "right", "#ff0000", "edge-1"),
        createEdge(5, 3, "bottom", "#ff0000", "edge-2"),
      ];
      const result = updateEdge(edges, "edge-1", { color: "#00ff00" });

      expect(result[0].color).toBe("#00ff00");
      expect(result[1].color).toBe("#ff0000"); // Unchanged
    });

    it("returns unchanged array if ID not found", () => {
      const edges = [createEdge(5, 3, "right", "#ff0000", "edge-1")];
      const result = updateEdge(edges, "edge-99", { color: "#00ff00" });

      expect(result[0].color).toBe("#ff0000");
    });

    it("returns empty array for null edges", () => {
      expect(updateEdge(null, "edge-1", { color: "#00ff00" })).toEqual([]);
    });
  });

  // ===========================================================================
  // generateEdgeLine
  // ===========================================================================

  describe("generateEdgeLine", () => {
    describe("vertical lines", () => {
      it("generates edges for vertical line going down", () => {
        // Line from intersection (3, 0) to (3, 3) - paints right edges of column 2
        const result = generateEdgeLine(3, 0, 3, 3, "#ff0000");

        expect(result).toHaveLength(3); // y=0,1,2
        expect(result[0]).toEqual({ x: 2, y: 0, side: "right", color: "#ff0000" });
        expect(result[1]).toEqual({ x: 2, y: 1, side: "right", color: "#ff0000" });
        expect(result[2]).toEqual({ x: 2, y: 2, side: "right", color: "#ff0000" });
      });

      it("generates edges for vertical line going up", () => {
        // Same line, different direction
        const result = generateEdgeLine(3, 3, 3, 0, "#ff0000");

        expect(result).toHaveLength(3);
        // Same edges as going down
        expect(result[0].x).toBe(2);
        expect(result[0].side).toBe("right");
      });

      it("handles single-cell vertical line", () => {
        const result = generateEdgeLine(3, 0, 3, 1, "#ff0000");
        expect(result).toHaveLength(1);
      });
    });

    describe("horizontal lines", () => {
      it("generates edges for horizontal line going right", () => {
        // Line from intersection (0, 3) to (3, 3) - paints bottom edges of row 2
        const result = generateEdgeLine(0, 3, 3, 3, "#ff0000");

        expect(result).toHaveLength(3); // x=0,1,2
        expect(result[0]).toEqual({ x: 0, y: 2, side: "bottom", color: "#ff0000" });
        expect(result[1]).toEqual({ x: 1, y: 2, side: "bottom", color: "#ff0000" });
        expect(result[2]).toEqual({ x: 2, y: 2, side: "bottom", color: "#ff0000" });
      });

      it("generates edges for horizontal line going left", () => {
        const result = generateEdgeLine(3, 3, 0, 3, "#ff0000");
        expect(result).toHaveLength(3);
      });

      it("handles single-cell horizontal line", () => {
        const result = generateEdgeLine(0, 3, 1, 3, "#ff0000");
        expect(result).toHaveLength(1);
      });
    });

    describe("edge cases", () => {
      it("returns empty for diagonal lines", () => {
        const result = generateEdgeLine(0, 0, 3, 3, "#ff0000");
        expect(result).toHaveLength(0);
      });

      it("returns empty for single point", () => {
        const result = generateEdgeLine(3, 3, 3, 3, "#ff0000");
        expect(result).toHaveLength(0);
      });

      it("handles null color", () => {
        const result = generateEdgeLine(0, 3, 3, 3, null);
        expect(result).toHaveLength(3);
        expect(result[0].color).toBeNull();
      });

      it("handles negative coordinates", () => {
        const result = generateEdgeLine(-2, 0, -2, 2, "#ff0000");
        expect(result).toHaveLength(2);
        expect(result[0].x).toBe(-3);
      });
    });
  });

  // ===========================================================================
  // mergeEdges
  // ===========================================================================

  describe("mergeEdges", () => {
    it("adds new edges to empty array", () => {
      const newEdges = [
        { x: 0, y: 0, side: "right" as const, color: "#ff0000" as const },
        { x: 0, y: 1, side: "right" as const, color: "#ff0000" as const },
      ];
      const result = mergeEdges([], newEdges);

      expect(result).toHaveLength(2);
    });

    it("merges with existing edges", () => {
      const existing = [createEdge(5, 5, "right")];
      const newEdges = [
        { x: 0, y: 0, side: "right" as const, color: "#ff0000" as const },
      ];
      const result = mergeEdges(existing, newEdges);

      expect(result).toHaveLength(2);
    });

    it("updates existing edge colors", () => {
      const existing = [createEdge(0, 0, "right", "#ff0000")];
      const newEdges = [
        { x: 0, y: 0, side: "right" as const, color: "#00ff00" as const },
      ];
      const result = mergeEdges(existing, newEdges);

      expect(result).toHaveLength(1);
      expect(result[0].color).toBe("#00ff00");
    });

    it("skips edges with null color", () => {
      const newEdges = [
        { x: 0, y: 0, side: "right" as const, color: null },
        { x: 0, y: 1, side: "right" as const, color: "#ff0000" as const },
      ];
      const result = mergeEdges([], newEdges);

      expect(result).toHaveLength(1);
      expect(result[0].y).toBe(1);
    });

    it("handles null edges", () => {
      const newEdges = [
        { x: 0, y: 0, side: "right" as const, color: "#ff0000" as const },
      ];
      const result = mergeEdges(null, newEdges);

      expect(result).toHaveLength(1);
    });
  });

  // ===========================================================================
  // removeEdgeLine
  // ===========================================================================

  describe("removeEdgeLine", () => {
    it("removes edges along vertical line", () => {
      const edges = [
        createEdge(2, 0, "right"),
        createEdge(2, 1, "right"),
        createEdge(2, 2, "right"),
        createEdge(5, 5, "right"), // Should remain
      ];
      // Remove line from (3, 0) to (3, 3)
      const result = removeEdgeLine(edges, 3, 0, 3, 3);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(edges[3]);
    });

    it("removes edges along horizontal line", () => {
      const edges = [
        createEdge(0, 2, "bottom"),
        createEdge(1, 2, "bottom"),
        createEdge(2, 2, "bottom"),
        createEdge(5, 5, "bottom"), // Should remain
      ];
      // Remove line from (0, 3) to (3, 3)
      const result = removeEdgeLine(edges, 0, 3, 3, 3);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(edges[3]);
    });

    it("handles null edges", () => {
      const result = removeEdgeLine(null, 0, 0, 3, 0);
      expect(result).toEqual([]);
    });
  });

  // ===========================================================================
  // getEdgesForCell
  // ===========================================================================

  describe("getEdgesForCell", () => {
    it("returns all 4 edges of a cell", () => {
      const edges = [
        createEdge(5, 3, "right"),  // Right edge of (5,3)
        createEdge(5, 3, "bottom"), // Bottom edge of (5,3)
        createEdge(4, 3, "right"),  // Left edge of (5,3) = Right of (4,3)
        createEdge(5, 2, "bottom"), // Top edge of (5,3) = Bottom of (5,2)
      ];
      const result = getEdgesForCell(edges, 5, 3);

      expect(result).toHaveLength(4);
    });

    it("returns only matching edges", () => {
      const edges = [
        createEdge(5, 3, "right"),
        createEdge(10, 10, "right"), // Different cell
      ];
      const result = getEdgesForCell(edges, 5, 3);

      expect(result).toHaveLength(1);
    });

    it("returns empty for cell with no edges", () => {
      const edges = [createEdge(10, 10, "right")];
      const result = getEdgesForCell(edges, 5, 3);

      expect(result).toHaveLength(0);
    });

    it("handles null edges", () => {
      expect(getEdgesForCell(null, 5, 3)).toEqual([]);
    });

    it("handles undefined edges", () => {
      expect(getEdgesForCell(undefined, 5, 3)).toEqual([]);
    });
  });

  // ===========================================================================
  // clearAllEdges
  // ===========================================================================

  describe("clearAllEdges", () => {
    it("returns empty array", () => {
      expect(clearAllEdges()).toEqual([]);
    });
  });

  // ===========================================================================
  // Integration scenarios
  // ===========================================================================

  describe("integration scenarios", () => {
    it("paint and query complete cell border", () => {
      let edges: Edge[] = [];

      // Paint all 4 edges of cell (5, 3)
      edges = addEdge(edges, 5, 3, "top", "#ff0000");
      edges = addEdge(edges, 5, 3, "right", "#ff0000");
      edges = addEdge(edges, 5, 3, "bottom", "#ff0000");
      edges = addEdge(edges, 5, 3, "left", "#ff0000");

      expect(edges).toHaveLength(4);

      // Query all edges of that cell
      const cellEdges = getEdgesForCell(edges, 5, 3);
      expect(cellEdges).toHaveLength(4);

      // Each edge should be findable
      expect(getEdgeAt(edges, 5, 3, "top")).not.toBeNull();
      expect(getEdgeAt(edges, 5, 3, "right")).not.toBeNull();
      expect(getEdgeAt(edges, 5, 3, "bottom")).not.toBeNull();
      expect(getEdgeAt(edges, 5, 3, "left")).not.toBeNull();
    });

    it("draw line and then erase it", () => {
      // Draw horizontal line
      const lineEdges = generateEdgeLine(0, 3, 5, 3, "#ff0000");
      let edges = mergeEdges([], lineEdges);

      expect(edges).toHaveLength(5);

      // Erase the same line
      edges = removeEdgeLine(edges, 0, 3, 5, 3);

      expect(edges).toHaveLength(0);
    });

    it("overlapping lines share edges", () => {
      // Vertical line
      const vLine = generateEdgeLine(3, 0, 3, 5, "#ff0000");
      let edges = mergeEdges([], vLine);

      expect(edges).toHaveLength(5);

      // Change color of overlapping horizontal line
      const hLine = generateEdgeLine(0, 3, 5, 3, "#00ff00");
      edges = mergeEdges(edges, hLine);

      // Should have 5 vertical + 5 horizontal - 0 overlap (they don't share edges)
      // Vertical paints right edges, horizontal paints bottom edges
      expect(edges).toHaveLength(10);
    });

    it("duplicate edge representations normalize to same edge", () => {
      let edges: Edge[] = [];

      // Add edge as "left of (5,3)"
      edges = addEdge(edges, 5, 3, "left", "#ff0000");

      // Try to add same edge as "right of (4,3)" with different color
      edges = addEdge(edges, 4, 3, "right", "#00ff00");

      // Should be 1 edge with updated color
      expect(edges).toHaveLength(1);
      expect(edges[0].color).toBe("#00ff00");
      expect(edges[0].x).toBe(4);
      expect(edges[0].side).toBe("right");
    });
  });
});
