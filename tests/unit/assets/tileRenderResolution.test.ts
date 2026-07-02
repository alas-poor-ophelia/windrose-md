import { describe, it, expect } from 'vitest';
import {
  resolveTileRender,
  DEFAULT_WORLD_REPEAT,
  DEFAULT_EDGE_FEATHER,
  DEFAULT_STAMP_THRESHOLD,
  DEFAULT_MIN_STAMP_SCALE,
  MAX_TILE_SPAN,
} from '../../../src/assets/tileRenderResolution';
import { pruneEmptyEntries } from '../../../src/persistence/tileMetadata';
import type { TilesetDef, TileMetadataEntry, TileMetadataStore } from '../../../types/tiles/tile.types';

function makeTileset(overrides?: Partial<TilesetDef>): TilesetDef {
  return {
    id: 'ts1',
    name: 'Test',
    source: 'folder',
    folderPath: 'tilesets/test',
    tileWidth: 64,
    tileHeight: 64,
    hexHeight: 64,
    overflowTop: 0,
    overflowBottom: 0,
    tiles: [],
    ...overrides,
  } as TilesetDef;
}

describe('resolveTileRender', () => {
  it('falls back to global defaults when nothing is set', () => {
    const r = resolveTileRender(undefined, undefined, undefined);
    expect(r).toEqual({
      renderMode: 'cell',
      spanW: 1,
      spanH: 1,
      fitMode: undefined,
      worldRepeat: DEFAULT_WORLD_REPEAT,
      edgeFeather: DEFAULT_EDGE_FEATHER,
      stampThreshold: DEFAULT_STAMP_THRESHOLD,
      minStampScale: DEFAULT_MIN_STAMP_SCALE,
    });
  });

  it('prefers per-tile metadata over the tileset fallback', () => {
    const meta: TileMetadataEntry = { renderMode: 'region', worldRepeat: 8 };
    const ts = makeTileset({ renderMode: 'cell', worldRepeat: 2 });
    const r = resolveTileRender(undefined, meta, ts);
    expect(r.renderMode).toBe('region');
    expect(r.worldRepeat).toBe(8);
  });

  it('uses the tileset as a temporary fallback tier when metadata is absent', () => {
    const ts = makeTileset({ renderMode: 'region', edgeFeather: 0.5 });
    const r = resolveTileRender(undefined, undefined, ts);
    expect(r.renderMode).toBe('region');
    expect(r.edgeFeather).toBe(0.5);
  });

  it('lets a per-placement override beat metadata for span and fitMode', () => {
    const meta: TileMetadataEntry = { defaultSpanW: 2, defaultSpanH: 2 };
    const r = resolveTileRender({ spanW: 4, spanH: 1, fitMode: 'contain' }, meta, undefined);
    expect(r.spanW).toBe(4);
    expect(r.spanH).toBe(1);
    expect(r.fitMode).toBe('contain');
  });

  it('defaults span from metadata when the placement has none', () => {
    const meta: TileMetadataEntry = { defaultSpanW: 3, defaultSpanH: 2 };
    const r = resolveTileRender(undefined, meta, undefined);
    expect(r.spanW).toBe(3);
    expect(r.spanH).toBe(2);
  });

  it('respects edgeFeather of 0 (hard edges) and does not fall through nullish', () => {
    const meta: TileMetadataEntry = { edgeFeather: 0, worldRepeat: 0 };
    const r = resolveTileRender(undefined, meta, undefined);
    expect(r.edgeFeather).toBe(0);
    // worldRepeat 0 is degenerate but must not silently become the default via ??
    expect(r.worldRepeat).toBe(0);
  });

  it('lets a placement-captured feather beat tile and tileset edgeFeather', () => {
    // Edge blend is captured at paint time: an explicit 0 pins hard edges
    // even when the tile metadata later gains a feather, and vice versa.
    const meta: TileMetadataEntry = { edgeFeather: 0.25 };
    expect(resolveTileRender({ feather: 0 }, meta, undefined).edgeFeather).toBe(0);
    expect(resolveTileRender({ feather: 0.25 }, undefined, undefined).edgeFeather).toBe(0.25);
    expect(resolveTileRender(undefined, meta, undefined).edgeFeather).toBe(0.25);
  });

  it('forces a 1x1 span when the resolved render mode is region', () => {
    // Stale import data can carry both a big footprint prediction and a later
    // region classification; the span must never win (each placement would
    // swallow its neighbours via overlap-removal).
    const meta: TileMetadataEntry = { renderMode: 'region', defaultSpanW: 12, defaultSpanH: 12 };
    const r = resolveTileRender(undefined, meta, undefined);
    expect(r.spanW).toBe(1);
    expect(r.spanH).toBe(1);

    // Same when region comes from the tileset fallback tier and the span from metadata.
    const ts = makeTileset({ renderMode: 'region' });
    const r2 = resolveTileRender(undefined, { defaultSpanW: 8 }, ts);
    expect(r2.spanW).toBe(1);

    // Even a per-placement span override loses to region mode.
    const r3 = resolveTileRender({ spanW: 4, spanH: 4 }, { renderMode: 'region' }, undefined);
    expect(r3.spanW).toBe(1);
    expect(r3.spanH).toBe(1);
  });

  it('clamps spans to >= 1 and <= MAX_TILE_SPAN, rounding fractions', () => {
    expect(resolveTileRender({ spanW: 0, spanH: -5 }, undefined, undefined).spanW).toBe(1);
    expect(resolveTileRender({ spanW: 0, spanH: -5 }, undefined, undefined).spanH).toBe(1);
    expect(resolveTileRender({ spanW: 999 }, undefined, undefined).spanW).toBe(MAX_TILE_SPAN);
    expect(resolveTileRender({ spanW: 2.6 }, undefined, undefined).spanW).toBe(3);
  });
});

describe('pruneEmptyEntries (detection-field preservation)', () => {
  it('keeps entries that carry only auto-detected render/span/signal fields', () => {
    const store: TileMetadataStore = {
      'a.png': { renderMode: 'region' },
      'b.png': { defaultSpanW: 2, defaultSpanH: 3 },
      'c.png': { alphaCoverage: 0.8, opaqueW: 120, opaqueH: 64 },
      'd.png': { worldRepeat: 6 },
      'e.png': { edgeFeather: 0.1 },
    };
    const pruned = pruneEmptyEntries(store);
    expect(Object.keys(pruned).sort()).toEqual(['a.png', 'b.png', 'c.png', 'd.png', 'e.png']);
  });

  it('still drops genuinely empty entries', () => {
    const store: TileMetadataStore = {
      'empty.png': {},
      'keep.png': { renderMode: 'cell' },
    };
    const pruned = pruneEmptyEntries(store);
    expect(Object.keys(pruned)).toEqual(['keep.png']);
  });
});
