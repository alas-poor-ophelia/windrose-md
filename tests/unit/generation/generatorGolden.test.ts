import { describe, it, expect, vi, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { generateDungeon } from "../../../src/generation/dungeonGenerator";
import { stockDungeon } from "../../../src/generation/objectPlacer";

// Golden-output guard: with Math.random and Date.now pinned, the generator and
// stocker must produce byte-identical JSON. Hashes were captured from the
// original .js implementations before the TypeScript conversion.

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function run(preset: string, overrides: Record<string, unknown>, seed: number): string {
  const rng = mulberry32(seed);
  vi.spyOn(Math, "random").mockImplementation(rng);
  vi.spyOn(Date, "now").mockReturnValue(1700000000000);
  const result = generateDungeon(preset, undefined, overrides);
  const stock = stockDungeon(
    result.metadata.rooms,
    result.metadata.corridorResult,
    result.metadata.doorPositions,
    result.metadata.style || "classic",
    { objectDensity: 1.0, useTemplates: true },
    {
      entryRoomId: result.metadata.entryRoomId,
      exitRoomId: result.metadata.exitRoomId,
      waterRoomIds: result.metadata.waterRoomIds,
    }
  );
  const json = JSON.stringify({ result, stock });
  return createHash("sha256").update(json).digest("hex");
}

const CASES: Array<[string, string, Record<string, unknown>, number, string]> = [
  ["small classic", "small", {}, 1, "ad6c5d111ea768b03b66211d5d97aefbc4b4a64dbfeff297869fca826d3bfcdf"],
  ["medium organic", "medium", { corridorStyle: "organic", circleChance: 0.3, loopChance: 0.4 }, 2, "d68e9e54cb831e1024523f7a09b2a98367a3e6544c23f3e79f1b093720db9bbf"],
  ["large diagonal cavern", "large", { corridorStyle: "diagonal", style: "cavern", waterChance: 0.5 }, 3, "7a71c55c7ebd4cb8290b0c23813bd857ef11f812460a68e0789e85d4d280f2e6"],
  ["medium crypt wide", "medium", { style: "crypt", wideCorridorChance: 1, doorChance: 1, secretDoorChance: 0.5 }, 4, "1b6761b0c5b1f17e3ac8485bf5183ecd606ac2a91d719c3168a7fe8625ed0791"],
  ["small fortress", "small", { style: "fortress", complexRoomChance: 0.6 }, 5, "701301f942a51cfcee983fb26ef6647630673f331fe6638c8c0432a7a5982238"],
];

describe("generator golden output", () => {
  afterEach(() => vi.restoreAllMocks());
  for (const [name, preset, overrides, seed, expected] of CASES) {
    it(`is byte-identical: ${name}`, () => {
      const hash = run(preset, overrides, seed);
      expect(hash).toBe(expected);
    });
  }
});
