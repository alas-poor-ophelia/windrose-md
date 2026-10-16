/**
 * exportOperations — export theme and content bounds (ABS-12 / DATA-16).
 *
 * The export must draw with the map's effective theme (per-map overrides
 * applied), and size the image from every kind of content it draws, so a
 * tile-only map still exports.
 */

import { describe, it, expect, afterEach } from "vitest";

import { calculateExportBounds, getExportTheme } from "../../../src/persistence/exportOperations";
import { setPlugin, clearPlugin, resolveTheme, getEffectiveSettings } from "../../../src/core/settingsAccessor";
import { createGeometry } from "../../../src/geometry/core/createGeometry";

import type { App } from "obsidian";
import type { MapData, MapLayer } from "#types/core/map.types";

function layer(extra: Partial<MapLayer> = {}): MapLayer {
  return {
    id: "L1", name: "Layer 1", order: 0, visible: true,
    cells: [], curves: [], edges: [], objects: [], textLabels: [], fogOfWar: null,
    ...extra,
  };
}

function gridMap(extra: Partial<MapData> = {}): MapData {
  return {
    schemaVersion: 2, mapType: "grid", gridSize: 32,
    activeLayerId: "L1", layerPanelVisible: false, layers: [layer()],
    ...extra,
  } as MapData;
}

describe("getExportTheme", () => {
  afterEach(() => {
    clearPlugin();
  });

  it("equals the map's effective theme when the map overrides colours", () => {
    setPlugin({
      app: {} as App,
      dataFilePath: "data.json",
      settings: { gridLineColor: "#111111", backgroundColor: "#222222", borderColor: "#333333" },
    });
    const settings = {
      useGlobalSettings: false,
      overrides: { gridLineColor: "#aa0000", backgroundColor: "#00aa00", borderColor: "#0000aa" },
    };
    const mapData = gridMap({ settings });

    const theme = getExportTheme(mapData);
    const effective = getEffectiveSettings(settings);

    expect(theme).toEqual(resolveTheme(settings));
    expect(theme.grid.lines).toBe(effective.gridLineColor);
    expect(theme.grid.background).toBe(effective.backgroundColor);
    expect(theme.cells.border).toBe("#0000aa");
    // Not the global colours
    expect(theme.cells.border).not.toBe("#333333");
  });

  it("uses global settings when the map uses global settings", () => {
    // Explicit colours: the default grid/background colours resolve against the DOM theme
    setPlugin({
      app: {} as App,
      dataFilePath: "data.json",
      settings: { gridLineColor: "#111111", backgroundColor: "#222222", borderColor: "#333333" },
    });
    const mapData = gridMap({ settings: { useGlobalSettings: true, overrides: { borderColor: "#0000aa" } } });
    expect(getExportTheme(mapData).cells.border).toBe("#333333");
  });
});

describe("calculateExportBounds", () => {
  it("bounds a tile-only map by the tiles' cell footprint", () => {
    const tiles = [
      { col: 2, row: 3, tilesetId: "ts", tileId: "a.png" },
      { col: 5, row: 1, tilesetId: "ts", tileId: "b.png", spanW: 2, spanH: 3 },
    ];
    const mapData = gridMap({ layers: [layer({ tiles })] });
    const geometry = createGeometry(mapData);

    const bounds = calculateExportBounds(mapData, mapData.layers, geometry);

    const anchor = geometry.getCellBounds({ x: 2, y: 3, color: "" });
    const farCorner = geometry.getCellBounds({ x: 6, y: 3, color: "" }); // col 5 + spanW 2 - 1, row 1 + spanH 3 - 1
    const top = geometry.getCellBounds({ x: 5, y: 1, color: "" });
    expect(bounds).not.toBeNull();
    expect(bounds).toEqual({
      minX: anchor.minX,
      minY: top.minY,
      maxX: farCorner.maxX,
      maxY: Math.max(anchor.maxY, farCorner.maxY),
    });
  });

  it("includes curves, terrain strokes and map-level shape overlays", () => {
    const mapData = gridMap({
      layers: [layer({
        curves: [{
          id: "c1", start: [100, 100], segments: [[120, 90, 140, 90, 160, 100]], closed: false,
          color: "#000", opacity: 1, strokeColor: "#000", strokeWidth: 4,
        }],
        terrainStrokes: [{ id: "t1", points: [0, 0, 10, 10], radius: 5, tilesetId: "ts", tileId: "g.png" }],
      })],
      shapeOverlays: [{
        id: "s1", shape: "circle", worldPosition: { x: 300, y: 300 }, size: 20,
        color: "#f00", opacity: 0.5, freeform: true, visible: true,
      }],
    });
    const geometry = createGeometry(mapData);

    expect(calculateExportBounds(mapData, mapData.layers, geometry)).toEqual({
      minX: -5, minY: -5, maxX: 320, maxY: 320,
    });
  });

  it("classic hex freeform stamp bounds equal main's rule", () => {
    // main d4b85b3e: half = cellSize * max(spanW, spanH) * scale / 2 around the
    // world point. A hex cell box is about 2x wider, so the drop-cell rule
    // framed classic hex exports with extra margin (DATA-06 / MERGE-04, D-9).
    const stamp = { col: 3, row: 2, tilesetId: "ts", tileId: "s.png", freeform: true, worldX: 300, worldY: 200, spanW: 2, spanH: 1, scale: 1.5 };
    const mapData = { ...gridMap({ layers: [layer({ tiles: [stamp] })] }), mapType: "hex", hexSize: 40 } as MapData;
    const geometry = createGeometry(mapData);
    const half = (40 * 2 * 1.5) / 2;
    expect(calculateExportBounds(mapData, mapData.layers, geometry)).toEqual({
      minX: 300 - half, minY: 200 - half, maxX: 300 + half, maxY: 200 + half,
    });
  });

  it("freeform tile without worldX uses its drop cell (no NaN)", () => {
    // Malformed on disk: the type requires worldX/worldY on a freeform tile.
    const stamp = { col: 3, row: 2, tilesetId: "ts", tileId: "s.png", freeform: true } as unknown as NonNullable<MapLayer["tiles"]>[number];
    const mapData = { ...gridMap({ layers: [layer({ tiles: [stamp] })] }), mapType: "hex", hexSize: 40 } as MapData;
    const geometry = createGeometry(mapData);
    const bounds = calculateExportBounds(mapData, mapData.layers, geometry);
    expect(bounds).toEqual(geometry.getCellBounds({ q: 3, r: 2, color: "" }));
    expect(Object.values(bounds ?? {}).every(Number.isFinite)).toBe(true);
  });

  it("returns null for an empty map", () => {
    const mapData = gridMap();
    expect(calculateExportBounds(mapData, mapData.layers, createGeometry(mapData))).toBeNull();
  });
});
