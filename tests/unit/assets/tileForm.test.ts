import { describe, it, expect } from 'vitest';
import {
  deriveTileForm,
  deriveOpeningWidthCells,
  formDef,
  subtoolMeta,
  subtoolGate,
  ribbonSubtoolsForForm,
  FORM_DEFS,
  RIBBON_SUBTOOL_ORDER,
  OPENING_DD_SOURCES,
  THRESHOLD_ENTRY,
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

  describe('line (walls/paths)', () => {
    it.each(['walls', 'paths'])('classifies ddSourceType %s as line', (src) => {
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

  describe('opening (portals)', () => {
    it('classifies ddSourceType portals as opening — seated wall-gap art, not a stamped prop', () => {
      expect(deriveTileForm({ ddSourceType: 'portals' }, makeTileset())).toBe('opening');
    });

    it('is case-insensitive on ddSourceType', () => {
      expect(deriveTileForm({ ddSourceType: 'Portals' }, makeTileset())).toBe('opening');
    });

    it('opening beats a region renderMode', () => {
      expect(deriveTileForm({ ddSourceType: 'portals', renderMode: 'region' }, makeTileset())).toBe('opening');
    });

    it('OPENING_DD_SOURCES contains only portals and is disjoint from the line sources', () => {
      expect(OPENING_DD_SOURCES.has('portals')).toBe(true);
      expect(OPENING_DD_SOURCES.has('walls')).toBe(false);
      expect(OPENING_DD_SOURCES.has('paths')).toBe(false);
    });

    it('loses to autotile', () => {
      const ts = makeTileset({ autoTileConfig: { type: '4bit', bitmaskMap: {} } });
      expect(deriveTileForm({ ddSourceType: 'portals' }, ts)).toBe('autotile');
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
      { meta: { ddSourceType: 'portals' }, expected: 'opening' },
      { ts: { autoTileConfig: { type: '8bit-blob', bitmaskMap: {} } }, expected: 'autotile' },
    ];
    it.each(cases)('classifies %o', ({ meta, ts, expected }) => {
      expect(deriveTileForm(meta, ts != null ? makeTileset(ts) : makeTileset())).toBe(expected);
    });
  });
});

describe('deriveOpeningWidthCells', () => {
  it('derives exactly 1.0 cell for a spec-compliant 256px asset', () => {
    expect(deriveOpeningWidthCells(256, undefined, 10, 0.25)).toBe(1);
  });

  it('respects a per-tileset pixelsPerCell override', () => {
    expect(deriveOpeningWidthCells(512, 512, 10, 0.25)).toBe(1);
    expect(deriveOpeningWidthCells(1024, 512, 10, 0.25)).toBe(2);
  });

  it('clamps to the segment length when the asset is wider than the wall', () => {
    expect(deriveOpeningWidthCells(2000, 256, 3, 0.25)).toBeCloseTo(3);
  });

  it('clamps up to the minimum gap width for a tiny asset', () => {
    expect(deriveOpeningWidthCells(16, 256, 10, 0.25)).toBe(0.25);
  });

  it('resolves to the segment length (not the floor) when the segment is shorter than minGapCells', () => {
    expect(deriveOpeningWidthCells(256, 256, 0.1, 0.25)).toBe(0.1);
  });
});

describe('form×subtool matrix (lenient tri-state)', () => {
  const allForms: TileForm[] = ['cell', 'region', 'line', 'opening', 'autotile'];
  const allSubtools: TileSubtoolId[] = ['paint', 'stamp', 'scatter', 'fill', 'brush', 'line', 'autotile', 'opening'];

  it('FORM_DEFS covers exactly the five derivable forms', () => {
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

  it('non-opening forms disable the opening subtool', () => {
    for (const form of ['cell', 'region', 'line', 'autotile'] as TileForm[]) {
      expect(subtoolGate(form, 'opening')).toBe('disabled');
    }
  });

  it('the opening form recommends opening, allows stamp as a manual override, and disables the rest', () => {
    expect(subtoolGate('opening', 'opening')).toBe('recommended');
    expect(subtoolGate('opening', 'stamp')).toBe('available');
    for (const st of ['paint', 'scatter', 'fill', 'brush', 'line', 'autotile'] as TileSubtoolId[]) {
      expect(subtoolGate('opening', st)).toBe('disabled');
    }
  });

  it('line-draw is disabled everywhere except the line form', () => {
    expect(subtoolGate('line', 'line')).toBe('recommended');
    expect(subtoolGate('cell', 'line')).toBe('disabled');
    expect(subtoolGate('region', 'line')).toBe('disabled');
    expect(subtoolGate('autotile', 'line')).toBe('disabled');
    expect(subtoolGate('opening', 'line')).toBe('disabled');
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

  it('the built-in Threshold entry is not a graded subtool (arms no asset)', () => {
    expect(THRESHOLD_ENTRY.id).toBe('threshold');
    expect(THRESHOLD_ENTRY.icon).toMatch(/^lucide-/);
    expect(allSubtools).not.toContain(THRESHOLD_ENTRY.id);
  });

  describe('ribbon visibility', () => {
    it('autotile and opening are hidden from the ribbon for other forms', () => {
      for (const form of ['cell', 'region', 'line'] as TileForm[]) {
        expect(ribbonSubtoolsForForm(form)).not.toContain('autotile');
        expect(ribbonSubtoolsForForm(form)).not.toContain('opening');
        expect(ribbonSubtoolsForForm(form)).toEqual(RIBBON_SUBTOOL_ORDER);
      }
    });

    it('autotile form prepends the autotile subtool', () => {
      expect(ribbonSubtoolsForForm('autotile')).toEqual(['autotile', ...RIBBON_SUBTOOL_ORDER]);
    });

    it('opening form prepends the opening subtool', () => {
      expect(ribbonSubtoolsForForm('opening')).toEqual(['opening', ...RIBBON_SUBTOOL_ORDER]);
    });

    it('ribbon order lists every non-autotile, non-opening subtool exactly once', () => {
      expect([...RIBBON_SUBTOOL_ORDER].sort()).toEqual(
        allSubtools.filter(st => st !== 'autotile' && st !== 'opening').sort(),
      );
    });
  });
});
