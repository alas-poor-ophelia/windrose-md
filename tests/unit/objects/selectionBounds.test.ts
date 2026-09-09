/**
 * selectionBounds Unit Tests
 *
 * The selection card must land on the item. viewState.center is stored in CELL
 * units on grid maps and in world pixels on hex maps, so every branch has to
 * use the renderer's own pan offset (calculateViewportOffset) — a hex-shaped
 * offset on a grid map throws the card thousands of pixels off screen.
 */

import { describe, it, expect } from 'vitest';

import { getSelectionBounds } from '../../../src/objects/selectionBounds';
import { GridGeometry } from '../../../src/geometry/core/GridGeometry';
import { HexGeometry } from '../../../src/geometry/core/HexGeometry';
import type { MapData, ShapeOverlay } from '#types/core/map.types';
import type { IGeometry } from '#types/core/geometry.types';

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 800;

/** Canvas whose CSS box matches its buffer 1:1 and sits at the container origin. */
function makeCanvasRef(): { current: HTMLCanvasElement | null } {
  const canvas = {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT }),
    getContext: () => ({ font: '', measureText: () => ({ width: 10 }) })
  } as unknown as HTMLCanvasElement;
  return { current: canvas };
}

function makeContainerRef(): { current: HTMLElement | null } {
  const container = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT })
  } as unknown as HTMLElement;
  return { current: container };
}

function makeShape(overrides: Partial<ShapeOverlay> = {}): ShapeOverlay {
  return {
    id: 'shape-1',
    shape: 'circle',
    worldPosition: { x: 0, y: 0 },
    size: 32,
    color: '#ff0000',
    opacity: 0.5,
    freeform: false,
    visible: true,
    ...overrides
  };
}

function makeMapData(mapType: 'grid' | 'hex', shape: ShapeOverlay, viewState: MapData['viewState']): MapData {
  return {
    mapType,
    gridSize: 32,
    viewState,
    shapeOverlays: [shape]
  } as unknown as MapData;
}

const selected = [{ type: 'shapeOverlay' as const, id: 'shape-1' }];

