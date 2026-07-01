/**
 * layerAccessor — Board (floor) projection & board-aware guard tests (Phase 7).
 *
 * Covers the Board→Stratum→Layer flat projection: ensureBoards migration,
 * board accessors, and the board-aware correctness guards (C1-C3, C5-adjacent,
 * M2, M5) plus the Parallax additions (boardId carry on clone/add, sub-hex).
 */

import { describe, it, expect } from "vitest";

import {
  DEFAULT_BOARD_ID,
  layerBoardId,
  getBoardsOrdered,
  getActiveBoardId,
  getBoardLayers,
  getActiveBoardLayers,
  ensureBoards,
  addBoard,
  removeBoard,
  setActiveBoard,
  getActiveLayer,
  getRenderLayers,
  promoteToStrata,
  setLayerMode,
  setActiveLayer,
  addLayer,
  cloneLayer,
  removeLayer,
  reorderLayers,
  getLayerBelow,
} from "../../../src/persistence/layerAccessor";

import type { MapData, MapLayer, BoardId } from "#types/core/map.types";

function mkLayer(
  id: string,
  order: number,
  boardId?: BoardId,
  extra: Partial<MapLayer> = {}
): MapLayer {
  return {
    id,
    name: id,
    order,
    visible: true,
    cells: [],
    curves: [],
    edges: [],
    objects: [],
    textLabels: [],
    fogOfWar: null,
    ...(boardId != null ? { boardId } : {}),
    ...extra,
  } as MapLayer;
}

function mkMap(layers: MapLayer[], activeLayerId: string, partial: Partial<MapData> = {}): MapData {
  return {
    schemaVersion: 2,
    mapType: "grid",
    activeLayerId,
    layerPanelVisible: false,
    layers,
    ...partial,
  } as MapData;
}

/** Two-board fixture: A{a1@0, a2@1}, B{b1@0, b2@1}; active a1 on board A. */
function twoBoardMap(): MapData {
  return mkMap(
    [
      mkLayer("a1", 0, "A"),
      mkLayer("a2", 1, "A"),
      mkLayer("b1", 0, "B"),
      mkLayer("b2", 1, "B"),
    ],
    "a1",
    {
      boards: [
        { id: "A", name: "Ground Floor", order: 0 },
        { id: "B", name: "Basement", order: 1 },
      ],
      activeBoardId: "A",
    }
  );
}

