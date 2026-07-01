# Wall/Path Edit Lag — Fix Handoff & Continuity Note

**Date:** 2026-07-01
**Branch:** `feature/wall-paths` (now current: merged `feature/tile-ui-redesign` = main + 48 commits, merge commit `4043e752`)
**Backup:** `backup/wall-paths-premerge` (pre-merge wall-paths tip — safety net)
**Status:** Diagnosis complete (4-scout convergence). Fix **NOT yet implemented.** Merge just landed, so the work surface moved — **do a verification pass before writing the fix.**

---

## 0. Why this note exists

The wall/path feature branch was 95 commits behind the tile-UI redesign. We diagnosed the
lag on the *old* branch, then merged the redesign in (9 conflicts, non-trivial). The diagnosis
file:line anchors below were captured **pre-merge**. The merge integrated wall rendering into
tile-UI's new multi-board `drawLayer` render loop, so **line numbers and possibly the exact
render path have shifted.** The mechanism is almost certainly unchanged, but confirm it first.

---

## 1. Symptom (as reported by the Guildmaster)

Dungeondraft-style walls/paths render along an editable vector/bezier and *work*, but are **very
laggy**:

- A **huge lag spike shortly AFTER starting to interact** with a wall (click to move it / adjust
  its curve).
- **Normal during the drag itself.**
- **Another huge spike on mouse release** (the settle/commit).
- **Another spike after the next click.**

"Some kind of render overwhelm — the settle or start-of-move causes a massive spike of calls."
Historically Windrose has hit similar issues (see `docs/RCA-2026-06-09-performance-collapse.md`).

---

## 2. Diagnosis — ONE root cause, four faces

Four independent scout investigations (interaction-start, release/settle, render/cache,
Preact-cascade) **all converged on the same root.**

### The root

During an **edit-drag**, every `pointermove` calls:

```
updateWall(..., suppress=true)
  → onWallPathsChange(walls, /*suppressHistory*/ true)
    → updateMapData(fn)            // useDataHandlers.createLayerDataHandler
      → setMapData(newObject)      // NEW mapData identity every frame
        → new activeLayer / new mapData.layers reference
```

**The `suppress` flag only skips the undo-history push. It does NOT stop the state write.**
So a fresh `mapData` object is produced on every pointer-move frame. That single fact detonates
in two directions at once:

#### Face A — Static-layer cache is busted every frame
- The static render cache key (`staticKey` in `useCanvasRenderer.ts`) holds `activeLayer` **by
  reference**. New `mapData` → new layer ref → `staticKeysEqual` fails → **full `drawStaticContent`
  re-raster every frame**: grid, cells, curves, region `createPattern` fills, and **every wall
  re-tessellated from scratch**.
- Wall tessellation is uncached: `flattenWallPath()` subdivides each arc into up to **48**
  sub-points, then `drawStripAlong()` issues one `ctx.drawImage` per sub-segment per texture
  chunk (**hundreds to ~1400 drawImage calls per wall per frame**).
- The renderer's own comment claims *"cost is per-edit, not per-frame"* — **defeated**, because the
  suppressed write still changes the layer reference.
- (Confirmed-safe: no `createPattern` inside the wall renderer itself; region fills do use it.)

#### Face B — Preact context cascade every frame
- `mapStateValue` (in `MapCanvas.tsx`) is a `useMemo` with `mapData` in its deps → new `mapData`
  → `MapStateContext` broadcasts a new value → **every layer component re-renders**. None of the
  layer components are `memo()`'d.
- Amplifier: `theme` is rebuilt as an inline object literal in `DungeonMapTracker.tsx` on every
  render (not memoized), so each `mapData` change also gives `useCanvasRenderer` a new `theme`.

### Why the specific spikes

- **START spike** — `handlePointerDown` (WallLayer) runs an **O(N) hit-test across ALL walls**,
  each calling **uncached** `flattenWallPath` (48 subdiv/arc). No bounding-box pre-filter, no
  spatial index. Thousands of point-distance checks before the drag even begins.
- **RELEASE spike** — `handlePointerUp` fires `onWallPathsChange(getWalls(), /*suppress*/ false)`
  — the non-suppressed commit → another full cache-miss re-render + the history write.
- **NEXT-CLICK spike** — a 150 ms `settleTimer` in `useCanvasRenderer` fires a **second** full
  static re-render that collides with the next click's own render request; **plus** the 2-second
  debounced `saveMapData` kicks off a ~1 MB `JSON.stringify` (≈10 ms desktop, ≈900 ms iPad per the
  RCA doc).

