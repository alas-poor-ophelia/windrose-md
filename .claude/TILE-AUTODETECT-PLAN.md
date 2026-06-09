# Tile Auto-Detection & Multi-Cell Footprint Plan

Status: DRAFT (pending adversarial review)
Date: 2026-06-08
Branch: standalone-conversion

## Goal

Make tile render behavior **work out of the box**: Windrose should auto-detect, per
tile, (a) whether it renders as seamless terrain (`region`) or a discrete stamp/object
(`cell`), and (b) how many grid cells a prop should occupy (its footprint). Users can
correct any guess. None of this has shipped — greenfield, so we build the proper model.

## Core architectural decisions (locked)

1. **Flags are per-tile, not per-tileset.** A DD pack / artist folder imports as ONE
   tileset but contains terrain + patterns + objects. The per-tileset `renderMode`
   dropdown cannot express this. This is the SAME shape as the existing `depthAffinity`
   system: `depthPredictor` already classifies each tile individually and stores the
   result per-`vaultPath` in `tileMetadata`. `renderMode` and `span` become additional
   per-tile metadata fields predicted by the same pipeline.

2. **Resolution chain (single helper):**
   `per-placement override (TileAssignment)` → `tileMetadata classification` →
   `global default`. The per-tileset tier is removed.

3. **True multi-cell footprint** for props (not visual-scale-only), phased: data model +
   detection + renderer + erase/hit-test land first; footprint rotation, placement-preview
   ghost, and formal collision rules are fast-follows.

4. **Remove** the per-tileset "Tileset rendering" config panel, the `tilesetOverrides`
   plumbing that feeds it, and the `tilesets[0]` resolution hack. Override surface moves
   to per-tile (tile browser, writes `tileMetadata`) + per-placement (`TileAssignment`).

5. **Reuse, don't rebuild.** Wire the already-built-but-dead alpha pipeline
   (`measureAlphaCoverage`) and the already-computed-but-discarded `scanBounds` tight
   alpha bounds (thumbnailCache) as detection signals.

## Key files (from survey)

- `types/tiles/tile.types.ts` — `TilesetBase`, `TileAssignmentBase`, `TileMetadataEntry`, `TilesetOverrides`
- `src/assets/depthPredictor.ts` — predictor pattern to extend (`extractTokens`, `HEAD_NOUN_KEYWORDS`)
- `src/assets/tilesetOperations.ts` — `measureAlphaCoverage` (dead), `probeFirstTileImage` (alpha stub)
- `src/assets/thumbnailCache.ts` — `scanBounds` (tight alpha bounds, currently discarded)
- `src/assets/useTilesetBuilder.ts` — build-time trigger point
- `src/geometry/renderers/tileRenderer.ts` — `getTileRenderMode`, `getEntryMap` cache key, `drawCellTile`, `renderRegionFills`
- `src/components/panels/TileAssetBrowser.tsx` — depth-prediction batch effect, render config panel (to delete), per-tile override UI (to add)
- `src/components/mapcanvas/TilePlacementLayer.tsx` — placement, erase, hit-test, flood fill
- `src/DungeonMapTracker.tsx` — `handleTilesetOverrideChange` dual-write (to remove)
- `src/content-packs/DungeondraftImportModal.ts` — DD import, terrain exclusion at line ~227

## Phases

### Phase 0 — Schema + resolution helper (additive, no behavior change) — DONE
DONE: `TileMetadataEntry` + `TileAssignmentBase` extended; `pruneEmptyEntries` preserves new
fields (exported + regression-tested); `src/assets/tileRenderResolution.ts` resolver + canonical
default constants; unit tests green. Type-clean (only pre-existing branch errors remain).
- Extend `TileMetadataEntry`: `renderMode?`, `defaultSpanW?`, `defaultSpanH?`,
  `worldRepeat?`, `edgeFeather?` (relocated terrain params), plus optional
  `alphaCoverage?` and `opaqueW?/opaqueH?` (cached detection signals).
