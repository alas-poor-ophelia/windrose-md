# Windrose File Format & Persistence

Reference this skill when working with data loading, saving, migrations, or the map data schema. Getting persistence wrong causes data loss or breaks backward compatibility.

## Data File Location

**Resolution order** (in `pathResolver.ts`):
1. Check for `WINDROSE-DEBUG.json` in vault root → use its `dataFilePath` if present
2. Fall back to `windrose-md-data.json` in vault root

```json
// WINDROSE-DEBUG.json (optional, dev/test override)
{
  "dataFilePath": "_test-data/dungeon-maps-data.json"
}
```

In compiled mode, the path is always `windrose-md-data.json` resolved via `dc.resolvePath()`.

## Schema Structure (v2)

```
{
  maps: {
    [mapId]: MapData
  }
}
```

Each `MapData` contains:

```typescript
{
  schemaVersion: 2,
  mapType: 'grid' | 'hex',
  name: string,
  activeLayerId: string,
  layers: MapLayer[],          // All paintable content lives here
  dimensions: { width, height },
  gridSize: number,            // Grid maps
  hexSize: number,             // Hex maps
  orientation: 'flat' | 'pointy',
  hexBounds: { maxCol, maxRow, maxRing? },
  viewState: { zoom, center: { x, y } },
  settings: { useGlobalSettings, overrides },
  uiPreferences: { rememberPanZoom, rememberSidebarState, rememberExpandedState },
  customColors: string[],
  regions: Region[],           // Global (not per-layer), hex maps only
  backgroundImage: BackgroundImage | null,
  subHexMaps: { [key]: SubHexMapData },
  lastTextLabelSettings: TextLabelSettings | null,
  northDirection: number,
  sidebarCollapsed: boolean,
  expandedState: boolean
}
```

### MapLayer

```typescript
{
  id: string,              // "layer-{timestamp}-{random}"
  name: string,
  order: number,           // Sort key (ascending)
  visible: boolean,
  cells: Cell[],           // GridCell[] or HexCell[]
  curves: Curve[],
  edges: Edge[],           // Grid maps only
  objects: MapObject[],
  textLabels: TextLabel[],
  fogOfWar: FogOfWar | null,
  showLayerBelow: boolean,
  layerBelowOpacity: number,
  icon: string
}
```

### Cell Types

```typescript
// Grid cell
{ x: number, y: number, color: string, opacity?: number, segments?: SegmentMap }
// segments: { nw?: true, n?: true, ne?: true, e?: true, se?: true, s?: true, sw?: true, w?: true }

// Hex cell
{ q: number, r: number, color: string, opacity?: number }
```

Type guards: `isGridCell(cell)`, `isHexCell(cell)`, `hasSegments(cell)`

### Curve Format

```typescript
{
  id: string,
  start: [number, number],                    // Starting point
  segments: [number, number][],               // Each: [cp1x, cp1y, cp2x, cp2y, endX, endY]
  closed: boolean,
  color: string,
  opacity: number,
  strokeColor: string,
  strokeWidth: number,
  innerRings?: [number, number][][]           // Holes from boolean subtraction
}
```

Each segment is **6 numbers** (two cubic bezier control points + endpoint), NOT `[x, y]` pairs.

### Edge Format (grid only)

```typescript
{ x: number, y: number, side: 'right' | 'bottom', color: string, opacity?: number }
```

### Fog of War

```typescript
{
  enabled: boolean,
  foggedCells: { col: number, row: number }[],  // Offset coordinates, NOT grid/axial
  texture: string | null
}
```

Fogged cells use **offset coordinates** regardless of geometry type.

## Migrations

**Schema version**: `SCHEMA_VERSION = 2` (in `dmtConstants.ts`)

### Migration Trigger

`needsMigration(mapData)` returns true if:
- `schemaVersion` is missing
- `schemaVersion < SCHEMA_VERSION`
- `layers` array is missing

### v1 → v2 Migration (Layer Schema)

Old format stored cells/edges/objects/textLabels at the map root level. Migration moves them into a single default layer:

1. Deep clone original data (backup)
2. Generate layer ID: `layer-{Date.now()}-{random}`
3. Move `cells`, `edges`, `objects`, `textLabels` into new layer
4. Set `schemaVersion = 2`, add `layers` array
5. **Validate**: verify data counts match original exactly
6. **On any validation failure**: restore from backup, return original unchanged
7. Delete root-level `cells`/`edges`/`objects`/`textLabels`
8. Add `_migratedAt` timestamp

