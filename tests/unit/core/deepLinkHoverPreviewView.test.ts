import { describe, it, expect } from 'vitest';
import {
  resolveHoverPreviewView,
  resolvePreviewZoom,
  resolveHoverTarget,
} from '../../../src/core/deepLinkHoverTarget';
import { generateDeepLink } from '../../../src/persistence/deepLinkHandler';
import { HexGeometry } from '../../../src/geometry/core/HexGeometry';
import type { MapData } from '#types/core/map.types';

type MapOverrides = Partial<Record<keyof MapData, unknown>>;

function makeMap(over: MapOverrides): MapData {
  return {
    name: 'Test',
    mapType: 'grid',
    gridSize: 32,
    activeLayerId: 'layer_001',
    layers: [{ id: 'layer_001', name: 'Layer 1', cells: [], objects: [], textLabels: [] }],
    viewState: { zoom: 1, center: { x: 0, y: 0 } },
    ...over,
  } as unknown as MapData;
}

function parse(url: string) {
  const link = resolveHoverTarget(url);
  if (link == null) throw new Error('link did not parse');
  return link;
}

describe('resolveHoverPreviewView', () => {
  it('centres a hex link on the linked hex in world px, not on hex 0,0', () => {
    const root = makeMap({ mapType: 'hex', hexSize: 80, orientation: 'flat' });
    const link = parse(generateDeepLink('World.md', 'm1', 12, -5, 1.2, 'layer_001'));
    const view = resolveHoverPreviewView(root, link, 0.5);
    const expected = new HexGeometry(80, 'flat', null).hexToWorld(12, -5);
    expect(view.geometry.type).toBe('hex');
    expect(view.center.x).toBeCloseTo(expected.worldX);
    expect(view.center.y).toBeCloseTo(expected.worldY);
    expect(Math.hypot(view.center.x, view.center.y)).toBeGreaterThan(500);
    expect(view.highlight).toBeNull();
  });

  it('centres a grid link on the cell coordinates as-is (renderer centres grid maps in cells)', () => {
    const root = makeMap({});
    const view = resolveHoverPreviewView(root, parse(generateDeepLink('D.md', 'm1', 40.5, 22.5, 1, 'layer_001')), 0.5);
    expect(view.geometry.type).toBe('grid');
    expect(view.center).toEqual({ x: 40.5, y: 22.5 });
    expect(view.layerId).toBe('layer_001');
  });

  it('centres an object link on the object and highlights it', () => {
    const root = makeMap({
      layers: [{
        id: 'layer_001', name: 'L', cells: [], textLabels: [],
        objects: [
          { id: 'decoy', type: 'chest', position: { x: 1, y: 1 }, size: { width: 1, height: 1 } },
          { id: 'obj-7', type: 'door', position: { x: 30, y: 12 }, size: { width: 2, height: 1 } },
        ],
      }],
    });
    // Copy link on an object stores its centre: position + size / 2.
    const view = resolveHoverPreviewView(root, parse(generateDeepLink('D.md', 'm1', 31, 12.5, 1, 'layer_001')), 0.5);
    expect(view.highlight).toEqual({ type: 'object', id: 'obj-7' });
    expect(view.center).toEqual({ x: 31, y: 12.5 });
  });

  it('centres a hex object link on the object hex centre and highlights it', () => {
    const root = makeMap({
      mapType: 'hex', hexSize: 60, orientation: 'pointy',
      layers: [{
        id: 'layer_001', name: 'L', cells: [], textLabels: [],
        objects: [{ id: 'town', type: 'city', position: { x: 7, y: 3 }, size: { width: 1, height: 1 } }],
      }],
    });
    const view = resolveHoverPreviewView(root, parse(generateDeepLink('W.md', 'm1', 7.5, 3.5, 1, 'layer_001')), 0.5);
    const expected = new HexGeometry(60, 'pointy', null).hexToWorld(7, 3);
    expect(view.highlight).toEqual({ type: 'object', id: 'town' });
    expect(view.center.x).toBeCloseTo(expected.worldX);
    expect(view.center.y).toBeCloseTo(expected.worldY);
  });

  it('renders the linked sub-hex level and centres in that level', () => {
    const child = makeMap({
      mapType: 'hex', hexSize: 20, orientation: 'flat', activeLayerId: 'child_layer',
      layers: [{ id: 'child_layer', name: 'C', cells: [], objects: [], textLabels: [] }],
    });
    const root = makeMap({
      mapType: 'hex', hexSize: 80, orientation: 'flat',
      subHexMaps: { '2,-1': { mapData: child, lastModified: '' } },
    });
    const link = parse(generateDeepLink('W.md', 'm1', 3, 1, 1.5, 'child_layer', '2,-1'));
    const view = resolveHoverPreviewView(root, link, 0.5);
    const expected = new HexGeometry(20, 'flat', null).hexToWorld(3, 1);
    expect(view.renderedSubHexPath).toBe('2,-1');
    expect(view.levelMap).toBe(child);
    expect(view.layerId).toBe('child_layer');
    expect(view.center.x).toBeCloseTo(expected.worldX);
    expect(view.center.y).toBeCloseTo(expected.worldY);
  });

  it('falls back to the parent level centred on the missing sub-hex when the path no longer resolves', () => {
    const root = makeMap({ mapType: 'hex', hexSize: 80, orientation: 'flat' });
    const view = resolveHoverPreviewView(root, parse(generateDeepLink('W.md', 'm1', 3, 1, 1, 'gone', '4,2')), 0.5);
    const expected = new HexGeometry(80, 'flat', null).hexToWorld(4, 2);
    expect(view.renderedSubHexPath).toBe('');
    expect(view.layerId).toBeUndefined();
    expect(view.center.x).toBeCloseTo(expected.worldX);
    expect(view.center.y).toBeCloseTo(expected.worldY);
  });
});

describe('resolvePreviewZoom', () => {
  it('multiplies the link zoom by the slider', () => {
    expect(resolvePreviewZoom(1.2, 0.5)).toBeCloseTo(0.6);
    expect(resolvePreviewZoom(1.2, 1)).toBeCloseTo(1.2);
  });

  it('uses the slider alone when the link has no usable zoom', () => {
    expect(resolvePreviewZoom(0, 0.7)).toBeCloseTo(0.7);
    expect(resolvePreviewZoom(undefined, 0.7)).toBeCloseTo(0.7);
    expect(resolvePreviewZoom(Number.NaN, 0.3)).toBeCloseTo(0.3);
  });

  it('passes the link zoom through to the view', () => {
    const view = resolveHoverPreviewView(makeMap({}), parse(generateDeepLink('D.md', 'm1', 1, 1, 2, 'layer_001')), 0.5);
    expect(view.zoom).toBeCloseTo(1);
    const noZoom = resolveHoverPreviewView(makeMap({}), { x: 1, y: 1, zoom: 0, layerId: '' }, 0.4);
    expect(noZoom.zoom).toBeCloseTo(0.4);
  });
});