- Add `spanW?`, `spanH?` to `TileAssignmentBase` (per-placement footprint).
- New `resolveTileRender(assignment, metadata, globals)` → effective
  `{ renderMode, spanW, spanH, fitMode, worldRepeat, edgeFeather, stampThreshold, minStampScale }`.
  Replaces scattered `?? tileset.x ?? const` reads with one chain. Global defaults as
  module constants.

### Phase 1 — Eager detection scan pass — DONE
DONE: `src/assets/tileImageScan.ts` (`scanTileImageSignals` + concurrency-limited
`runDetectionScan` + pure `analyzeAlphaPixels`); `bulkSetDetectionSignals` persistence;
abortable idle-deferred backfill effect in TileAssetBrowser; 6 unit tests. Replaces the
original thumbnail-piggyback approach (which was fatally lazy/LRU-evicted).

### Phase 2 — predictRenderMode — DONE
DONE: `src/assets/renderModePredictor.ts` (DD source + alphaCoverage + ground-noun signals,
region gated >=0.5, cell stays implicit); `bulkSetRenderMode`; wired into the browser
detection effect (post-scan, all unclassified tiles) AND DD import (ddSourceType-only); 12
unit tests. Pixel refinement at browser scan supersedes the import-time DD-only guess.

### Phase 1 (original) — Wire alpha + tight-bounds signal (cheap, piggybacked) — SUPERSEDED
- Extend `scanBounds` (thumbnailCache) to also return `alphaCoverage` (opaque-pixel
  fraction) and opaque bounds W/H — already does `getImageData` on a 128px downscale, so
  near-free. Persist into `tileMetadata` during thumbnail generation.
- Populate the `probeFirstTileImage.alphaCoverage` stub as a fallback for tilesets whose
  thumbnails haven't been generated.

### Phase 2 — `predictRenderMode` (detection)
- Sibling to `predictDepthTier`. Signals: `ddSourceType` (patterns/terrain→region,
  objects/walls→cell), ground-tier filename tokens (reuse `HEAD_NOUN_KEYWORDS`),
  `alphaCoverage` (≥0.6 opaque→region), aspect/dimension (≈square & ≈tileWidth→region).
  Output `{ mode, confidence }`, gate ≥0.4, write `tileMetadata.renderMode`.
- Trigger at same points as depth: `useTilesetBuilder` build + `DungeondraftImportModal`
  import + the TileAssetBrowser batch effect.

### Phase 3 — Renderer consumes per-tile renderMode — DONE
DONE: renderMode resolved per-tile via `resolveTileRender(assignment, meta, tileset)` at the
region-diversion point in `renderTiles` (tileset = temporary fallback tier). `RegionGroup` now
carries resolved `worldRepeat`/`edgeFeather` so per-tile terrain params reach `renderRegionFills`.
Metadata sourced from a module-singleton accessor (`getTileMetadataForRender`/
`setTileMetadataForRender` in tileMetadata.ts) — mirrors the `settingsAccessor`/`getTheme()` idiom,
read fresh each frame. Populated on map mount (DungeonMapTracker) + kept in sync by TileAssetBrowser.
- **No cache-version counter needed.** Resolving renderMode LIVE per-frame (not baking it into the
  cached entryMap) sidesteps the H-508 partial-key staleness entirely — nothing to go stale.
- **Export + hover-preview render correctly for free** — both call `renderCanvas` and the global
  accessor reaches `renderTiles` without threading (resolves the Parallax exportOperations concern).
- VERIFY PENDING (live app): region path needs `CAN_SET_PATTERN_TRANSFORM && isGrid`, unreachable
  in the node unit env — confirm seamless terrain fill vs cell stamp with placed DD terrain tiles.
- Phase 7 follow-up: live-restain of already-placed tiles when the override UI toggles renderMode
  (detection writes happen pre-placement, so first paint is already correct).

