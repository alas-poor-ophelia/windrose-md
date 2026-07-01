import { describe, it, expect } from 'vitest';
import {
  deriveTileForm,
  formDef,
  subtoolMeta,
  formSupportsSubtool,
  FORM_DEFS,
} from '../../../src/assets/tileForm';
import type { TileForm, TileMetadataEntry, TilesetDef } from '../../../types/tiles/tile.types';

function makeTileset(opts?: Partial<TilesetDef>): TilesetDef {
  return {
    source: 'folder',
    id: 'ts1',
    name: 'Test',
    tileWidth: 256,
    tileHeight: 256,
    tiles: [],
    folderPath: 'tilesets/test',
    hexHeight: 256,
    overflowTop: 0,
    overflowBottom: 0,
    ...opts,
  } as TilesetDef;
}

describe('deriveTileForm', () => {
  describe('autotile (highest priority)', () => {
    it('classifies a tileset with autoTileConfig as autotile, beating renderMode/source', () => {
      const ts = makeTileset({
        autoTileConfig: { type: '4bit', bitmaskMap: {} },
        renderMode: 'region',
      });
      expect(deriveTileForm({ ddSourceType: 'walls' }, ts)).toBe('autotile');
    });
  });

  describe('line (walls/paths/portals)', () => {
    it.each(['walls', 'paths', 'portals'])('classifies ddSourceType %s as line', (src) => {
      expect(deriveTileForm({ ddSourceType: src }, makeTileset())).toBe('line');
    });

    it('is case-insensitive on ddSourceType', () => {
      expect(deriveTileForm({ ddSourceType: 'Walls' }, makeTileset())).toBe('line');
    });

    it('line beats a region renderMode', () => {
      expect(deriveTileForm({ ddSourceType: 'walls', renderMode: 'region' }, makeTileset())).toBe('line');
    });

    it('does NOT treat terrain/objects as line', () => {
      expect(deriveTileForm({ ddSourceType: 'terrain' }, makeTileset())).not.toBe('line');
      expect(deriveTileForm({ ddSourceType: 'objects' }, makeTileset())).not.toBe('line');
    });
  });

  describe('region', () => {
    it('uses per-tile metadata renderMode', () => {
      expect(deriveTileForm({ renderMode: 'region' }, makeTileset())).toBe('region');
    });

    it('falls back to the tileset renderMode when metadata is absent', () => {
      expect(deriveTileForm(undefined, makeTileset({ renderMode: 'region' }))).toBe('region');
    });

    it('per-tile metadata renderMode overrides the tileset default (cell over region)', () => {
      expect(deriveTileForm({ renderMode: 'cell' }, makeTileset({ renderMode: 'region' }))).toBe('cell');
    });
  });

  describe('cell (residual default)', () => {
    it('returns cell when nothing is specified', () => {
      expect(deriveTileForm(undefined, undefined)).toBe('cell');
      expect(deriveTileForm({}, makeTileset())).toBe('cell');
    });

    it('returns cell for object-like DD sources without a region renderMode', () => {
      expect(deriveTileForm({ ddSourceType: 'objects' }, makeTileset())).toBe('cell');
    });
  });

  describe('full classification table', () => {
    const cases: Array<{ meta?: TileMetadataEntry; ts?: Partial<TilesetDef>; expected: TileForm }> = [
      { expected: 'cell' },
      { meta: { ddSourceType: 'objects' }, expected: 'cell' },
      { meta: { renderMode: 'region' }, expected: 'region' },
      { meta: { ddSourceType: 'terrain', renderMode: 'region' }, expected: 'region' },
      { meta: { ddSourceType: 'paths' }, expected: 'line' },
      { ts: { autoTileConfig: { type: '8bit-blob', bitmaskMap: {} } }, expected: 'autotile' },
    ];
    it.each(cases)('classifies %o', ({ meta, ts, expected }) => {
      expect(deriveTileForm(meta, ts != null ? makeTileset(ts) : makeTileset())).toBe(expected);
    });
  });
});

describe('form×subtool matrix', () => {
  const allForms: TileForm[] = ['cell', 'region', 'line', 'autotile', 'scatter'];

  it('every form has a def whose defaultSubtool is its first subtool', () => {
    for (const form of allForms) {
      const def = formDef(form);
      expect(def.subtools.length).toBeGreaterThan(0);
      expect(def.subtools[0]).toBe(def.defaultSubtool);
      expect(def.subtools).toContain(def.defaultSubtool);
    }
  });

  it('every subtool referenced by a form has metadata', () => {
    for (const form of allForms) {
      for (const st of formDef(form).subtools) {
        expect(subtoolMeta(st).id).toBe(st);
        expect(subtoolMeta(st).icon).toMatch(/^lucide-/);
      }
    }
  });

  it('formSupportsSubtool matches the matrix', () => {
    expect(formSupportsSubtool('region', 'fill')).toBe(true);
    expect(formSupportsSubtool('region', 'line')).toBe(false);
    expect(formSupportsSubtool('line', 'line')).toBe(true);
    expect(formSupportsSubtool('cell', 'stamp')).toBe(true);
    expect(formSupportsSubtool('cell', 'fill')).toBe(false);
  });

  it('FORM_DEFS covers exactly the five forms', () => {
    expect(Object.keys(FORM_DEFS).sort()).toEqual([...allForms].sort());
  });
});
