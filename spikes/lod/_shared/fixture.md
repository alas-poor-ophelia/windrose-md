# `_shared/fixture.ts` — the world every LOD spike renders

Deterministic nested hex world mirroring the **shipped** Windrose nesting. No DOM. The
`/15` comes from `src/geometry/core/hexMeasurements.ts` and is never re-derived.

| depth | doc ids | rings | cells | scale into ROOT world |
|---|---|---|---|---|
| 0 | `root` | 12 | 469 | 1 |
| 1 | `forestA`, `forestB` (adjacent pair), `shore` (isolated), `range` | 7 | 676 | 1/15 |
| 2 | `grand` (under `range` hex 2,−3) | 7 | 169 | 1/225 |

1314 cells at the defaults. hexSize 80, flat-top, real `HexGeometry` (DEFAULTS values).
At the defaults `forestA`/`forestB` sit on root hexes (3,−1)/(4,−1) — neighbours, so the
shared edge **and** the ring-7 hull's 30° corner under-fill are both exercised. Most root
hexes have no child (sparse by design).

**Orientation and shape are options, not constants** (added for `g1-global-lattice`'s
orientation/shape round). `buildFixture()` with no options is byte-identical to the table
above — `_template` still reports `cellsTotal 1951`. With `{shape:'rect'}` the ROOT doc
becomes the plugin's rectangular hex map: bounds `{maxCol, maxRow}` with **no** `maxRing`,
cells enumerated `offsetToAxial(col,row)` over `[0,cols) x [0,rows)` — odd-q offset for flat,
odd-r for pointy (`src/geometry/core/offsetCoordinates.ts`). Sub-maps stay radial rosettes
(that is what `subdivisionRings` means), and the four depth-1 anchors are re-derived from the
map's centre cell so `forestA`/`forestB` remain axial neighbours. 24x16 = 384 root cells.
Note the coastline lives at negative world x, so a rect root map (which starts at world
origin and runs +x/+y) shows forest/plains/hills/mountains but no ocean.

## API

```ts
buildFixture(seed = 1, opts?: FixtureOptions): Fixture
// { seed, orientation, shape, cols, rows, childAt, root, docs[6], byId,
//   labels, roads, secret, fiducial, worldRadius }

interface FixtureOptions {   // ALL optional; the defaults are exactly the table above
  orientation?: 'flat' | 'pointy';   // default 'flat'  (DEFAULTS.hexOrientation)
  shape?: 'radial' | 'rect';         // default 'radial' (root = ring 12)
  cols?: number; rows?: number;      // rect only, default 24 x 16
}

interface Doc {          // geometry = real HexGeometry (radial bounds, or rect bounds)
  id; depth; parentId; parentHex {q,r}|null; rings; shape; cols; rows; orientation;
  hexSize; geometry;
  cells: Map<'q,r', { q, r, terrain, color, secret? }>;
  transformToWorld: { scale, tx, ty };   // composed doc-local -> ROOT world px
  labels; roads; secret; childIds;
}

docCells(doc)            // the doc's cell set, enumerated the way the plugin does:
                         //   radial -> getAllRadialCells(rings)
                         //   rect   -> offsetToAxial(col,row) over [0,cols)x[0,rows)
rectBoundaryCells(doc)   // ordered ragged boundary ring of a rect map (footprint polygons)
docToWorld(doc, x, y) / worldToDoc(doc, wx, wy)
coarseColorAt(fx, wx, wy, maxDepth = 99): ResolvedCell | null  // finest authored cell
terrainAtWorld(wx, wy): TerrainId        // the shared coarse field
toMapData(fx?): MapData                  // real Windrose subHexMaps nesting
checkMath(fx): string[]                  // [] when every affine holds

HEX_SIZE 80 · ORIENTATION 'flat' · ROOT_RINGS 12 · CHILD_RINGS 7 · CELLS_ACROSS 15
CHILD_SCALE = CONTINUITY_ZOOM_PER_LEVEL = 1/15 · TERRAIN_PALETTE
FIDUCIAL_WORLD {x: 13.867, y: 674.345} · FIDUCIAL_COLOR '#ff00c8'
```

`transformToWorld` is the point: `childWorld = parentHexCentre + childLocal/15`, composed
down the tree, so ONE affine puts any doc's cells in root world px.

## Content

8 terrains (`ocean coast plains forest hills mountains lake town`) from one world-space
field — wavy coastline, NE mountain ridge with foothills, forest ellipse — so bands cross
parent-hex boundaries at every depth. Children refine their parent honestly except the
deliberate contradictions: a 19-cell **lake** in `forestA` where the parent says forest, a
7-cell **town** in `forestB`, a plains valley in `range`, a hold + pasture in `grand`. One
**road** polyline crosses the `forestA`/`forestB` boundary; one **secret** cell (Drowned
Beacon) hides in `shore`; three **labels**, one per depth, sizes pre-divided to root px.

## Files and commands

`node spikes/lod/_shared/write-fixture.mjs` runs `checkMath`, then writes `fixture.json`
(104 KiB strict `MapData`: schemaVersion 2, mapType hex, `subHexMaps` keyed `"q,r"`,
`subdivisionRings: 7` — importable; roads are fixture-only) and `fixture.stats.json`.

```
node spikes/lod/_shared/build.mjs _template
node spikes/lod/_shared/capture.mjs _template --scenario zoom-in --steps 48 --stride 4 --query "fixture=1"
```

`?fixture=1` routes `_template/main.ts` to `_shared/fixtureDemo.ts`: root then each child
drawn over it at its affine (no LOD), each child's owning parent hex outlined yellow, and
the fiducial parked under capture's cursor home so `zoom-in` dives root → `range` → `grand`.
Zoom range 0.62 → 400.
