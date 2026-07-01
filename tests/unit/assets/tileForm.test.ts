import { describe, it, expect } from 'vitest';
import {
  deriveTileForm,
  formDef,
  subtoolMeta,
  subtoolGate,
  ribbonSubtoolsForForm,
  FORM_DEFS,
  RIBBON_SUBTOOL_ORDER,
} from '../../../src/assets/tileForm';
import type { TileSubtoolId } from '../../../src/assets/tileForm';
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

describe('form×subtool matrix (lenient tri-state)', () => {
  const allForms: TileForm[] = ['cell', 'region', 'line', 'autotile'];
  const allSubtools: TileSubtoolId[] = ['paint', 'stamp', 'scatter', 'fill', 'brush', 'line', 'autotile'];

  it('FORM_DEFS covers exactly the four derivable forms', () => {
    expect(Object.keys(FORM_DEFS).sort()).toEqual([...allForms].sort());
  });

  it('every form grades every subtool', () => {
    for (const form of allForms) {
      for (const st of allSubtools) {
        expect(['recommended', 'available', 'disabled']).toContain(subtoolGate(form, st));
      }
    }
  });

  it("every form's default subtool is recommended", () => {
    for (const form of allForms) {
      expect(subtoolGate(form, formDef(form).defaultSubtool)).toBe('recommended');
    }
  });

  it('lenient invariant: at most 2 disabled subtools per form (line + autotile only)', () => {
    for (const form of allForms) {
      const disabled = allSubtools.filter(st => subtoolGate(form, st) === 'disabled');
      expect(disabled.length).toBeLessThanOrEqual(2);
      for (const st of disabled) {
        expect(['line', 'autotile']).toContain(st);
      }
    }
  });

  it('line-draw is disabled everywhere except the line form', () => {
    expect(subtoolGate('line', 'line')).toBe('recommended');
    expect(subtoolGate('cell', 'line')).toBe('disabled');
    expect(subtoolGate('region', 'line')).toBe('disabled');
    expect(subtoolGate('autotile', 'line')).toBe('disabled');
  });

  it('region defaults to fill; cell defaults to paint', () => {
    expect(formDef('region').defaultSubtool).toBe('fill');
    expect(formDef('cell').defaultSubtool).toBe('paint');
    expect(subtoolGate('region', 'brush')).toBe('recommended');
  });

  it('every subtool has metadata with a lucide icon', () => {
    for (const st of allSubtools) {
      expect(subtoolMeta(st).id).toBe(st);
      expect(subtoolMeta(st).icon).toMatch(/^lucide-/);
    }
  });

  describe('ribbon visibility', () => {
    it('autotile is hidden from the ribbon for non-autotile forms', () => {
      for (const form of ['cell', 'region', 'line'] as TileForm[]) {
        expect(ribbonSubtoolsForForm(form)).not.toContain('autotile');
        expect(ribbonSubtoolsForForm(form)).toEqual(RIBBON_SUBTOOL_ORDER);
      }
    });

    it('autotile form prepends the autotile subtool', () => {
      expect(ribbonSubtoolsForForm('autotile')).toEqual(['autotile', ...RIBBON_SUBTOOL_ORDER]);
    });

    it('ribbon order lists every non-autotile subtool exactly once', () => {
      expect([...RIBBON_SUBTOOL_ORDER].sort()).toEqual(
        allSubtools.filter(st => st !== 'autotile').sort(),
      );
    });
  });
});