### Phase 4 — `predictSpan` (detection) — DONE
DONE: `src/assets/spanPredictor.ts` (`predictSpan(opaqueW, opaqueH, tileWidth, tileHeight)` →
`{ spanW, spanH }` from TIGHT opaque bounds; floor at SPAN_PROMOTE_RATIO=1.4 so padding/
marginally-large props stay 1, round above that, cap ≤ MAX_TILE_SPAN). `bulkSetDefaultSpan`
persistence. Wired into the TileAssetBrowser detection effect AFTER render-mode prediction:
skips region tiles (terrain has no footprint), needs cached opaque bounds, persists only spans
> 1 (1×1 stays implicit). 9 predictor + 2 setter unit tests. Resolver already reads defaultSpan*
(Phase 0); renderer consumption of span is Phase 5. Detection-only, no render change.
- `predictSpan(tile, opaqueDims, tileWidth)` → `{ spanW, spanH }` =
  `round(opaqueW/tileWidth) × round(opaqueH/tileHeight)`, using TIGHT bounds so
  transparent padding doesn't inflate span. Clamp ≥1, cap ≤16, only promote >1 when ratio
  clearly exceeds ~1.4. Only for cell/stamp tiles. Write `tileMetadata.defaultSpan*`.

### Phase 5 — Footprint-aware placement + interaction (HEAVY core)
- Placement: copy `tileMetadata.defaultSpan*` → `TileAssignment.spanW/H` at place time
  (per-placement, editable, stable if metadata later changes).
- Renderer: draw across footprint (anchor + span × cell), tight-bounds aware.
- New helpers: `cellsCoveredByAssignment(a)` + `assignmentAt(col,row)` (footprint-aware
  reverse lookup). Make footprint-aware: **erase tool, hover, selection, flood-fill
  occupancy, hit-test**.
- Brush rule: span>1 props ignore brush size, place single footprint at anchor.
- Overlap rule: same depth + overlapping footprint → replace; cross-depth → stack.
- DEFERRED to fast-follow: footprint rotation (90° swaps spanW/H), placement-preview
  ghost, formal collision/validation rules.

### Phase 6 — Remove per-tileset render UI + plumbing (AFTER Phase 7)
- Delete render config panel in TileAssetBrowser (renderMode/worldRepeat/edgeFeather/
  stampThreshold/minStampScale sliders).
- Remove `handleTilesetOverrideChange` dual-write + `tilesetOverrides` usage for these
  fields; remove `tilesets[0]` hack.
- Migration: unreleased → drop per-tileset overrides with a one-time log; OR best-effort
  fan out per-tileset renderMode to all that tileset's tiles' metadata. (Decide in review.)

### Phase 7 — Per-tile override UI (BEFORE Phase 6)
- Tile browser per-tile + multi-select controls: renderMode / span / terrain params.
  Writes `tileMetadata` via a `bulkSet…`-style flow (mirror `bulkSetDepthAffinity`).
  "Auto" shows detected guess; explicit set wins.

### Phase 8 — DD terrain import fix (independent, can land early) — DONE
DONE: `textures/terrain/` now extracted (ddSourceType 'terrain' reaches metadata); preview count
shows actual extractable (objects+patterns+terrain), fixing count-vs-extract divergence.
- Include `textures/terrain/` at DungeondraftImportModal (~line 227) so `ddSourceType:
  'terrain'` exists (strongest region signal). Verify `countAssets` vs extraction-filter parity.

### Phase 9 — Tests + dev-loop verify
- Unit: `predictRenderMode`, `predictSpan`, `resolveTileRender` chain, `scanBounds` coverage.
- Dev-loop/E2E: big prop → footprint occupancy → erase from any covered cell; terrain
  tileset → auto region; override flow.

## Suggested ordering
`8 (early, independent)` · `0 → 1 → 2 → 3 → 4 → 5 → 7 → 6 → 9`
(Removal of the old override path comes AFTER the new per-tile override path exists.)