describe('getSelectionBounds — shape overlay', () => {
  it('centres the card on the shape on a GRID map (center in cells)', () => {
    const geometry: IGeometry = new GridGeometry(32);
    const zoom = 1.5;
    // View centred on cell (150,150) = world (4800,4800); put the shape there.
    const shape = makeShape({ worldPosition: { x: 4800, y: 4800 } });
    const mapData = makeMapData('grid', shape, { zoom, center: { x: 150, y: 150 } });

    const bounds = getSelectionBounds(selected, mapData, makeCanvasRef(), makeContainerRef(), geometry);

    expect(bounds).not.toBeNull();
    // The view centre maps to the canvas centre, not thousands of px below it.
    expect(bounds?.screenX).toBeCloseTo(CANVAS_WIDTH / 2);
    expect(bounds?.screenY).toBeCloseTo(CANVAS_HEIGHT / 2);
    expect(bounds?.width).toBeCloseTo(shape.size * zoom * 2);
    expect(bounds?.height).toBeCloseTo(shape.size * zoom * 2);
    // left/top stay the shape's top-left corner
    expect(bounds?.left).toBeCloseTo(CANVAS_WIDTH / 2 - shape.size * zoom);
    expect(bounds?.top).toBeCloseTo(CANVAS_HEIGHT / 2 - shape.size * zoom);
  });

  it('offsets by the scaled cell size when the shape is away from the view centre (grid)', () => {
    const geometry: IGeometry = new GridGeometry(32);
    const zoom = 1.5;
    const shape = makeShape({ worldPosition: { x: 4800 + 64, y: 4800 - 32 } });
    const mapData = makeMapData('grid', shape, { zoom, center: { x: 150, y: 150 } });

    const bounds = getSelectionBounds(selected, mapData, makeCanvasRef(), makeContainerRef(), geometry);

    expect(bounds?.screenX).toBeCloseTo(CANVAS_WIDTH / 2 + 64 * zoom);
    expect(bounds?.screenY).toBeCloseTo(CANVAS_HEIGHT / 2 - 32 * zoom);
  });

  it('keeps the hex convention (center already in world pixels)', () => {
    const geometry: IGeometry = new HexGeometry(40, 'flat');
    const zoom = 1.5;
    const shape = makeShape({ worldPosition: { x: 400, y: 400 } });
    const mapData = makeMapData('hex', shape, { zoom, center: { x: 400, y: 400 } });

    const bounds = getSelectionBounds(selected, mapData, makeCanvasRef(), makeContainerRef(), geometry);

    expect(bounds?.screenX).toBeCloseTo(CANVAS_WIDTH / 2);
    expect(bounds?.screenY).toBeCloseTo(CANVAS_HEIGHT / 2);
  });

  it('rotates about the canvas centre on a rotated map', () => {
    const geometry: IGeometry = new GridGeometry(32);
    const zoom = 1;
    // 100px right of the view centre; a 90° north rotation puts it 100px below.
    const shape = makeShape({ worldPosition: { x: 4800 + 100, y: 4800 } });
    const mapData = makeMapData('grid', shape, { zoom, center: { x: 150, y: 150 } });
    (mapData as { northDirection?: number }).northDirection = 90;

    const bounds = getSelectionBounds(selected, mapData, makeCanvasRef(), makeContainerRef(), geometry);

    expect(bounds?.screenX).toBeCloseTo(CANVAS_WIDTH / 2);
    expect(bounds?.screenY).toBeCloseTo(CANVAS_HEIGHT / 2 + 100);
  });

  it('returns null for an unknown shape id', () => {
    const geometry: IGeometry = new GridGeometry(32);
    const mapData = makeMapData('grid', makeShape(), { zoom: 1, center: { x: 0, y: 0 } });

    const bounds = getSelectionBounds(
      [{ type: 'shapeOverlay' as const, id: 'missing' }],
      mapData,
      makeCanvasRef(),
      makeContainerRef(),
      geometry
    );

    expect(bounds).toBeNull();
  });
});

describe('getSelectionBounds — text label', () => {
  function makeTextMapData(mapType: 'grid' | 'hex', viewState: MapData['viewState']): MapData {
    return {
      mapType,
      gridSize: 32,
      viewState,
      layers: [{
        id: 'layer-1',
        name: '1',
        order: 0,
        visible: true,
        cells: [],
        curves: [],
        edges: [],
        objects: [],
        textLabels: [{ id: 'text-1', content: 'A', position: { x: 400, y: 400 }, fontSize: 16, color: '#fff' }],
        fogOfWar: null
      }],
      activeLayerId: 'layer-1'
    } as unknown as MapData;
  }

  const textSelected = [{ type: 'text' as const, id: 'text-1' }];

  it('uses the cell-scaled offset on a grid map', () => {
    const geometry: IGeometry = new GridGeometry(32);
    const mapData = makeTextMapData('grid', { zoom: 2, center: { x: 5, y: 5 } });

    const bounds = getSelectionBounds(textSelected, mapData, makeCanvasRef(), makeContainerRef(), geometry);

    // offset = 500 - 5*64 = 180 ; screenX = 180 + 400*2 = 980
    expect(bounds?.screenX).toBeCloseTo(980);
    // offset = 400 - 5*64 = 80 ; screenY = 80 + 400*2 = 880
    expect(bounds?.screenY).toBeCloseTo(880);
  });

  it('uses the world-pixel offset on a hex map', () => {
    const geometry: IGeometry = new HexGeometry(40, 'flat');
    const mapData = makeTextMapData('hex', { zoom: 2, center: { x: 400, y: 400 } });

    const bounds = getSelectionBounds(textSelected, mapData, makeCanvasRef(), makeContainerRef(), geometry);

    // hex centres are world pixels: offset = 500 - 400*2 = -300 ; 400*2 - 300 = 500
    expect(bounds?.screenX).toBeCloseTo(CANVAS_WIDTH / 2);
    expect(bounds?.screenY).toBeCloseTo(CANVAS_HEIGHT / 2);
  });
});