### Additional Load-Time Fixes

Applied in `loadMapData()` after migration, these patch missing fields from older saves:

```typescript
// Array initialization
if (!mapData.objects) mapData.objects = [];
if (!mapData.textLabels) mapData.textLabels = [];
if (!mapData.customColors) mapData.customColors = [];
if (!mapData.edges) mapData.edges = [];

// Type defaults
if (!mapData.mapType) mapData.mapType = 'grid';
if (!mapData.settings) mapData.settings = { useGlobalSettings: true, overrides: {} };
if (!mapData.uiPreferences) mapData.uiPreferences = { ... };
if (!mapData.regions) mapData.regions = [];

// Hex bounds format migration (old axial → offset)
if (mapData.hexBounds?.maxQ !== undefined) {
  mapData.hexBounds = { maxCol: mapData.hexBounds.maxQ, maxRow: mapData.hexBounds.maxR };
}

// Curve cleanup
// - Filter out POC curves missing start/segments
// - Migrate legacy holes[] to innerRings[][]
// - Delete old holes field

// Background image: initialize missing measurement fields
// Sub-hex maps: recursively migrate nested mapData
```

**When adding new fields to MapData**: add a default-initialization check in `loadMapData()` so old saves don't crash.

## Autosave Pattern

`useMapData()` implements version-tracked debounced saves:

```
User action → updateMapData(updater)
  → setMapData(newData)           // Immediate UI update
  → setPendingData(newData)       // Queue for save
  → setSaveStatus('Unsaved changes')
  → [2 second debounce]
  → saveMapData(mapId, pendingData)
  → Race condition check (version counter)
  → setSaveStatus('Saved' | 'Save failed')
```

### Version Tracking

```typescript
const saveVersionRef = dc.useRef<number>(0);

// On save trigger:
const currentVersion = ++saveVersionRef.current;
// ... debounce ...
// After save completes:
if (saveVersionRef.current === currentVersion) {
  // No new changes during save — safe to clear pendingData
  setPendingData(null);
  setSaveStatus('Saved');
} else {
  // New changes arrived during save — keep pendingData for next save cycle
  setSaveStatus('Unsaved changes');
}
```

This prevents older saves from overwriting newer changes.

### Force Save

`forceSave()` bypasses the debounce timer for critical operations (layer delete, map export). Uses the same version tracking.

### Unmount Save

```typescript
dc.useEffect(() => {
  return () => {
    if (pendingData && saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveMapData(mapId, pendingData);  // Fire-and-forget, no await
    }
  };
}, [pendingData, mapId]);
```

Prevents data loss when user navigates away with pending changes.

### Save API

```typescript
async function saveMapData(mapId: string, mapData: MapData): Promise<boolean>
```

1. Reads entire data file
2. Updates the specific map by ID
3. Writes entire file back
4. Returns `true`/`false`, never throws

## Layer Operations

Key functions from `layerAccessor.ts`:

| Function | Notes |
|----------|-------|
| `generateLayerId()` | `layer-{timestamp}-{random}` |
| `getActiveLayer(mapData)` | Returns layer matching `activeLayerId` |
| `getLayersOrdered(mapData)` | Sorted by `order` ascending |
| `addLayer(mapData, name)` | Auto-increments order |
| `removeLayer(mapData, id)` | Prevents removing last layer |
| `reorderLayers(mapData, id, newIndex)` | Reassigns all order values |
| `updateActiveLayer(mapData, updates)` | Immutable update helper |

## Anti-Patterns

| Mistake | Consequence | Fix |
|---------|------------|-----|
| Adding MapData fields without load-time defaults | Old saves crash on load | Add `if (!mapData.newField)` check in `loadMapData()` |
| Forgetting to increment `SCHEMA_VERSION` | Migration won't trigger | Increment and implement migration path |
| Saving without version tracking | Concurrent changes lost | Use `saveVersionRef` pattern |
| Using grid coords for fog-of-war | Wrong cells fogged on hex maps | Use offset coordinates (col/row) |
| Mutating `mapData` directly | Skips autosave, breaks undo | Use `updateMapData(updater)` |
| Constructing curves with `[x, y]` segments | Rendering breaks | Each segment is 6 numbers: `[cp1x, cp1y, cp2x, cp2y, endX, endY]` |
| Assuming `layers` exists | Pre-v2 data has no layers | Check `needsMigration()` first |
| Storing absolute paths for background images | Breaks on vault move | Use vault-relative paths |
