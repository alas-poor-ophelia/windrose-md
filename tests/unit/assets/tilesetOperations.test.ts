/**
 * Unit tests for tilesetOperations.ts
 * Tests pure logic and folder scanning with mocked vault.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===========================================
// Re-implement pure functions for testability
// (Datacore modules can't be imported directly)
// ===========================================

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

function generateTilesetId(folderPath?: string): string {
  if (folderPath) {
    let hash = 0;
    for (let i = 0; i < folderPath.length; i++) {
      hash = ((hash << 5) - hash + folderPath.charCodeAt(i)) | 0;
    }
    return 'tileset-' + Math.abs(hash).toString(36);
  }
  return 'tileset-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

function autoDetectOverflow(tileWidth: number, tileHeight: number) {
  if (tileHeight > tileWidth) {
    return {
      hexHeight: tileWidth,
      overflowTop: tileHeight - tileWidth,
      overflowBottom: 0,
    };
  }
  return {
    hexHeight: tileHeight,
    overflowTop: 0,
    overflowBottom: 0,
  };
}

interface MockFile {
  path: string;
  name: string;
  basename: string;
  extension: string;
}

function scanTilesetFolder(folderPath: string, allFiles: MockFile[]) {
  const normalizedFolder = folderPath.endsWith('/')
    ? folderPath.slice(0, -1)
    : folderPath;

  const tiles: Array<{
    id: string;
    filename: string;
    vaultPath: string;
    category?: string;
  }> = [];

  for (const file of allFiles) {
    if (!file.path.startsWith(normalizedFolder + '/')) continue;

    const ext = file.extension?.toLowerCase();
    if (!ext || !IMAGE_EXTENSIONS.has(ext)) continue;

    const relativePath = file.path.slice(normalizedFolder.length + 1);
    const parts = relativePath.split('/');
    const category = parts.length > 1 ? parts[0] : undefined;

    tiles.push({
      id: file.basename,
      filename: file.name,
      vaultPath: file.path,
      category,
    });
  }

  return tiles;
}

// ===========================================
// Tests
// ===========================================

describe('tilesetOperations', () => {
  describe('generateTilesetId', () => {
    it('returns a string starting with tileset-', () => {
      const id = generateTilesetId();
      expect(id).toMatch(/^tileset-/);
    });

    it('generates unique random IDs when no folder path given', () => {
      const ids = new Set(Array.from({ length: 20 }, () => generateTilesetId()));
      expect(ids.size).toBe(20);
    });

    it('returns deterministic ID for a given folder path', () => {
      const id1 = generateTilesetId('Hex Samples');
      const id2 = generateTilesetId('Hex Samples');
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^tileset-/);
    });

    it('returns different IDs for different folder paths', () => {
      const id1 = generateTilesetId('Hex Samples');
      const id2 = generateTilesetId('Other Tiles');
      expect(id1).not.toBe(id2);
    });
  });

  describe('autoDetectOverflow', () => {
    it('returns no overflow for square tiles', () => {
      const result = autoDetectOverflow(256, 256);
      expect(result).toEqual({
        hexHeight: 256,
        overflowTop: 0,
        overflowBottom: 0,
      });
    });

    it('returns top overflow for tall tiles', () => {
      const result = autoDetectOverflow(256, 384);
      expect(result).toEqual({
        hexHeight: 256,
        overflowTop: 128,
        overflowBottom: 0,
      });
    });

    it('returns no overflow for wide tiles', () => {
      const result = autoDetectOverflow(512, 256);
      expect(result).toEqual({
        hexHeight: 256,
        overflowTop: 0,
        overflowBottom: 0,
      });
    });

    it('handles 1:1 small tiles', () => {
      const result = autoDetectOverflow(64, 64);
      expect(result).toEqual({
        hexHeight: 64,
        overflowTop: 0,
        overflowBottom: 0,
      });
    });

    it('handles extreme vertical overflow', () => {
      const result = autoDetectOverflow(128, 512);
      expect(result).toEqual({
        hexHeight: 128,
        overflowTop: 384,
        overflowBottom: 0,
      });
    });
  });

  describe('scanTilesetFolder', () => {
    const mockFiles: MockFile[] = [
      { path: 'Tiles/forest/oak.png', name: 'oak.png', basename: 'oak', extension: 'png' },
      { path: 'Tiles/forest/pine.jpg', name: 'pine.jpg', basename: 'pine', extension: 'jpg' },
      { path: 'Tiles/water/lake.webp', name: 'lake.webp', basename: 'lake', extension: 'webp' },
      { path: 'Tiles/grass.png', name: 'grass.png', basename: 'grass', extension: 'png' },
      { path: 'Tiles/readme.md', name: 'readme.md', basename: 'readme', extension: 'md' },
      { path: 'Tiles/data.json', name: 'data.json', basename: 'data', extension: 'json' },
      { path: 'Other/unrelated.png', name: 'unrelated.png', basename: 'unrelated', extension: 'png' },
    ];

    it('filters to image files only', () => {
      const tiles = scanTilesetFolder('Tiles', mockFiles);
      const filenames = tiles.map(t => t.filename);
      expect(filenames).not.toContain('readme.md');
      expect(filenames).not.toContain('data.json');
    });

    it('only includes files within the target folder', () => {
      const tiles = scanTilesetFolder('Tiles', mockFiles);
      const paths = tiles.map(t => t.vaultPath);
      expect(paths).not.toContain('Other/unrelated.png');
    });

    it('assigns category from immediate subfolder', () => {
      const tiles = scanTilesetFolder('Tiles', mockFiles);
      const oak = tiles.find(t => t.id === 'oak');
      const lake = tiles.find(t => t.id === 'lake');
      expect(oak?.category).toBe('forest');
      expect(lake?.category).toBe('water');
    });

    it('assigns no category for root-level tiles', () => {
      const tiles = scanTilesetFolder('Tiles', mockFiles);
      const grass = tiles.find(t => t.id === 'grass');
      expect(grass?.category).toBeUndefined();
    });

    it('uses filename without extension as id', () => {
      const tiles = scanTilesetFolder('Tiles', mockFiles);
      expect(tiles.map(t => t.id)).toEqual(
        expect.arrayContaining(['oak', 'pine', 'lake', 'grass'])
      );
    });

    it('finds all 4 image files', () => {
      const tiles = scanTilesetFolder('Tiles', mockFiles);
      expect(tiles).toHaveLength(4);
    });

    it('handles trailing slash in folder path', () => {
      const tiles = scanTilesetFolder('Tiles/', mockFiles);
      expect(tiles).toHaveLength(4);
    });

    it('returns empty array for non-existent folder', () => {
      const tiles = scanTilesetFolder('NonExistent', mockFiles);
      expect(tiles).toHaveLength(0);
    });
  });
});
