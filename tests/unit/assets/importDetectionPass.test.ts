import { describe, it, expect } from 'vitest';
import type { App } from 'obsidian';
import type { TileEntry, TileMetadataStore } from '#types/tiles/tile.types';
import { runImportDetectionPass } from '../../../src/assets/importDetectionPass';
import type { TileImageSignals } from '../../../src/assets/tileImageScan';

const app = {} as App;

function tile(vaultPath: string): TileEntry {
  const filename = vaultPath.split('/').pop() ?? '';
  return { id: filename.replace(/\.\w+$/, ''), filename, vaultPath, tags: [] };
}

/** Scanner stub returning canned signals per path (skips paths without an entry). */
function stubScanner(byPath: Record<string, TileImageSignals>) {
  const scannedPaths: string[] = [];
  const scanner = (async (_app: App, needsScan: string[]) => {
    scannedPaths.push(...needsScan);
    return needsScan
      .filter(p => byPath[p] != null)
      .map(p => ({ vaultPath: p, signals: byPath[p] }));
  }) as typeof import('../../../src/assets/tileImageScan').runDetectionScan;
  return { scanner, scannedPaths };
}

const OPAQUE_TERRAIN: TileImageSignals = {
  alphaCoverage: 0.98, opaqueW: 256, opaqueH: 256, naturalW: 256, naturalH: 256,
};
const SPARSE_PROP: TileImageSignals = {
  alphaCoverage: 0.3, opaqueW: 200, opaqueH: 200, naturalW: 256, naturalH: 256,
};
const BIG_PROP: TileImageSignals = {
  alphaCoverage: 0.4, opaqueW: 500, opaqueH: 250, naturalW: 512, naturalH: 256,
};