## v2 — Revisions from Parallax adversarial review (SUPERSEDES above where conflicting)

### FATAL fixes (blocking — must land in Phase 0/1)
- **Detection is NOT a thumbnail side-effect.** `thumbnailCache` is lazy + virtualized +
  LRU-capped (MAX_CACHE=500) and discards `scanBounds` output (no callback/egress). Replace
  Phase 1 with an **explicit eager detection scan pass**: batched, concurrency-limited,
  decoupled from thumbnails; runs once per tile at import/build; writes signals
  (`alphaCoverage`, `opaqueW/H`) into `tileMetadata`; skips tiles already scanned. Trigger
  alongside the existing depth-prediction pass.
- **`pruneEmptyEntries` (tileMetadata.ts:54) must be extended in Phase 0** to preserve the
  new fields (`renderMode`, `defaultSpanW/H`, `alphaCoverage`, `opaqueW/H`). Otherwise
  detection results are deleted on the next debounced save (silent write-that-disappears).

### Footprint blast radius (Phase 5 — expanded touch list)
- `TilePlacementLayer.tsx`: `floodFillCells` (~61), placement *replacement* `findIndex`
  (~157), erase filter (~205) — all anchor-only today.
- `usePaintTool.ts` (~162-178): a SEPARATE erase path, anchor-only.
- `tileRenderer.ts`: span-aware draw across footprint; `sortTilesForRendering` (~241)
  z-order must account for non-anchor rows of large props.
- `exportOperations.ts:166`: `renderCanvas` is called WITHOUT `tileMetadata` → exports
  would render region tiles as cells. Must thread metadata into export.
- Undo/redo: re-erase-from-covered-cell must use footprint-aware anchor lookup.
- New helpers required: `cellsCoveredByAssignment(a)`, footprint-aware `assignmentAt(col,row)`.

### Rotation (PULLED INTO Phase 5, no longer deferred)
- Non-square span + rotation corrupts data permanently with no migration. Implement
  90°/270° span-swap in hit-test/erase/draw from the start. Only preview-ghost + formal
  collision rules remain fast-follow.

### Key scheme / SheetTileset
- Per-tile metadata keyed by `vaultPath`. `SheetTileset` sprites would share one
  `vaultPath` → collision. No `SheetTileset` is constructed today (type-only). Document
  per-tile detection as unsupported for sheet tilesets; if ever built, key `vaultPath:tileId`.

### Sequencing / divergence window
- Phases 3–6 risk contradictory state (old UI writes `tilesetOverrides`, renderer reads
  metadata). Resolver keeps a TEMPORARY tileset fallback tier until Phase 6 removal lands;
  tighten 3 → 7 → 6 into a coordinated sequence (new override path before old one dies).

### Consolidation / cheap-signature
- Two alpha scanners exist: `thumbnailCache.scanBounds` (128px) and
  `TileAssetBrowser.getContentBounds` (~44, full-res, keyed by data URL). Consolidate onto
  the eager scan pass; don't leave two disagreeing implementations.
- `getEntryMap` cache key folds a `tileMetadata` **version counter** (incremented on
  mutation), NOT a per-frame `JSON.stringify` — that would tank render perf.

### Revised ordering
`8 (early)` · `0 (schema + pruneEmptyEntries) → 1 (eager scan pass) → 2 (predictRenderMode)`
`→ 3 (renderer reads metadata, temp tileset fallback) → 4 (predictSpan) → 5 (footprint +`
`rotation swap + export) → 7 (per-tile override UI) → 6 (remove old UI + fallback) → 9 (tests)`

### Open questions for Guildmaster
- Eager scan pass: run at import only, or also a one-time backfill for already-built
  tilesets on first open of this version?
- `stampThreshold`/`minStampScale`: keep global-only, or also per-tile metadata overrides?
