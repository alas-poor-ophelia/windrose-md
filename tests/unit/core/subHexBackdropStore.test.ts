/**
 * subHexBackdropStore.test.ts
 *
 * Per-canvas backdrop store semantics: WeakMap keying (co-mounted map views
 * can't clobber each other's snapshots), sibling re-label (parent imagery is
 * re-anchored, never recaptured — windrose-sr5), and canvas-scoped clears.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

import {
  captureSubHexBackdrop,
  relabelSubHexBackdrop,
  getSubHexBackdrop,
  clearSubHexBackdrop,
  pruneSubHexBackdrops,
} from '../../../src/core/subHexBackdropStore';
import type { MapData } from '../../../types/core/map.types';

// The store runs in the plugin's window context; in the node test env we
// stand in the minimal globals it touches (activeWindow.createEl for the
// snapshot canvas, window for the disarmed traceZoom probe).
interface FakeCtx { drawImage: () => void }
interface FakeCanvas {
  width: number;
  height: number;
  getContext: (kind: string) => FakeCtx | null;
}

function fakeCanvas(width = 800, height = 600): HTMLCanvasElement {
  const canvas: FakeCanvas = {
    width,
    height,
    getContext: () => ({ drawImage: () => undefined }),
  };
  return canvas as unknown as HTMLCanvasElement;
}

function hexMap(overrides: Partial<MapData> = {}): MapData {
  return {
    name: 'Parent',
    mapType: 'hex',
    northDirection: 0,
    hexSize: 24,
    orientation: 'flat',
    layers: [],
    subHexMaps: {},
    ...overrides,
  } as unknown as MapData;
}

const geometry = {
  gridToWorld: (q: number, r: number) => ({ worldX: q * 100, worldY: r * 100 }),
};

const view = { zoom: 2, center: { x: 10, y: 20 } };

beforeAll(() => {
  const g = globalThis as Record<string, unknown>;
  g.window ??= globalThis;
  g.activeWindow ??= { createEl: () => fakeCanvas() };
});

describe('subHexBackdropStore', () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    canvas = fakeCanvas();
  });

  it('capture + get round-trips on the same canvas and path', () => {
    captureSubHexBackdrop({
      canvas, parentMapData: hexMap(), geometry, q: 1, r: -1,
      parentView: view, parentSubHexPath: null,
    });
    const entry = getSubHexBackdrop(canvas, '1,-1');
    expect(entry).not.toBeNull();
    expect(entry?.capture.hexCenterWorld).toEqual({ x: 100, y: -100 });
  });

  it('entries are per-canvas: a second view capturing does not clobber the first', () => {
    const other = fakeCanvas();
    captureSubHexBackdrop({
      canvas, parentMapData: hexMap(), geometry, q: 0, r: 0,
      parentView: view, parentSubHexPath: null,
    });
    captureSubHexBackdrop({
      canvas: other, parentMapData: hexMap(), geometry, q: 2, r: 2,
      parentView: view, parentSubHexPath: null,
    });

    expect(getSubHexBackdrop(canvas, '0,0')).not.toBeNull();
    expect(getSubHexBackdrop(other, '2,2')).not.toBeNull();
    // And clearing one canvas leaves the other's snapshot alone.
    clearSubHexBackdrop(other);
    expect(getSubHexBackdrop(canvas, '0,0')).not.toBeNull();
    expect(getSubHexBackdrop(other, '2,2')).toBeNull();
  });

  it('relabel re-anchors the existing snapshot to the sibling path without a new capture', () => {
    const parent = hexMap({
      subHexMaps: {
        '0,0': { subdivisionRings: 7, mapData: hexMap({ name: 'child', hexSize: 24 }), lastModified: '' },
      },
    } as Partial<MapData>);
    captureSubHexBackdrop({
      canvas, parentMapData: parent, geometry, q: 0, r: 0,
      parentView: view, parentSubHexPath: null,
    });
    const before = getSubHexBackdrop(canvas, '0,0');
    expect(before).not.toBeNull();
    const snapshotBitmap = before?.snapshot;

    relabelSubHexBackdrop({
      canvas,
      oldSubHexPath: '0,0',
      newSubHexPath: '1,0',
      hexCenterWorld: { x: 100, y: 0 },
      childHexSize: 24,
      rings: 5,
    });

    // Old path no longer resolves; new path does, with the SAME bitmap and
    // the sibling's anchor/ring metadata.
    expect(getSubHexBackdrop(canvas, '0,0')).toBeNull();
    const after = getSubHexBackdrop(canvas, '1,0');
    expect(after).not.toBeNull();
    expect(after?.snapshot).toBe(snapshotBitmap);
    expect(after?.capture.hexCenterWorld).toEqual({ x: 100, y: 0 });
    expect(after?.capture.rings).toBe(5);
  });

  it('relabel with no existing entry is a no-op (nothing would have rendered anyway)', () => {
    expect(() => relabelSubHexBackdrop({
      canvas,
      oldSubHexPath: '0,0',
      newSubHexPath: '1,0',
      hexCenterWorld: { x: 0, y: 0 },
      childHexSize: 24,
      rings: 7,
    })).not.toThrow();
    expect(getSubHexBackdrop(canvas, '1,0')).toBeNull();
  });

  it('nested dives keep ancestor snapshots; leaving a level exposes the outer one', () => {
    // Dive root → A.
    captureSubHexBackdrop({
      canvas, parentMapData: hexMap(), geometry, q: 0, r: 0,
      parentView: view, parentSubHexPath: null,
    });
    // Dive A → B (parent path "0,0").
    captureSubHexBackdrop({
      canvas, parentMapData: hexMap(), geometry, q: 1, r: 0,
      parentView: view, parentSubHexPath: '0,0',
    });

    expect(getSubHexBackdrop(canvas, '0,0')).not.toBeNull();
    expect(getSubHexBackdrop(canvas, '0,0/1,0')).not.toBeNull();

    // Surface B → A: only B's snapshot is dropped; A's survives.
    clearSubHexBackdrop(canvas, '0,0/1,0');
    expect(getSubHexBackdrop(canvas, '0,0/1,0')).toBeNull();
    expect(getSubHexBackdrop(canvas, '0,0')).not.toBeNull();
  });

  it('prune keeps only snapshots on the remaining drill path', () => {
    captureSubHexBackdrop({
      canvas, parentMapData: hexMap(), geometry, q: 0, r: 0,
      parentView: view, parentSubHexPath: null,
    });
    captureSubHexBackdrop({
      canvas, parentMapData: hexMap(), geometry, q: 1, r: 0,
      parentView: view, parentSubHexPath: '0,0',
    });
    captureSubHexBackdrop({
      canvas, parentMapData: hexMap(), geometry, q: 2, r: 0,
      parentView: view, parentSubHexPath: '0,0/1,0',
    });

    // Breadcrumb jump to depth 1 ("0,0"): deeper snapshots go, ancestors stay.
    pruneSubHexBackdrops(canvas, '0,0');
    expect(getSubHexBackdrop(canvas, '0,0')).not.toBeNull();
    expect(getSubHexBackdrop(canvas, '0,0/1,0')).toBeNull();
    expect(getSubHexBackdrop(canvas, '0,0/1,0/2,0')).toBeNull();

    // Jump to root: everything goes.
    pruneSubHexBackdrops(canvas, null);
    expect(getSubHexBackdrop(canvas, '0,0')).toBeNull();
  });

  it('a failed capture removes only the target path, not ancestor levels', () => {
    captureSubHexBackdrop({
      canvas, parentMapData: hexMap(), geometry, q: 0, r: 0,
      parentView: view, parentSubHexPath: null,
    });
    // Rotated parent: capture for "0,0/1,0" refuses — "0,0" must survive.
    captureSubHexBackdrop({
      canvas, parentMapData: hexMap({ northDirection: 45 } as Partial<MapData>), geometry, q: 1, r: 0,
      parentView: view, parentSubHexPath: '0,0',
    });
    expect(getSubHexBackdrop(canvas, '0,0/1,0')).toBeNull();
    expect(getSubHexBackdrop(canvas, '0,0')).not.toBeNull();
  });

  it('a rotated parent refuses to capture (clears any prior entry for that canvas)', () => {
    captureSubHexBackdrop({
      canvas, parentMapData: hexMap(), geometry, q: 0, r: 0,
      parentView: view, parentSubHexPath: null,
    });
    expect(getSubHexBackdrop(canvas, '0,0')).not.toBeNull();

    captureSubHexBackdrop({
      canvas, parentMapData: hexMap({ northDirection: 45 } as Partial<MapData>), geometry, q: 0, r: 0,
      parentView: view, parentSubHexPath: null,
    });
    expect(getSubHexBackdrop(canvas, '0,0')).toBeNull();
  });

  it('nested paths compose parent path + hex key', () => {
    captureSubHexBackdrop({
      canvas, parentMapData: hexMap(), geometry, q: 3, r: 4,
      parentView: view, parentSubHexPath: '0,0',
    });
    expect(getSubHexBackdrop(canvas, '0,0/3,4')).not.toBeNull();
  });
});
