/**
 * Fixture generator for the weather harness: builds the Windrose map store
 * (windrose-md-data.json, vault root) and the two map notes. Extend by adding
 * regions / maps here; run.ts only calls buildVaultFiles().
 */

export const WEATHER_ZONE_A = "greywold-highlands";
export const WEATHER_ZONE_B = "ashfall-coast";

type Cell = { q: number; r: number; color: string };

const hexMap = (cells: Cell[], regions: unknown[]) => ({
  name: "Weather Demo",
  description: "",
  mapType: "hex",
  northDirection: 0,
  customColors: [],
  sidebarCollapsed: false,
  expandedState: false,
  settings: { useGlobalSettings: true, overrides: {} },
  uiPreferences: { rememberPanZoom: true, rememberSidebarState: true, rememberExpandedState: false },
  lastTextLabelSettings: null,
  schemaVersion: 2,
  activeLayerId: "hex-layer-1",
  layerPanelVisible: false,
  layers: [
    { id: "hex-layer-1", name: "Layer 1", order: 0, visible: true, cells, curves: [], edges: [], objects: [], textLabels: [], fogOfWar: null },
  ],
  hexSize: 16,
  hexBounds: { maxCol: 30, maxRow: 20 },
  dimensions: { width: 300, height: 300 },
  viewState: { zoom: 1, center: { x: 280, y: 200 } },
  regions,
  objects: [],
  textLabels: [],
  edges: [],
});

/** Terrain colour for a hex in the 24x16 block: highlands W, coast E, plains between. */
function terrain(q: number, r: number): string {
  if (q >= 20) return "#3b7ea1"; // sea
  if (q >= 15) return "#d9c37a"; // coast sand
  if (q < 8) return r < 8 ? "#7c8f6a" : "#5f7a4d"; // highlands
  return (q + r) % 5 === 0 ? "#8bb36a" : "#a3c47a"; // plains
}

function region(id: string, name: string, order: number, color: string, hexes: { x: number; y: number }[], zone?: string) {
  const r: Record<string, unknown> = {
    id, name, hexes, color, opacity: 0.35, borderColor: color, borderWidth: 3, visible: true, order,
  };
  if (zone) r.weatherZoneId = zone;
  return r;
}

export function buildHexMap() {
  const cells: Cell[] = [];
  const block = (q0: number, q1: number, r0: number, r1: number) => {
    const out: { x: number; y: number }[] = [];
    for (let q = q0; q <= q1; q++) for (let r = r0; r <= r1; r++) out.push({ x: q, y: r });
    return out;
  };
  for (let q = 0; q < 24; q++) for (let r = 0; r < 16; r++) cells.push({ q, r, color: terrain(q, r) });
  const regions = [
    region("region-highlands", "Greywold Highlands", 0, "#a0522d", block(0, 7, 0, 15), WEATHER_ZONE_A),
    region("region-coast", "Ashfall Coast", 1, "#d2691e", block(15, 19, 0, 15), WEATHER_ZONE_B),
    region("region-plains", "Unbound Plains", 2, "#6a5acd", block(9, 13, 3, 12)),
  ];
  return hexMap(cells, regions);
}

export function buildGridMap() {
  const cells: { x: number; y: number; color: string }[] = [];
  for (let x = 2; x < 14; x++) for (let y = 2; y < 10; y++) cells.push({ x, y, color: (x + y) % 2 ? "#8a8a8a" : "#a8a8a8" });
  return {
    name: "Weather Grid Demo",
    description: "",
    mapType: "grid",
    northDirection: 0,
    customColors: [],
    sidebarCollapsed: false,
    expandedState: false,
    settings: { useGlobalSettings: true, overrides: {} },
    uiPreferences: { rememberPanZoom: true, rememberSidebarState: true, rememberExpandedState: false },
    lastTextLabelSettings: null,
    schemaVersion: 2,
    activeLayerId: "grid-layer-1",
    layerPanelVisible: false,
    layers: [
      { id: "grid-layer-1", name: "Layer 1", order: 0, visible: true, cells, curves: [], edges: [], objects: [], textLabels: [], fogOfWar: null },
    ],
    gridSize: 32,
    dimensions: { width: 16, height: 12 },
    viewState: { zoom: 1, center: { x: 256, y: 192 } },
    objects: [],
    textLabels: [],
    edges: [],
  };
}

const note = (id: string, name: string, type: string) =>
  `# ${name}\n\n\`\`\`windrose-map\nid: ${id}\nname: ${name}\ntype: ${type}\n\`\`\`\n`;

/** Relative path (from vault root) -> file content. */
export function buildVaultFiles(): Record<string, string> {
  return {
    "windrose-md-data.json": JSON.stringify({ maps: { "weather-demo-001": buildHexMap(), "weather-grid-001": buildGridMap() } }, null, 2),
    "Weather Demo.md": note("weather-demo-001", "Weather Demo", "hex"),
    "Weather Grid Demo.md": note("weather-grid-001", "Weather Grid Demo", "grid"),
  };
}