describe("layerAccessor — board projection", () => {
  describe("ensureBoards (migration)", () => {
    it("stamps the default board id on boardless layers", () => {
      const map = mkMap([mkLayer("l1", 0), mkLayer("l2", 1)], "l1");
      ensureBoards(map);
      expect(map.layers.every(l => l.boardId === DEFAULT_BOARD_ID)).toBe(true);
    });

    it("builds a boards registry covering the default board and sets activeBoardId", () => {
      const map = mkMap([mkLayer("l1", 0)], "l1");
      ensureBoards(map);
      expect(map.boards).toEqual([{ id: DEFAULT_BOARD_ID, name: "Ground Floor", order: 0 }]);
      expect(map.activeBoardId).toBe(DEFAULT_BOARD_ID);
    });

    it("is idempotent — second pass changes nothing", () => {
      const map = twoBoardMap();
      const first = JSON.parse(JSON.stringify(ensureBoards(map)));
      const second = JSON.parse(JSON.stringify(ensureBoards(map)));
      expect(second).toEqual(first);
    });

    it("drops orphan boards that have no layers", () => {
      const map = mkMap([mkLayer("a1", 0, "A")], "a1", {
        boards: [
          { id: "A", name: "A", order: 0 },
          { id: "ORPHAN", name: "Orphan", order: 1 },
        ],
        activeBoardId: "A",
      });
      ensureBoards(map);
      expect(map.boards?.map(b => b.id)).toEqual(["A"]);
    });

    it("enforces the M2 invariant: activeBoardId matches the active layer's board", () => {
      const map = twoBoardMap();
      map.activeLayerId = "b2"; // active layer on board B, but activeBoardId says A
      ensureBoards(map);
      expect(map.activeBoardId).toBe("B");
    });

    it("repairs an invalid activeBoardId by falling back to the first board", () => {
      const map = twoBoardMap();
      map.activeLayerId = "does-not-exist";
      map.activeBoardId = "ghost";
      ensureBoards(map);
      expect(map.boards?.some(b => b.id === map.activeBoardId)).toBe(true);
    });

    it("creates registry entries for referenced-but-unregistered boards", () => {
      const map = mkMap([mkLayer("a1", 0, "A"), mkLayer("c1", 0, "C")], "a1", {
        boards: [{ id: "A", name: "A", order: 0 }],
        activeBoardId: "A",
      });
      ensureBoards(map);
      expect(map.boards?.some(b => b.id === "C")).toBe(true);
    });
  });

  describe("accessors", () => {
    it("layerBoardId falls back to the default board when unset", () => {
      expect(layerBoardId(mkLayer("x", 0))).toBe(DEFAULT_BOARD_ID);
      expect(layerBoardId(mkLayer("x", 0, "B"))).toBe("B");
    });

    it("getBoardLayers returns only that board's layers, ordered", () => {
      const map = twoBoardMap();
      expect(getBoardLayers(map, "A").map(l => l.id)).toEqual(["a1", "a2"]);
      expect(getBoardLayers(map, "B").map(l => l.id)).toEqual(["b1", "b2"]);
    });

    it("getActiveBoardLayers follows activeBoardId", () => {
      const map = twoBoardMap();
      expect(getActiveBoardLayers(map).map(l => l.id)).toEqual(["a1", "a2"]);
    });

    it("getActiveBoardId falls back to the active layer's board", () => {
      const map = mkMap([mkLayer("a1", 0, "A"), mkLayer("b1", 0, "B")], "b1");
      expect(getActiveBoardId(map)).toBe("B");
    });

    it("getBoardsOrdered sorts by order", () => {
      const map = twoBoardMap();
      expect(getBoardsOrdered(map).map(b => b.id)).toEqual(["A", "B"]);
    });
  });

  describe("addBoard", () => {
    it("seeds four default strata layers and switches to the new board", () => {
      const map = twoBoardMap();
      const next = addBoard(map, "Roof");
      const newBoard = next.boards?.find(b => b.name === "Roof");
      expect(newBoard).toBeDefined();
      const seeded = getBoardLayers(next, newBoard!.id);
      expect(seeded.map(l => l.tileRole)).toEqual(["ground", "structure", "props", "decoration"]);
      expect(next.activeBoardId).toBe(newBoard!.id);
      expect(seeded.some(l => l.id === next.activeLayerId)).toBe(true);
    });

    it("promotes the map to strata render mode", () => {
      const map = twoBoardMap();
      expect(map.layerMode).toBeUndefined();
      expect(addBoard(map, "Roof").layerMode).toBe("strata");
    });

    it("does not disturb existing boards' layers", () => {
      const map = twoBoardMap();
      const next = addBoard(map, "Roof");
      expect(getBoardLayers(next, "A").map(l => l.id)).toEqual(["a1", "a2"]);
      expect(getBoardLayers(next, "B").map(l => l.id)).toEqual(["b1", "b2"]);
    });
  });

  describe("removeBoard", () => {
    it("removes the board and all its layers", () => {
      const map = twoBoardMap();
      const next = removeBoard(map, "B");
      expect(next.boards?.map(b => b.id)).toEqual(["A"]);
      expect(next.layers.every(l => layerBoardId(l) === "A")).toBe(true);
    });

    it("refuses to remove the last board", () => {
      const map = mkMap([mkLayer("a1", 0, "A")], "a1", {
        boards: [{ id: "A", name: "A", order: 0 }],
        activeBoardId: "A",
      });
      expect(removeBoard(map, "A")).toBe(map);
    });

    it("reassigns active board/layer when the active board is deleted (blind-spot a)", () => {
      const map = twoBoardMap();
      map.activeBoardId = "B";
      map.activeLayerId = "b1";
      const next = removeBoard(map, "B");
      expect(next.activeBoardId).toBe("A");
      expect(getBoardLayers(next, "A").some(l => l.id === next.activeLayerId)).toBe(true);
    });
  });

  describe("setActiveBoard", () => {
    it("switches board and lands active layer on that board (M2)", () => {
      const map = twoBoardMap();
      const next = setActiveBoard(map, "B");
      expect(next.activeBoardId).toBe("B");
      expect(getBoardLayers(next, "B").some(l => l.id === next.activeLayerId)).toBe(true);
    });

    it("keeps the current active layer if it already belongs to the target board", () => {
      const map = twoBoardMap();
      map.activeLayerId = "a2";
      const next = setActiveBoard(map, "A");
      expect(next.activeLayerId).toBe("a2");
    });

    it("no-ops on an unknown board id", () => {
      const map = twoBoardMap();
      expect(setActiveBoard(map, "ghost")).toBe(map);
    });
  });
});