describe('runImportDetectionPass', () => {
  it('scans only tiles missing signals and persists them', async () => {
    const tiles = [tile('a/grass.png'), tile('a/chair.png')];
    const metadata: TileMetadataStore = {
      'a/chair.png': { alphaCoverage: 0.3, opaqueW: 1, opaqueH: 1, srcW: 100, srcH: 100 },
    };
    const { scanner, scannedPaths } = stubScanner({ 'a/grass.png': OPAQUE_TERRAIN });

    const result = await runImportDetectionPass(app, tiles, metadata, {
      applyRenderMode: false, scanner,
    });

    expect(scannedPaths).toEqual(['a/grass.png']);
    expect(result.stats.scanned).toBe(1);
    expect(result.metadata['a/grass.png']?.alphaCoverage).toBe(0.98);
    expect(result.metadata['a/grass.png']?.srcW).toBe(256);
  });

  it('re-scans entries with coverage but no natural dims (older scans)', async () => {
    const tiles = [tile('a/wall.png')];
    const metadata: TileMetadataStore = {
      'a/wall.png': { alphaCoverage: 0.5 }, // no srcW — pre-footprint scan
    };
    const { scanner, scannedPaths } = stubScanner({ 'a/wall.png': SPARSE_PROP });

    await runImportDetectionPass(app, tiles, metadata, { applyRenderMode: false, scanner });
    expect(scannedPaths).toEqual(['a/wall.png']);
  });

  it('persists confident region render modes only when applyRenderMode is set', async () => {
    // "grass" head noun (ground) + near-opaque coverage → confident region.
    const tiles = [tile('a/grass.png')];
    const { scanner } = stubScanner({ 'a/grass.png': OPAQUE_TERRAIN });

    const withheld = await runImportDetectionPass(app, tiles, {}, {
      applyRenderMode: false, scanner,
    });
    expect(withheld.metadata['a/grass.png']?.renderMode).toBeUndefined();
    expect(withheld.stats.region).toBe(0);

    const applied = await runImportDetectionPass(app, tiles, {}, {
      applyRenderMode: true, scanner,
    });
    expect(applied.metadata['a/grass.png']?.renderMode).toBe('region');
    expect(applied.stats.region).toBe(1);
  });

  it('never overwrites an existing render mode', async () => {
    const tiles = [tile('a/grass.png')];
    const metadata: TileMetadataStore = { 'a/grass.png': { renderMode: 'cell' } };
    const { scanner } = stubScanner({ 'a/grass.png': OPAQUE_TERRAIN });

    const result = await runImportDetectionPass(app, tiles, metadata, {
      applyRenderMode: true, scanner,
    });
    expect(result.metadata['a/grass.png']?.renderMode).toBe('cell');
    expect(result.stats.region).toBe(0);
  });

  it('predicts multi-cell spans for non-region tiles and skips 1x1', async () => {
    const tiles = [tile('a/table_big.png'), tile('a/chair.png')];
    const { scanner } = stubScanner({
      'a/table_big.png': BIG_PROP,   // 512x256 @ 256ppc → 2x1
      'a/chair.png': SPARSE_PROP,    // 256x256 → 1x1, stays implicit
    });

    const result = await runImportDetectionPass(app, tiles, {}, {
      applyRenderMode: false, scanner,
    });
    expect(result.metadata['a/table_big.png']?.defaultSpanW).toBe(2);
    expect(result.metadata['a/table_big.png']?.defaultSpanH).toBe(1);
    expect(result.metadata['a/chair.png']?.defaultSpanW).toBeUndefined();
    expect(result.stats.spans).toBe(1);
  });

  it('gives region tiles no span and respects an existing span', async () => {
    const tiles = [tile('a/grass.png'), tile('a/rug.png')];
    const metadata: TileMetadataStore = {
      'a/rug.png': { defaultSpanW: 3, defaultSpanH: 3, alphaCoverage: 0.4, opaqueW: 1, opaqueH: 1, srcW: 512, srcH: 512 },
    };
    const { scanner } = stubScanner({ 'a/grass.png': OPAQUE_TERRAIN });

    const result = await runImportDetectionPass(app, tiles, metadata, {
      applyRenderMode: true, scanner,
    });
    // grass became region → no footprint; rug keeps its existing 3x3.
    expect(result.metadata['a/grass.png']?.defaultSpanW).toBeUndefined();
    expect(result.metadata['a/rug.png']?.defaultSpanW).toBe(3);
    expect(result.stats.spans).toBe(0);
  });

  it('skips span prediction for hex-art tiles (one-hex-per-image packs)', async () => {
    // 2MT world map tile: 795x691 image, hexagon art — the DD 256ppc rule
    // would predict a 3x3 footprint; hex art is definitionally one cell.
    const tiles = [tile('a/Hex - Mountains.png'), tile('a/table_big.png')];
    const { scanner } = stubScanner({
      'a/Hex - Mountains.png': {
        alphaCoverage: 0.22, opaqueW: 412, opaqueH: 385, naturalW: 795, naturalH: 691, hexArt: 'flat',
      },
      'a/table_big.png': BIG_PROP,
    });

    const result = await runImportDetectionPass(app, tiles, {}, {
      applyRenderMode: false, scanner,
    });
    expect(result.metadata['a/Hex - Mountains.png']?.hexArt).toBe('flat');
    expect(result.metadata['a/Hex - Mountains.png']?.defaultSpanW).toBeUndefined();
    expect(result.metadata['a/Hex - Mountains.png']?.defaultSpanH).toBeUndefined();
    // Non-hex props in the same pack still get their footprint.
    expect(result.metadata['a/table_big.png']?.defaultSpanW).toBe(2);
    expect(result.stats.spans).toBe(1);
  });

  it('extends the hex-art span skip to unclassifiable same-dimension siblings (family vote)', async () => {
    // 2MT forest hexes: canopy overflow defeats the mask gates, but they share
    // exact pixel dimensions with their classified siblings — the family skips.
    const hexSignals = (hexArt?: 'flat'): TileImageSignals => ({
      alphaCoverage: 0.22, opaqueW: 412, opaqueH: 385, naturalW: 795, naturalH: 691,
      ...(hexArt != null ? { hexArt } : {}),
    });
    const tiles = [tile('a/Hex - Mountains.png'), tile('a/Hex - Hills.png'), tile('a/Hex - Forest.png')];
    const { scanner } = stubScanner({
      'a/Hex - Mountains.png': hexSignals('flat'),
      'a/Hex - Hills.png': hexSignals('flat'),
      'a/Hex - Forest.png': hexSignals(),   // canopy: no hexArt signal
    });

    const result = await runImportDetectionPass(app, tiles, {}, {
      applyRenderMode: false, scanner,
    });
    expect(result.metadata['a/Hex - Forest.png']?.hexArt).toBeUndefined();
    expect(result.metadata['a/Hex - Forest.png']?.defaultSpanW).toBeUndefined();
    expect(result.stats.spans).toBe(0);
  });

  it('does not let a lone hex classification suppress spans for a big prop family', async () => {
    // One false-positive hexArt in a 6-member family (hex < 2 or < 25%) must
    // not strip footprints from genuinely multi-cell props.
    const propSignals = (hexArt?: 'flat'): TileImageSignals => ({
      alphaCoverage: 0.4, opaqueW: 500, opaqueH: 250, naturalW: 512, naturalH: 256,
      ...(hexArt != null ? { hexArt } : {}),
    });
    const paths = ['a/p1.png', 'a/p2.png', 'a/p3.png', 'a/p4.png', 'a/p5.png', 'a/p6.png'];
    const byPath: Record<string, TileImageSignals> = {};
    for (const p of paths) byPath[p] = propSignals(p === 'a/p1.png' ? 'flat' : undefined);
    const { scanner } = stubScanner(byPath);

    const result = await runImportDetectionPass(app, paths.map(tile), {}, {
      applyRenderMode: false, scanner,
    });
    // p1 itself skips (own hexArt); the other five keep their 2x1 footprint.
    expect(result.metadata['a/p1.png']?.defaultSpanW).toBeUndefined();
    expect(result.metadata['a/p2.png']?.defaultSpanW).toBe(2);
    expect(result.stats.spans).toBe(5);
  });

  it('re-scans and clears hexArt on entries below the size floor (self-heal)', async () => {
    // A 20x43 banner misclassified as hexArt before the size floor existed:
    // the pass re-scans it (sole exception to fill-missing-only) and the
    // fresh scan — which no longer emits hexArt for tiny images — clears it.
    const tiles = [tile('a/Extras/Banner 1.png'), tile('a/Hex - Mountains.png')];
    const metadata: TileMetadataStore = {
      'a/Extras/Banner 1.png': {
        alphaCoverage: 0.3, opaqueW: 16, opaqueH: 40, srcW: 20, srcH: 43, hexArt: 'pointy',
      },
      'a/Hex - Mountains.png': {
        alphaCoverage: 0.22, opaqueW: 412, opaqueH: 385, srcW: 795, srcH: 691, hexArt: 'flat',
      },
    };
    const { scanner, scannedPaths } = stubScanner({
      'a/Extras/Banner 1.png': {
        alphaCoverage: 0.3, opaqueW: 16, opaqueH: 40, naturalW: 20, naturalH: 43,
      },
    });

    const result = await runImportDetectionPass(app, tiles, metadata, {
      applyRenderMode: false, scanner,
    });
    // Only the invalid entry re-scans; a valid above-floor hexArt is untouched.
    expect(scannedPaths).toEqual(['a/Extras/Banner 1.png']);
    expect(result.metadata['a/Extras/Banner 1.png']?.hexArt).toBeUndefined();
    expect(result.metadata['a/Hex - Mountains.png']?.hexArt).toBe('flat');
  });

  it('honours pixelsPerCell for span prediction', async () => {
    const tiles = [tile('a/table.png')];
    const { scanner } = stubScanner({
      'a/table.png': { alphaCoverage: 0.4, opaqueW: 250, opaqueH: 250, naturalW: 256, naturalH: 256 },
    });

    // 256px art at a 128px authoring scale spans 2x2.
    const result = await runImportDetectionPass(app, tiles, {}, {
      applyRenderMode: false, pixelsPerCell: 128, scanner,
    });
    expect(result.metadata['a/table.png']?.defaultSpanW).toBe(2);
    expect(result.metadata['a/table.png']?.defaultSpanH).toBe(2);
  });

  it('scans skipPredictions paths for signals but never predicts on them', async () => {
    // A wall strip: signals still cached (srcH feeds the wall renderer),
    // but no depth/render-mode/span predictions.
    const tiles = [tile('a/walls/wall_stone.png')];
    const { scanner, scannedPaths } = stubScanner({
      'a/walls/wall_stone.png': { alphaCoverage: 0.95, opaqueW: 512, opaqueH: 64, naturalW: 512, naturalH: 64 },
    });

    const result = await runImportDetectionPass(app, tiles, {}, {
      applyRenderMode: true,
      skipPredictions: new Set(['a/walls/wall_stone.png']),
      scanner,
    });
    expect(scannedPaths).toEqual(['a/walls/wall_stone.png']);
    expect(result.metadata['a/walls/wall_stone.png']?.srcH).toBe(64);
    expect(result.metadata['a/walls/wall_stone.png']?.renderMode).toBeUndefined();
    expect(result.metadata['a/walls/wall_stone.png']?.depthAffinity).toBeUndefined();
    expect(result.metadata['a/walls/wall_stone.png']?.defaultSpanW).toBeUndefined();
  });

  it('persists confident depth tiers without touching existing ones', async () => {
    const tiles = [tile('a/tree_oak.png'), tile('a/floor_stone.png')];
    const metadata: TileMetadataStore = { 'a/floor_stone.png': { depthAffinity: 'props' } };
    const { scanner } = stubScanner({});

    const result = await runImportDetectionPass(app, tiles, metadata, {
      applyRenderMode: false, scanner,
    });
    // tree → props/decoration family prediction persists; existing stays.
    expect(result.metadata['a/floor_stone.png']?.depthAffinity).toBe('props');
    if (result.stats.depth > 0) {
      expect(result.metadata['a/tree_oak.png']?.depthAffinity).toBeDefined();
    }
  });

  it('returns zero stats and identical store when everything is cached', async () => {
    const tiles = [tile('a/chair.png')];
    const metadata: TileMetadataStore = {
      'a/chair.png': {
        alphaCoverage: 0.3, opaqueW: 200, opaqueH: 200, srcW: 256, srcH: 256,
        depthAffinity: 'props', renderMode: 'cell', defaultSpanW: 1, defaultSpanH: 1,
      },
    };
    const { scanner, scannedPaths } = stubScanner({});

    const result = await runImportDetectionPass(app, tiles, metadata, {
      applyRenderMode: true, scanner,
    });
    expect(scannedPaths).toEqual([]);
    expect(result.stats).toEqual({ scanned: 0, depth: 0, region: 0, spans: 0 });
  });

  it('aborts between scan batches when signalled', async () => {
    const controller = new AbortController();
    const tiles = Array.from({ length: 30 }, (_, i) => tile(`a/t${i}.png`));
    const byPath: Record<string, TileImageSignals> = {};
    for (const t of tiles) byPath[t.vaultPath] = SPARSE_PROP;
    const { scanner, scannedPaths } = stubScanner(byPath);

    // Abort after the first batch (batch size 24) via the progress callback.
    const result = await runImportDetectionPass(app, tiles, {}, {
      applyRenderMode: false,
      scanner,
      signal: controller.signal,
      onScanProgress: () => controller.abort(),
    });
    expect(scannedPaths.length).toBe(24);
    expect(result.stats.scanned).toBe(24);
  });
});
