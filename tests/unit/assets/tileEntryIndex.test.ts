/**
 * Indexed tile-entry resolution (STRUCT-B-08 / MEM-10): getTileEntryIndex /
 * resolveTileEntryIndexed must answer exactly like resolveTileEntry, and the
 * index is cached per `tiles` array identity.
 */

import { describe, it, expect } from "vitest";

import type { TileEntry } from "#types/tiles/tile.types";
import { resolveTileEntry, resolveTileEntryIndexed, getTileEntryIndex } from "../../../src/assets/tilesetOperations";

function entry(id: string, vaultPath = `pack/${id}.png`): TileEntry {
  const slash = id.lastIndexOf('/');
  return { id, filename: id.slice(slash + 1) + '.png', vaultPath } as TileEntry;
}

// Dungeondraft-style pack: duplicate basenames across subfolders, a duplicated
// exact id, a legacy basename that also exists as an exact (root-level) id.
const tiles: TileEntry[] = [
  entry('terrain/Natural/Grass', 'a/Grass1.png'),
  entry('terrain/Urban/Grass', 'b/Grass2.png'),
  entry('walls/Stone', 'c/Stone1.png'),
  entry('walls/Stone', 'd/Stone-dup.png'),
  entry('props/Barrel', 'e/Barrel-nested.png'),
  entry('Barrel', 'f/Barrel-root.png'),
  entry('Rock', 'g/Rock.png'),
];
const tileset = { tiles };

describe("tile entry index", () => {
  const ids = ['terrain/Natural/Grass', 'terrain/Urban/Grass', 'Grass', 'walls/Stone', 'Stone', 'Barrel', 'props/Barrel', 'Rock', 'Missing', 'Natural/Grass'];

  it.each(ids)("matches resolveTileEntry for %s", (id) => {
    expect(resolveTileEntryIndexed(tileset, id)).toBe(resolveTileEntry(tileset, id));
  });

  it("first exact id wins over later duplicates", () => {
    expect(resolveTileEntryIndexed(tileset, 'walls/Stone')?.vaultPath).toBe('c/Stone1.png');
  });

  it("exact id beats an earlier legacy basename alias", () => {
    expect(resolveTileEntryIndexed(tileset, 'Barrel')?.vaultPath).toBe('f/Barrel-root.png');
  });

  it("legacy basename resolves to the first folder-relative twin", () => {
    expect(resolveTileEntryIndexed(tileset, 'Grass')?.vaultPath).toBe('a/Grass1.png');
  });

  it("handles empty/undefined inputs like resolveTileEntry", () => {
    expect(resolveTileEntryIndexed(undefined, 'Rock')).toBeUndefined();
    expect(resolveTileEntryIndexed(tileset, undefined)).toBeUndefined();
    expect(resolveTileEntryIndexed(tileset, '')).toBeUndefined();
  });

  it("caches per tiles array identity; a replaced array gets a fresh index", () => {
    const a = getTileEntryIndex(tileset);
    expect(getTileEntryIndex({ tiles })).toBe(a); // different wrapper, same tiles array
    const rescanned = [entry('terrain/Natural/Grass', 'z/new.png')];
    const b = getTileEntryIndex({ tiles: rescanned });
    expect(b).not.toBe(a);
    expect(b.get('Grass')?.vaultPath).toBe('z/new.png');
  });
});