describe("layerAccessor — board-aware guards", () => {
  it("M2: setActiveLayer keeps activeBoardId in sync with the layer's board", () => {
    const map = twoBoardMap();
    const next = setActiveLayer(map, "b1");
    expect(next.activeLayerId).toBe("b1");
    expect(next.activeBoardId).toBe("B");
  });

  it("M2: getActiveLayer falls back within the active board, never to a foreign layers[0]", () => {
    const map = twoBoardMap();
    map.activeBoardId = "B";
    map.activeLayerId = "missing";
    // layers[0] is a1 (board A) — the fallback must stay on board B.
    expect(layerBoardId(getActiveLayer(map))).toBe("B");
  });

  it("M5: addLayer seeds order from the active board's max and stamps the board id", () => {
    const map = twoBoardMap(); // board A max order = 1
    const next = addLayer(map, "a3");
    const added = next.layers.find(l => l.id === next.activeLayerId);
    expect(added?.boardId).toBe("A");
    expect(added?.order).toBe(2);
    // Board B is untouched.
    expect(getBoardLayers(next, "B").map(l => l.order)).toEqual([0, 1]);
  });

  it("C1: removeLayer guards the last layer ON THE BOARD, not the global count", () => {
    // Board B has 2 layers, board A has 2. Remove b1 then b2 — second must be refused.
    const map = twoBoardMap();
    const afterFirst = removeLayer(map, "b1");
    expect(getBoardLayers(afterFirst, "B").map(l => l.id)).toEqual(["b2"]);
    const afterSecond = removeLayer(afterFirst, "b2");
    expect(afterSecond).toBe(afterFirst); // refused: last layer on board B
  });

  it("C1: removing the active layer reassigns active within the same board", () => {
    const map = twoBoardMap();
    map.activeLayerId = "a1";
    const next = removeLayer(map, "a1");
    expect(next.activeLayerId).toBe("a2");
    expect(next.activeBoardId).toBe("A");
  });

  it("C2: reorderLayers reorders within the board and leaves other boards untouched", () => {
    const map = twoBoardMap();
    const beforeB = getBoardLayers(map, "B").map(l => ({ id: l.id, order: l.order }));
    const next = reorderLayers(map, "a1", 1); // move a1 to top of board A
    expect(getBoardLayers(next, "A").map(l => l.id)).toEqual(["a2", "a1"]);
    expect(getBoardLayers(next, "B").map(l => ({ id: l.id, order: l.order }))).toEqual(beforeB);
  });

  it("C3: getLayerBelow respects board bounds (no cross-board ghost)", () => {
    const map = twoBoardMap();
    // a1 is the bottom of board A; there is no layer below it ON BOARD A,
    // even though b-layers share order values.
    expect(getLayerBelow(map, "a1")).toBeNull();
    expect(getLayerBelow(map, "a2")?.id).toBe("a1");
  });

  it("getRenderLayers: Simple maps render ONLY the active layer (no mass-render)", () => {
    // Two boards, default 'simple' mode (layerMode unset). Even though board A has
    // two layers, only the active one renders — today's behavior is preserved.
    const map = twoBoardMap();
    const rendered = getRenderLayers(map);
    expect(rendered.map(l => l.id)).toEqual(["a1"]);
  });

  it("getRenderLayers: Strata maps composite the active board's visible layers in order", () => {
    const map = twoBoardMap();
    map.layerMode = "strata";
    expect(getRenderLayers(map).map(l => l.id)).toEqual(["a1", "a2"]);
    // Switching board composites the other board's layers.
    const onB = setActiveBoard(map, "B");
    expect(getRenderLayers(onB).map(l => l.id)).toEqual(["b1", "b2"]);
  });

  it("getRenderLayers: Strata mode skips hidden (visible:false) strata layers", () => {
    const map = twoBoardMap();
    map.layerMode = "strata";
    map.layers[1].visible = false; // hide a2
    expect(getRenderLayers(map).map(l => l.id)).toEqual(["a1"]);
  });

  describe("promoteToStrata (best-effort Simple->Strata)", () => {
    it("splits a single-layer board's tiles into the four stratum layers by depth", () => {
      const layer = mkLayer("solo", 0, "A", {
        tiles: [
          { col: 0, row: 0, tilesetId: "t", tileId: "g", depth: "ground" },
          { col: 1, row: 0, tilesetId: "t", tileId: "s", depth: "structure" },
          { col: 2, row: 0, tilesetId: "t", tileId: "p", depth: "props" },
          { col: 3, row: 0, tilesetId: "t", tileId: "d", depth: "decoration" },
          { col: 4, row: 0, tilesetId: "t", tileId: "g2" }, // no depth -> ground
        ],
      } as Partial<MapLayer>);
      const map = mkMap([layer], "solo", {
        boards: [{ id: "A", name: "A", order: 0 }],
        activeBoardId: "A",
      });
      const next = promoteToStrata(map);
      expect(next.layerMode).toBe("strata");
      const strata = getBoardLayers(next, "A");
      expect(strata.map(l => l.tileRole)).toEqual(["ground", "structure", "props", "decoration"]);
      const byRole = (role: string): MapLayer => strata.find(l => l.tileRole === role) as MapLayer;
      expect(byRole("ground").tiles?.map(t => t.tileId).sort()).toEqual(["g", "g2"]);
      expect(byRole("structure").tiles?.map(t => t.tileId)).toEqual(["s"]);
      expect(byRole("props").tiles?.map(t => t.tileId)).toEqual(["p"]);
      expect(byRole("decoration").tiles?.map(t => t.tileId)).toEqual(["d"]);
    });

    it("keeps non-tile content on the ground stratum and preserves the base layer id", () => {
      const layer = mkLayer("solo", 0, "A", {
        cells: [{ x: 0, y: 0, color: "#fff" }],
      } as Partial<MapLayer>);
      const map = mkMap([layer], "solo", {
        boards: [{ id: "A", name: "A", order: 0 }],
        activeBoardId: "A",
      });
      const next = promoteToStrata(map);
      const ground = getBoardLayers(next, "A").find(l => l.tileRole === "ground");
      expect(ground?.id).toBe("solo"); // base layer id preserved
      expect(ground?.cells.length).toBe(1);
      expect(next.activeLayerId).toBe("solo");
    });

    it("is idempotent — a board already covering all strata just flips the flag", () => {
      const seeded = addBoard(twoBoardMap(), "Roof"); // already 4 strata, layerMode strata
      const boardId = seeded.activeBoardId as string;
      const before = getBoardLayers(seeded, boardId).map(l => l.id);
      const next = promoteToStrata(seeded);
      expect(getBoardLayers(next, boardId).map(l => l.id)).toEqual(before);
    });

    it("does not disturb other boards", () => {
      const map = twoBoardMap();
      const next = promoteToStrata(map); // promotes active board A
      expect(getBoardLayers(next, "B").map(l => l.id)).toEqual(["b1", "b2"]);
    });
  });

  it("setLayerMode('simple') just flips the flag back", () => {
    const map = addBoard(twoBoardMap(), "Roof");
    expect(map.layerMode).toBe("strata");
    expect(setLayerMode(map, "simple").layerMode).toBe("simple");
  });

  it("Parallax: cloneLayer carries boardId + tileRole and shifts order within the board only", () => {
    const map = twoBoardMap();
    map.layers[0] = mkLayer("a1", 0, "A", { tileRole: "ground" });
    const next = cloneLayer(map, "a1", "mapOnly");
    const clone = next.layers.find(l => l.id === next.activeLayerId);
    expect(clone?.boardId).toBe("A");
    expect(clone?.tileRole).toBe("ground");
    // Board B order values must be unchanged by the in-board shift.
    expect(getBoardLayers(next, "B").map(l => l.order)).toEqual([0, 1]);
  });
});
