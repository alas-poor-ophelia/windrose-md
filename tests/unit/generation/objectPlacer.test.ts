import { describe, it, expect } from "vitest";
import {
  rollWeightedCategory,
  normalizeWeights,
  getObjectBudget,
  identifyPlacementZones,
  selectValidTemplate,
  stockDungeon,
  STYLE_OBJECT_POOLS,
  ROOM_TEMPLATES,
} from "../../../src/generation/objectPlacer.js";

describe("objectPlacer", () => {
  describe("rollWeightedCategory", () => {
    it("returns a valid category", () => {
      const weights = { monster: 0.5, empty: 0.5, feature: 0, trap: 0 };
      const category = rollWeightedCategory(weights);
      expect(["monster", "empty", "feature", "trap"]).toContain(category);
    });

    it("returns empty when all weights are zero", () => {
      const weights = { monster: 0, empty: 0, feature: 0, trap: 0 };
      const category = rollWeightedCategory(weights);
      expect(category).toBe("empty");
    });

    it("respects weight distribution over many rolls", () => {
      const weights = { monster: 1, empty: 0, feature: 0, trap: 0 };
      const results = { monster: 0, empty: 0, feature: 0, trap: 0 };

      for (let i = 0; i < 100; i++) {
        const cat = rollWeightedCategory(weights);
        results[cat as keyof typeof results]++;
      }

      expect(results.monster).toBe(100);
      expect(results.empty).toBe(0);
    });

    it("distributes roughly according to weights", () => {
      const weights = { monster: 0.5, empty: 0.5, feature: 0, trap: 0 };
      const results = { monster: 0, empty: 0, feature: 0, trap: 0 };

      for (let i = 0; i < 1000; i++) {
        const cat = rollWeightedCategory(weights);
        results[cat as keyof typeof results]++;
      }

      // With 50/50 weights, each should be roughly 500 (allow 20% variance)
      expect(results.monster).toBeGreaterThan(350);
      expect(results.monster).toBeLessThan(650);
      expect(results.empty).toBeGreaterThan(350);
      expect(results.empty).toBeLessThan(650);
    });
  });

  describe("normalizeWeights", () => {
    it("normalizes weights to sum to 1.0", () => {
      const weights = { monster: 2, empty: 2, feature: 2, trap: 2 };
      const normalized = normalizeWeights(weights);

      const sum = (Object.values(normalized) as number[]).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 10);
    });

    it("handles all zeros by returning equal weights", () => {
      const weights = { monster: 0, empty: 0, feature: 0, trap: 0 };
      const normalized = normalizeWeights(weights);

      expect(normalized.monster).toBe(0.25);
      expect(normalized.empty).toBe(0.25);
      expect(normalized.feature).toBe(0.25);
      expect(normalized.trap).toBe(0.25);
    });

    it("preserves relative proportions", () => {
      const weights = { monster: 4, empty: 2, feature: 1, trap: 1 };
      const normalized = normalizeWeights(weights);

      expect(normalized.monster).toBeCloseTo(0.5, 10);
      expect(normalized.empty).toBeCloseTo(0.25, 10);
      expect(normalized.feature).toBeCloseTo(0.125, 10);
      expect(normalized.trap).toBeCloseTo(0.125, 10);
    });
  });

  describe("getObjectBudget", () => {
    it("returns 1-2 for small rooms (3-6 cells)", () => {
      const results = new Set<number>();
      for (let i = 0; i < 50; i++) {
        results.add(getObjectBudget(5, 1.0));
      }
      // Should only produce 1 or 2
      for (const r of results) {
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(2);
      }
    });

    it("returns 2-4 for medium rooms (7-15 cells)", () => {
      const results = new Set<number>();
      for (let i = 0; i < 50; i++) {
        results.add(getObjectBudget(10, 1.0));
      }
      for (const r of results) {
        expect(r).toBeGreaterThanOrEqual(2);
        expect(r).toBeLessThanOrEqual(4);
      }
    });

    it("returns 4-6 for large rooms (16+ cells)", () => {
      const results = new Set<number>();
      for (let i = 0; i < 50; i++) {
        results.add(getObjectBudget(20, 1.0));
      }
      for (const r of results) {
        expect(r).toBeGreaterThanOrEqual(4);
        expect(r).toBeLessThanOrEqual(6);
      }
    });

    it("scales with density multiplier", () => {
      // With 2x density, a small room should get 2-4 objects
      const results = new Set<number>();
      for (let i = 0; i < 50; i++) {
        results.add(getObjectBudget(5, 2.0));
      }
      for (const r of results) {
        expect(r).toBeGreaterThanOrEqual(2);
        expect(r).toBeLessThanOrEqual(4);
      }
    });

    it("returns at least 1 object even with low density", () => {
      const result = getObjectBudget(5, 0.1);
      expect(result).toBeGreaterThanOrEqual(1);
    });
  });

  describe("identifyPlacementZones", () => {
    const room = { x: 0, y: 0, width: 5, height: 5, shape: "rectangle" };
    const roomCells: Array<{ x: number; y: number }> = [];
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        roomCells.push({ x, y });
      }
    }

    it("identifies corner cells", () => {
      const zones = identifyPlacementZones(roomCells, room, []);
      const corners = zones.corners;

      // Corners should include cells near (0,0), (0,4), (4,0), (4,4)
      expect(corners.length).toBeGreaterThan(0);
      const hasTopLeft = corners.some(
        (c: { x: number; y: number }) => c.x <= 1 && c.y <= 1
      );
      const hasBottomRight = corners.some(
        (c: { x: number; y: number }) => c.x >= 3 && c.y >= 3
      );
      expect(hasTopLeft).toBe(true);
      expect(hasBottomRight).toBe(true);
    });

    it("identifies wall cells", () => {
      const zones = identifyPlacementZones(roomCells, room, []);
      const walls = zones.walls;

      // Wall cells should be on edges but not corners
      expect(walls.length).toBeGreaterThan(0);
      for (const cell of walls) {
        expect(
          cell.x === 0 || cell.x === 4 || cell.y === 0 || cell.y === 4
        ).toBe(true);
      }
    });

    it("identifies center cells", () => {
      const zones = identifyPlacementZones(roomCells, room, []);
      const center = zones.center;

      // Center cells should not be on edges
      expect(center.length).toBeGreaterThan(0);
      for (const cell of center) {
        expect(cell.x > 0 && cell.x < 4 && cell.y > 0 && cell.y < 4).toBe(true);
      }
    });

    it("excludes door-adjacent cells from other zones", () => {
      const doorPositions = [{ x: 2, y: 0 }]; // Door at top center
      const zones = identifyPlacementZones(roomCells, room, doorPositions);

      // Cell at (2,0) should be in doorAdjacent
      const isDoorCell = zones.doorAdjacent.some(
        (c: { x: number; y: number }) => c.x === 2 && c.y === 0
      );
      expect(isDoorCell).toBe(true);

      // Cell adjacent to door (2,1) should also be in doorAdjacent
      const isAdjacentCell = zones.doorAdjacent.some(
        (c: { x: number; y: number }) => c.x === 2 && c.y === 1
      );
      expect(isAdjacentCell).toBe(true);

      // These cells should NOT be in scattered (available for placement)
      const doorInScattered = zones.scattered.some(
        (c: { x: number; y: number }) => c.x === 2 && c.y === 0
      );
      const adjacentInScattered = zones.scattered.some(
        (c: { x: number; y: number }) => c.x === 2 && c.y === 1
      );
      expect(doorInScattered).toBe(false);
      expect(adjacentInScattered).toBe(false);
    });

    it("puts all valid cells in scattered zone", () => {
      const zones = identifyPlacementZones(roomCells, room, []);

      // Scattered should contain all cells (no doors in this test)
      expect(zones.scattered.length).toBe(25);
    });
  });

  describe("selectValidTemplate", () => {
    it("returns null for rooms too small for any template", () => {
      const template = selectValidTemplate(3);
      expect(template).toBe(null);
    });

    it("returns a template for rooms meeting minimum size", () => {
      const template = selectValidTemplate(12);
      expect(template).not.toBe(null);
      expect(template).toHaveProperty("name");
      expect(template).toHaveProperty("objects");
    });

    it("only returns templates that fit the room size", () => {
      // Size 6 should only return templates with minRoomSize <= 6
      for (let i = 0; i < 20; i++) {
        const template = selectValidTemplate(6);
        if (template) {
          expect(template.minRoomSize).toBeLessThanOrEqual(6);
        }
      }
    });
  });

  describe("STYLE_OBJECT_POOLS", () => {
    it("has all expected styles", () => {
      expect(STYLE_OBJECT_POOLS).toHaveProperty("classic");
      expect(STYLE_OBJECT_POOLS).toHaveProperty("cavern");
      expect(STYLE_OBJECT_POOLS).toHaveProperty("fortress");
      expect(STYLE_OBJECT_POOLS).toHaveProperty("crypt");
    });

    it("each style has required pools", () => {
      for (const [_style, pool] of Object.entries(STYLE_OBJECT_POOLS)) {
        const p = pool as any;
        expect(p).toHaveProperty("monsters");
        expect(p).toHaveProperty("treasures");
        expect(p).toHaveProperty("features");
        expect(p).toHaveProperty("traps");
        expect(Array.isArray(p.monsters)).toBe(true);
        expect(Array.isArray(p.treasures)).toBe(true);
        expect(Array.isArray(p.features)).toBe(true);
        expect(Array.isArray(p.traps)).toBe(true);
      }
    });
  });

  describe("ROOM_TEMPLATES", () => {
    it("has expected templates", () => {
      expect(ROOM_TEMPLATES).toHaveProperty("library");
      expect(ROOM_TEMPLATES).toHaveProperty("storage");
      expect(ROOM_TEMPLATES).toHaveProperty("shrine");
      expect(ROOM_TEMPLATES).toHaveProperty("barracks");
      expect(ROOM_TEMPLATES).toHaveProperty("treasury");
      expect(ROOM_TEMPLATES).toHaveProperty("guardRoom");
    });

    it("each template has valid structure", () => {
      for (const [_name, template] of Object.entries(ROOM_TEMPLATES)) {
        const t = template as any;
        expect(t).toHaveProperty("name");
        expect(t).toHaveProperty("objects");
        expect(t).toHaveProperty("minRoomSize");
        expect(Array.isArray(t.objects)).toBe(true);
        expect(typeof t.minRoomSize).toBe("number");

        for (const obj of t.objects) {
          expect(obj).toHaveProperty("type");
          expect(obj).toHaveProperty("count");
          expect(obj).toHaveProperty("placement");
          expect(obj.count).toHaveProperty("min");
          expect(obj.count).toHaveProperty("max");
        }
      }
    });
  });

  describe("stockDungeon", () => {
    // Create simple test rooms
    const rooms = [
      { id: 0, x: 0, y: 0, width: 5, height: 5, shape: "rectangle" },
      { id: 1, x: 10, y: 0, width: 6, height: 6, shape: "rectangle" },
      { id: 2, x: 20, y: 0, width: 4, height: 4, shape: "rectangle" },
    ];

    const corridorResult = {
      cells: [
        { x: 5, y: 2 },
        { x: 6, y: 2 },
        { x: 7, y: 2 },
        { x: 8, y: 2 },
        { x: 9, y: 2 },
      ],
      byConnection: [] as unknown[],
    };

    const doorPositions = [{ x: 5, y: 2 }];

    it("returns objects and roomAssignments", () => {
      const result = stockDungeon(
        rooms,
        corridorResult,
        doorPositions,
        "classic",
        {},
        { entryRoomId: 0, exitRoomId: 2 }
      );

      expect(result).toHaveProperty("objects");
      expect(result).toHaveProperty("roomAssignments");
      expect(Array.isArray(result.objects)).toBe(true);
    });

    it("skips entry and exit rooms", () => {
      const result = stockDungeon(
        rooms,
        corridorResult,
        doorPositions,
        "classic",
        {},
        { entryRoomId: 0, exitRoomId: 2 }
      );

      // Entry room should be marked as entry_exit
      expect(result.roomAssignments[0].category).toBe("entry_exit");
      expect(result.roomAssignments[2].category).toBe("entry_exit");

      // Middle room should have a stocking category
      expect(["monster", "empty", "feature", "trap"]).toContain(
        result.roomAssignments[1].category
      );
    });

    it("places objects with valid structure", () => {
      const result = stockDungeon(
        rooms,
        corridorResult,
        doorPositions,
        "classic",
        { objectDensity: 2.0 }, // Increase density to ensure objects
        { entryRoomId: 0, exitRoomId: 2 }
      );

      for (const obj of result.objects) {
        expect(obj).toHaveProperty("id");
        expect(obj).toHaveProperty("type");
        expect(obj).toHaveProperty("position");
        expect(obj.position).toHaveProperty("x");
        expect(obj.position).toHaveProperty("y");
        expect(typeof obj.id).toBe("string");
        expect(typeof obj.type).toBe("string");
      }
    });

    it("places corridor traps when corridorTrapChance > 0", () => {
      // Run multiple times to get statistical confidence
      let hasCorridorTrap = false;

      for (let i = 0; i < 50; i++) {
        const result = stockDungeon(
          rooms,
          {
            cells: Array.from({ length: 50 }, (_, i) => ({
              x: 5 + i,
              y: 2,
            })),
            byConnection: [],
          },
          doorPositions,
          "classic",
          { corridorTrapChance: 0.5 },
          { entryRoomId: 0, exitRoomId: 2 }
        );

        // Check if any object is in the corridor area
        const corridorTrap = result.objects.find(
          (o) => o.position.x >= 5 && o.position.x < 55
        );
        if (corridorTrap) {
          hasCorridorTrap = true;
          break;
        }
      }

      // With 50% chance over 50 cells, should have at least one trap eventually
      expect(hasCorridorTrap).toBe(true);
    });

    it("respects different styles", () => {
      // Run with crypt style and check for crypt-specific objects
      let foundCryptObject = false;

      for (let i = 0; i < 20; i++) {
        const result = stockDungeon(
          [{ id: 1, x: 10, y: 0, width: 8, height: 8, shape: "rectangle" }],
          { cells: [], byConnection: [] },
          [],
          "crypt",
          { objectDensity: 2.0 },
          {}
        );

        // Crypt has coffin, altar, boss-alt, poison
        const cryptTypes = ["coffin", "altar", "boss-alt", "poison"];
        if (result.objects.some((o) => cryptTypes.includes(o.type))) {
          foundCryptObject = true;
          break;
        }
      }

      expect(foundCryptObject).toBe(true);
    });
  });
});
