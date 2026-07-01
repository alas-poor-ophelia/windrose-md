# Tile Import / Organize / Normalization — State of the Flow

**Date:** 2026-07-01
**Branch:** `feature/wall-paths` (tip after this work: `fb0bc704`)
**Author:** investigation + one shipped change this session
**Purpose:** Ground-truth map of what the tile import/categorization/organize pipeline
actually does today, after a common misconception ("hex tiles are tagged separately and
hidden on grid maps") sent us digging. Read this before touching the import/organize flow.

---

## TL;DR

- The plugin does **not** tag tiles hex-vs-grid at import, and never did. The impression
  that it "sorts tiles by map type" came from two *other* real mechanisms (tool/layer
  `hexOnly`/`gridOnly` flags, and grid-map depth-tier filtering) plus an **inert UI
  placeholder** copied verbatim from the design prototype.
- The design handoff's "strip Hex from labels + cross-pack merge" step — flagged there as
  "NOT yet built" — is in fact **already live**, just as a read-time projection rather than
  an import-time rewrite.
- The **one genuine gap** (silent hex/grid geometry scope) is now **DONE** as of this
  session — conservative, read-time, no schema/migration. See "Shipped" below.
- The organize tool works for bulk metadata edits; its **Move** control is a hard-disabled
  stub. Category-rail legibility polish and a couple of import bugs remain open.

---

## Source-of-truth files

| Concern | File | Notes |
|---|---|---|
| Add set from settings | `src/settings/tabs/TabRenderTilesets.ts` | "Add folder" + "Import pack" (.pck) |
| Folder scan → TileEntry | `src/assets/tilesetOperations.ts` (`scanTilesetFolder`) | sets `TileEntry.category` = subfolder |
| DD pack import orchestrator | `src/content-packs/ddImportCore.ts` | tags, depth/render/span prediction, detection scan |
| Category normalize + merge | `src/assets/categoryMerge.ts` | pure engine; read-time projection |
| Tile drawer (browse/filter/organize) | `src/components/panels/TileAssetBrowser.tsx` | `filteredTiles` ~L857, `mergedCategories` ~L898, organize mode L432+ |
| Per-tile metadata persist | `src/persistence/tileMetadata.ts` | `windrose-tile-metadata.json`, `pruneEmptyEntries` preserves fields |
| Tile/metadata types | `types/tiles/tile.types.ts` | `TileEntry` L115, `TileMetadataEntry` L221 |
| Design intent | `~/Downloads/_tile_ui_handoff/design_handoff_tile_drawer/` | `IA - Data Model & Flow.md` + `drawer/drawer-full.jsx` |

---

## DONE (works today, verified)

### Import auto-categorization (`ddImportCore.ts`)
Persists to `windrose-tile-metadata.json`, keyed by vault path:
- `ddSourceType` (objects/patterns/terrain/walls/paths) from DD folder structure
- `importTags` from DD source-path tags
- `depthAffinity` prediction (filename head-noun → ground/structure/props/decoration), threshold conf ≥ 0.4
- `renderMode` prediction — **only confident `region` writes persist** (conf ≥ 0.5)
- Detection scan at import (`runDetectionScan`): `alphaCoverage`, `opaqueW/H`, `srcW/H`
- Footprint/`defaultSpan` prediction — only persists spans > 1
- Wall-strip pairing (end caps + sidecar default colors)

### Category label-strip + cross-pack merge (`categoryMerge.ts`) — ALREADY LIVE
This is the design's "NOT yet built; next step" — but it's already working as a **read-time
projection** in `TileAssetBrowser.mergedCategories` (~L898):
- `NOISE` set includes `hex/hexes/hexagonal/square/grid/gridded` → stripped by `cleanLabel`
  and dropped by `normalizeTokens`. So "Hex Forest" already labels as "Forest".
- `clusterCategories` greedily merges by Sørensen-Dice ≥ 0.6; curated pack seeds the label.
- `humanizePackName` for pack chips ("FCWallsDev1" → "FC Walls").
- **Deliberately NOT persisted** — read-time is reversible and dodges the metadata-write RCA.

### Silent hex/grid geometry scope — SHIPPED THIS SESSION (`fb0bc704`)
The one real gap. Conservative policy chosen by the Guildmaster ("a crate is a crate"):
- `categoryMerge.ts` → new pure `detectTileGeometry(raw, tags)` → `'hex' | 'grid' | undefined`.
  Whole-token match on HEX_WORDS/GRID_WORDS; **both-signalled or neither = undefined (agnostic)**.
- `TileAssetBrowser.tsx` `filteredTiles` → one filter on **both** map types: hide a tile only
  when it *explicitly* declares the OTHER geometry; absent → shows everywhere.
- Read-time derivation — **no schema change, no import write, no migration**; never touches
  placed-tile rendering (sidesteps the `windrose-tile-metadata.json` 304-tile-flip RCA).
- Backs the Filter panel's `"auto · {mapType} map"` note row (`TileAssetBrowser.tsx` ~L1711),
  which was previously an inert readout copied from `drawer-full.jsx:371`.
- 7 new unit tests in `tests/unit/assets/categoryMerge.test.ts`. Gate: 24 tests pass, tsc
  clean, eslint `--max-warnings 0` held. Live-verified by the Guildmaster on grid + hex scratch maps.

### Organize tool — bulk metadata edits (`TileAssetBrowser.tsx` L432–1358)
WIRED and functional: Select-All, **Tag…** (`bulkAddTag`), **Tier…** (`bulkSetDepthAffinity`),
**Star** (`bulkToggleStar`), search filter, per-tile select, Done/exit.

### "Add tiles" 3-step import wizard — DONE 2026-07-01 (`49e5a1f6`)
The design's never-built wizard (`organize.jsx`: Source → Tiers → Tags) now exists:
`src/settings/modals/AddTilesModal.ts` (native Modal) + pure engines in
`src/assets/importPlanner.ts` (`aggregateFolderTiers` confidence-vote,
`mineFilenameTags` frequency miner) + `scss/_import-wizard.scss`. Settings tab's two
entry buttons replaced by one "Add tiles" CTA. DD packs delegate to
`DungeondraftImportModal` from step ① (packs arrive pre-grouped/tagged — design-blessed).
Finish = register folder + tier/tag writes + `runImportDetectionPass`. Live-verified
end-to-end. **Deferred:** absorbing DD into steps ②③, suggestion "merge into" links,
drag-onto-drawer source.

---

## MAYBE / PARTIAL (built but not where it should be)

- **Category rail legibility** — the merge *data* is correct, but per `.claude/TILE-UI-FIDELITY-AUDIT.md`
  the rail still **truncates** ("Volcanic …", "Rivers Co…") and the merged categories aren't
  fully surfaced/wired to the 128px 2×2-mosaic row spec. Data done; presentation not.
- **Render-form facet** — `TileForm` (cell/region/line/autotile/scatter) is derived and shown
  as a badge in the ribbon for the selected tile, but **not** on grid thumbnails. `autotile`
  is reserved/future (`autoTileConfig`), `scatter` = the `freeform` flag.
- **Detection scan trigger** — runs at DD import (good) but the *browser-side* rescan is gated
  on drawer-open + idle callback, so for folder-added (non-DD) sets it can be **starved**.
  See open bug below.

---

## NOT DONE (open work, roughly priority-ordered)

1. ~~**Category-rail truncation / mosaic presentation**~~ — **STALE ITEM (verified 2026-07-01):
   this was copied from the pre-rebuild fidelity audit; the late-June punch-list already fixed
   it.** Full-pane rail today: 2×2 mosaic (22px ≈ spec's 20px `fd-railthumb`), names wrap up
   to 3 lines (`overflow-wrap:anywhere` + auto-height for the host button clamp), merged
   labels feed the rail via `mergedCategories.lookup`, thumbs load eagerly (#12), and the
   MergeB provenance banner exists. **Block-mode root 2-up MosaicCard grid is INTENTIONAL** —
   Guildmaster pivoted back to cards on purpose; the grid/list toggle covers the compact-rows
   preference. Do not "fix" it to the design's row spec. Tiny optional leftovers only:
   `displayCategory()` still lops unmerged deep paths to 2 segments in section headers
   (harmless post-merge), and merge provenance is Option B rather than the design-narrative's
   Option C (accepted).
2. **Organize → Move…** — hard `disabled={true}` stub (`TileAssetBrowser.tsx` ~L1347). Needs a
   folder/category reassignment or pack-remap UX. Organize is otherwise the "reconcile leftovers"
   surface the IA doc envisions (merge "Foliage" into "Forest", re-tier a mis-sorted tile).
3. ~~**`predictSpan` divisor bug**~~ — **STALE ITEM; was already fixed** in `d2c9d36f`
   ("two-ruler model"): the divisor is the per-tileset `pixelsPerCell` (default 256, DD spec),
   with a settings "Px / cell" input that recomputes baked spans. Verified 2026-07-01.
4. ~~**Starved browser detection scan**~~ — **DONE 2026-07-01**: new shared
   `src/assets/importDetectionPass.ts` (scan → depth → render-mode → span, fill-missing-only,
   injectable scanner); `ddImportCore` refactored onto it; settings folder-path commit now
   auto-runs it (debounced 1.2s) — the folder set's "import moment". RCA guard: render-mode
   predictions only when NO tile in the folder has prior metadata. Bonus: `renderModePredictor`
   gained a category/tags signal (weight 0.45, subfolder words like Terrain/Furniture) so
   folder sets without `ddSourceType` classify correctly — live-verified (region for
   Terrain textures incl. no bogus 12×12 spans; 1×2 bed / 2×1 bench spans).
5. **Per-tileset override UI removal (Phase 6)** — deferred until the per-tile override UI (Phase 7)
   lands; per-tile metadata already outranks per-tileset in `resolveTileRender`.

---

## Design-intent notes (from the handoff, so we don't relitigate)

- **Geometry is intentionally implicit** (`IA - Data Model & Flow.md` L131, L139-141): "hex vs
  square — never a label", a "silent global filter" set by the map. The `note`-styled, inert
  "auto · map" row is *faithful to the design*, not a half-wired control. What was missing was
  the backing filter — now supplied (conservative variant).
- **Facets** (IA L124-132): Role (`TileLayerRole`) · Layer (`MapLayer`) · Category (normalized) ·
  Tags · Pack (provenance filter) · Grid (implicit) · Render form (tool gating).
- **"Tiles / Walls" toggle is meant to be removed** — a wall is just a `line`-form tile in the
  Structure role (IA L168).
- **Conservative geometry policy is intentional** — most art is geometry-agnostic; only tiles
  that *explicitly* name the other geometry get hidden. If real hex/grid terrain packs later need
  firmer separation, the aggressive variant (pack-name grid-word, hide-non-matching) or a
  terrain/region-only restriction are the documented next dials.

---

## Guardrails (hard-won, do not trip)

- **Do NOT bulk-persist render-mode/depth/span predictions for an existing library.** Per-tile
  metadata outranks per-tileset in `resolveTileRender`; a bulk write retroactively re-renders
  already-placed tiles across every synced device (2026-06-09: 304 tiles silently flipped to
  region). Predictions apply at IMPORT time only. The geometry scope avoids this entirely by
  being read-time.
- Category normalization stays **read-time / lossless** — raw `TileEntry.category` is never
  rewritten; always reversible.
- `pruneEmptyEntries` (`tileMetadata.ts`) must keep preserving every real metadata field on save.