### Pre-merge file:line anchors (RE-VERIFY after merge)

| Concern | File | Approx. line (pre-merge) |
|---|---|---|
| Edit-drag pointermove → `updateWall(...,true)` | `src/components/mapcanvas/WallLayer.tsx` | ~488–520 |
| Grab hit-test O(N) scan | `src/components/mapcanvas/WallLayer.tsx` | ~431–443 (`distanceToWall` loop) |
| `distanceToWall` (uncached flatten) | `src/components/mapcanvas/WallLayer.tsx` | ~64–80 |
| `drawEditHandles` (2nd flatten on overlay) | `src/components/mapcanvas/WallLayer.tsx` | ~300 |
| Commit on release | `src/components/mapcanvas/WallLayer.tsx` | ~560–574 |
| `suppressHistory` only gates history, not the write | `src/hooks/state/useDataHandlers.ts` | `createLayerDataHandler` (~75–92, `handleWallPathsChange`) |
| `setMapData` new-object per call | `src/hooks/state/useDebouncedSave.ts` | ~75–84 (`updateMapData`) |
| `staticKey` holds `activeLayer` by ref | `src/hooks/canvas/useCanvasRenderer.ts` | ~822–831 (**moved by merge — wall render now inside the `drawLayer` loop, ~694**) |
| 150 ms settle timer | `src/hooks/canvas/useCanvasRenderer.ts` | ~217–229 |
| `mapStateValue` depends on `mapData` | `src/components/mapcanvas/MapCanvas.tsx` | ~422–440 |
| `theme` rebuilt inline | `src/DungeonMapTracker.tsx` | ~459–474 |
| `flattenWallPath` (no cache) | `src/geometry/renderers/wallPathRenderer.ts` | `flattenWallPath`, `drawStripAlong` |

---

## 3. Proposed fix — plan + justification (theoretical, unverified)

One insight collapses most of it: **edit-mode should follow the pattern draw-mode already uses.**
Draw-mode placement previews render on the **overlay canvas** (`drawPreview` on `overlayRef`) and
only commit to `mapData` on completion. Edit-mode instead writes to `mapData` every pointermove.
Make edit-mode ephemeral too.

### Fix 1 — PRIMARY (~90% of the win): ephemeral overlay drag, commit once on pointerup
- During an edit-drag, hold the modified wall in a **local ref/state** (not `mapData`). Render the
  dragged wall live on the **overlay canvas** (`drawEditHandles` already flattens+draws the
  selected wall on the overlay). Call `onWallPathsChange` **only on `pointerup`.**
- Result: **zero `mapData` writes during the drag** → static cache stays valid → no per-frame
  re-raster, no context cascade, no per-frame `renderWallPaths`. One commit at the end.

  **Key nuance the implementer must resolve — the "ghost":** while dragging, `mapData` is unchanged,
  so the static layer still shows the wall at its ORIGINAL position, while the overlay shows it at
  the new position → a ghost underneath. Two options:
  - **(a) Exclude-at-start (recommended):** pass a `draggingWallId` to `renderWallPaths` so the
    static render skips the wall being dragged. Pay **one** re-raster at drag-START (excludes the
    wall), stay cached for the whole drag, pay **one** re-raster at COMMIT (re-includes it).
    Net: **2 re-rasters per gesture instead of N.** The start re-raster is the now-*justified*
    single start cost.
  - **(b) Ghost-underneath:** accept the original showing faintly beneath the drag preview. Simpler,
    uglier. Probably not acceptable for a polished tool.
  - Note the merge moved wall rendering **inside the multi-board `drawLayer` loop**
    (`useCanvasRenderer.ts`, wall render keyed on `drawLayer.wallPaths`, ~line 694). The
    `draggingWallId` exclusion must work within that loop. Verify curves/tiles don't already have
    an analogous drag-exclusion pattern to copy.

### Fix 2 — Grab spike: bbox pre-filter in `distanceToWall`
- Before the expensive polyline flatten, compute/lookup a cheap **bounding box** for each wall
  (from its vertices, optionally cached on the wall). Skip any wall whose bbox (+ hit tolerance)
  doesn't contain the pointer. Only flatten the survivors. Kills the O(N)·48-subdiv scan on
  `pointerdown`.

### Fix 3 — Cheap win: `WeakMap<WallPath, FlattenedPath>` cache in `wallPathRenderer.ts`
- Mirror `curveRenderer.ts`'s `path2DCache = new WeakMap<Curve, Path2D>()`. Since `WallPath`
  objects are replaced by reference on every mutation, the WeakMap auto-invalidates on real
  changes and reuses across frames where the wall is unchanged. Helps every render pass that still
  runs (and `drawEditHandles`, which flattens the selected wall on the overlay each frame).

### Fix 4 — Polish: dirty-check the commit
- In `handlePointerUp`, skip the `onWallPathsChange(getWalls(), false)` commit if the drag moved
  less than an epsilon (avoids writing a history entry + full re-render for a 0.5 px twitch).

**Blast radius:** primarily `WallLayer.tsx` + `wallPathRenderer.ts`; Fix 1(a) touches
`useCanvasRenderer.ts`/`renderWallPaths` signature for the `draggingWallId` exclusion. Follows an
established in-repo pattern (overlay preview). Not judged to need an architecture council.

---

## 4. Verification pass the next agent should run FIRST (post-merge)

Before implementing, confirm the merge didn't change the diagnosis:

1. **Re-anchor the file:lines** in the table above on the current `feature/wall-paths` tip.
   Especially `useCanvasRenderer.ts` — wall render is now inside the `drawLayer` loop (~694) and
   the `staticKey` region may have moved.
2. **Confirm the root chain is intact:** `updateWall(...,true)` → `onWallPathsChange` →
   `updateMapData` → new `mapData`/`activeLayer` ref, and that `suppressHistory` still only gates
   history (not the state write). `useDataHandlers.ts` and `WallLayer.tsx` wall logic were **not**
   structurally changed by the merge — verify.
3. **Confirm the static-cache-bust still applies** with `activeLayer`/`drawLayer` in the key under
   the new multi-board loop. (The multi-board change is the most likely thing to have altered the
   render path.)
4. **Confirm Fix 1(a) is feasible** within the `drawLayer` loop — can a `draggingWallId` be
   threaded to `renderWallPaths`, and does excluding one wall keep the static cache otherwise valid?
5. **Then implement**, and **live-verify on BOTH grid and hex maps** (geometry-abstraction bugs
   often show on only one).

### Measuring the fix
- `window.__windroseStaticDbg` (in `useCanvasRenderer.ts`) tracks static-cache `hit`/`rerender`/
  `missIdx` — read it from the console to prove re-rasters/frame dropped from N to ~2 per gesture.
- On-device: command **"Record performance telemetry (60s)"** writes a report to the vault root.
- Deploy for live testing: `npm run deploy` (builds + copies main.js/styles.css/manifest.json into
  the vault plugin folder `windrose-map-designer`, plugin id `windrose-md`). DOM query > screenshot.
- Gate before commit: `npm run check` (tsc + ESLint `--max-warnings 0`) and `npm run test:unit`
  (1549 tests). E2E wall coverage: `tests/e2e/wall-drawing.test.ts`.

---

## 5. Post-merge housekeeping (loose ends from this session)

- **`src/components/panels/WallStripList.tsx` is now orphaned/dead.** The Guildmaster removed the
  Tiles/Walls mode toggle from `TileAssetBrowser` (walls now surface via the tag/filter system), so
  `WallStripList` + `assetMode` + `wallStrips` + `handleWallStripSelect` were deleted from the
  browser. `WallStripList.tsx` is lint-clean but no longer imported anywhere — **candidate for
  deletion.** (There is no other reference in `src/` or `tests/`.)
- **Parked stash:** `git stash list` — "session-artifacts-before-wallpaths-merge" holds tile-UI
  session artifacts (local settings, test-vault fixtures, `.claude` planning docs, lint scratch).
  Restore onto the appropriate branch when convenient, or drop if stale.
- **Backup branch** `backup/wall-paths-premerge` can be deleted once the fix lands and is verified.
- The DD import modal on this branch is the **slim `runDdImport`-delegating** version — do not
  reintroduce tile-UI's inline extraction loop; the logic lives in `ddImportCore.ts`.

---

## 6. Guild lore references
- Landmark `id=1871` — "Wall-edit lag: one root, four faces" (the diagnosis).
- Landmark `id=1876` — "wall-paths merged current: 9 conflicts, 0-warning held" (the merge).
