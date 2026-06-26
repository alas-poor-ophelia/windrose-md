# Tile-UI Redesign — Prioritized Rebuild Plan

Companion to `TILE-UI-FIDELITY-AUDIT.md`. Grounded in a 3-scout source map of the **real** component tree (file:line below). Branch: `feature/tile-ui-redesign`.

## P5 — Post-rebuild punch-list (Guildmaster review, 2026-06-25)
Found during on-device review after the P0–P4 rebuild commit (`762c46e3`).

**Quick strikes — DONE (commit after `762c46e3`):**
- [x] **6** Tiles ribbon icon — `lucide-grid-3x3` AND `lucide-grid-2x2` are both invalid in this Obsidian build (silent empty span); switched to `lucide-layout-dashboard`. Also fixed the identically-broken rail "All" icon (`TileAssetBrowser.tsx`).
- [x] **2** Active tool icon — was muted gold on a gold frame (monochrome). Now bright `--windrose-text-primary` icon on `--windrose-bg-primary` + gold border/glow (`_tool-palette.scss`).
- [x] **8** Strata/depth fan text now uses the stratum hue — added `--depth-color` to the bar segment + fan rows and pointed `.is-active` color at it (`DepthBar.tsx`, `_depth-bar.scss`).

- [x] **4** Boards switcher is now a **dropdown** (`<select class="windrose-dock-board-select">`) replacing the button row — `DockLayerList.tsx` + `_dock.scss` (incl. `.is-tablet` select override).

**Still open (handoff — fresh session):**
- [ ] **5** Thumbnail/List view toggle — **reclassified: this is a BUILD, not a missing control.** `TileAssetBrowser` has no `viewMode`/list-mode rendering at all (only the prototype did). Needs: `viewMode` state, a `.windrose-tb-list` dense-row render path, and the header grid/list toggle.
- [ ] **13** Remaining Layers-menu `.is-tablet` — earlier pass covered board-tab/board-btn/stratum-add/layer-action; the new `.windrose-dock-board-select` got its own tablet override. Spot-check any other dock controls on device.

**Handoff (fresh session — builds / investigations):**
- [ ] **1** Left ribbon incomplete — Tiles/Objects tabs are mis-positioned, and **Recent/Starred + the Mode subtools are absent from the ribbon** (Recent/Starred currently live in the category rail; subtools only when a tile is selected). Restructure per handoff: ribbon = Tiles/Objects tabs → Recent/Starred → active tool's Mode subtools.
- [ ] **3** Subtool flyouts don't open — the blue subtool triangle shows but the flyout never opens in the vertical palette. Investigate `ToolPalette` subtool-menu trigger/positioning in vertical mode.
- [ ] **7** Layers **Simple mode should be Boards-only** (currently a flat layer list). Confirm against `Layers × Tiles.html` / README, then change the Simple branch in `DockLayerList.tsx`.
- [ ] **9** **Filters menu entirely missing** — the power-user Filter drill-down (search + Filter button → Tags/Packs checkable value lists → Done), shared state with quick chips. Whole feature build per README §"Filter row".
- [ ] **10** Pack/tag chip section is wrong vs the design (layout/behaviour) — compare to prototype.
- [ ] **11** Category-vs-Packs — the legible rail may still be **pack-shaped, not the merged "Category" concept**; verify `groupedTiles`/`mergedCategories` is actually merging across packs (may need a re-import to populate `TileEntry.category`). Investigate before assuming a code bug.
- [ ] **12** 2×2 rail mosaics don't load until clicked — `getThumbUrl` returns but the thumbnail callback/`requestThumbs` never fires for some rail previews (visibility-driven pipeline not triggered for rail mosaics). Wire `requestThumbs` for rail preview tiles.

## Status (2026-06-25)
- ✅ **P0 — Objects width** (`_object-sidebar.scss` fluid) · **drawer 320→384** (`useTileBrush.ts`) · **Strata-on-first-tile** (`useDataHandlers.ts` dedicated `handleTilesChange` → `promoteToStrata`). Live-verified.
- ✅ **P1 — Tool rail containment**: `.windrose-stage` flex-row wrap (`DungeonMapTracker.tsx` + `_full-pane.scss`), vertical palette `height:100%` (`_tool-palette.scss`). Now a full-height flush-left ribbon; undo/redo fell to the bottom. Live-verified.
- ✅ **P2 — Drawer re-assembly**: 3 headers→1; subtool ribbon top-bar→46px vertical left column (`renderDrawerRibbon` in `DungeonMapTracker.tsx`, `TileSubtoolRibbon.tsx` tools-only, `_tile-drawer.scss` row layout). Tiles/Objects tabs relocated to ribbon. Live-verified (panetabs gone, subrib 46 / main 338, Objects switch works).
- ✅ **P3 — Category rail legibility**: killed truncation (inline style `TileAssetBrowser.tsx:1556` + `.catname`/`.card-name` CSS); rail rows now `[2×2 mosaic | wrapping name | count]`; rail 104→128px. Live-verified (full names wrap, 9 mosaics).
- ✅ **P4a — Role-bleed**: rail was never role-filtered (`filteredTiles` `TileAssetBrowser.tsx:758`); added grid-only filter `(depthAffinity ?? 'ground') === tileDepth`. Live-verified: Terrain=terrain only, Structure=walls/paths only.
- ✅ **P4b — Tag-chip noise**: filter `availableTags` (`TileAssetBrowser.tsx:754`) — drop chips containing a grid/packaging NOISE word (reused `categoryMerge.NOISE`) or matching a pack/dev-id pattern. Live-verified tag chips → `["walls","paths"]` (search still matches all). NOTE: `Hex Samples`/`FCWallsDev1` remaining are **pack-facet** chips (tileset names), legitimate provenance — not tag noise. Pack-name display cleanup is a separate tileset-settings concern if wanted.

## The reframe (what the scouts changed)
The redesign is **less "rebuild from scratch" than the screenshots suggested** — most pieces *exist* but are **mis-assembled or mis-contained**:
- The category **merge engine is real and active** (`src/assets/categoryMerge.ts`, Dice 0.6 + noise-strip + alias; `TileAssetBrowser.tsx:805–844` groups by merged category). Not a build — a tune.
- A **2×2 `MosaicCard`** already exists and renders in compact mode (`TileAssetBrowser.tsx:253–278`) — it's just not used in the full-mode rail.
- The **Board→Strata→Layer** dock fully works (`DockLayerList.tsx:307–380`); it only renders flat because the map defaults to **Simple mode**. Not a bug.
- A full-height **`EdgeRail`** rail pattern already exists (block mode, `src/components/panels/EdgeRail.tsx`) — the architectural cousin of what the full-pane tool rail should be.

So the work is **layout/containment + re-assembly + a few CSS rules**, not green-field. Effort is communicated by blast radius + step count, not time.

---

## Re-prioritized severity (post-scout)

| Item | Surface | Nature | Effort | Blast radius |
|---|---|---|---|---|
| **A. Tool rail containment** | ToolPalette | layout/CSS | small-med | 1 component mount + 2 SCSS partials |
| **B. Drawer re-assembly** | Tile drawer | structural re-layout | **large** | DungeonMapTracker render + TileAssetBrowser + 2 SCSS |
| **C. Category rail legibility** | Tile drawer | swap text→mosaic, kill truncation | medium | TileAssetBrowser + _tile-browser.scss |
| **D. Objects width** | Objects | 1 CSS rule | **trivial** | _object-sidebar.scss |
| **E. Strata default/discoverability** | Layers | default flag + UI nudge | small | layerAccessor / map creation + DockLayerList |
| **F. Merge tuning (role bleed)** | Tile drawer | data/heuristic tuning | medium, uncertain | categoryMerge.ts + role assignment |

---

## P0 — Quick wins (independent, low-risk, ship first to bank momentum)

### D. Objects pane fills the drawer
- **Cause:** `scss/_object-sidebar.scss:7–8` hard-pins `width:180px; min-width:180px`. Mounted inside `.windrose-drawer-pane` (no width constraint) at `DungeonMapTracker.tsx:1339–1342` (full-pane) / `1097–1100` (block).
- **Fix:** make the sidebar fluid when embedded in the drawer (`width:100%; min-width:0`), keeping the 180px floor only where it's still a standalone left sidebar (if any caller needs it — verify there's only the drawer caller). Re-check object grid column count at full width.
- **Verify:** Objects pane width == drawer width (320px), no dead space.

### E. Strata as the default for tile maps
- **Cause:** `map.types.ts:308` `layerMode?` undefined → flat; gate at `DockLayerList.tsx:58`. `addBoard()` stamps `'strata'` (`layerAccessor.ts:264`) but a fresh single-board map never does.
- **Fix (decision needed — see below):** either (a) stamp `layerMode:'strata'` on tile-map creation / first tile import, or (b) leave default Simple but make the toggle more prominent. Lowest-risk = default new tile maps to strata; leave existing maps alone (no migration).
- **Verify:** open a fresh tile map → dock shows strata hierarchy without manual toggle.

---

## P1 — Tool rail containment (Item A)
**Goal:** full-height ribbon flush off the canvas's left edge; reduced (not removed) bracket chrome; tool *set stays placeholder*.

- **Mount:** `DungeonMapTracker.tsx:738` `.windrose-toolbar-anchor` is a block sibling above the canvas; `ToolPalette` gets `vertical={fullPane}` (`ToolPalette.tsx:760`).
- **Root causes (two, compounding):**
  1. `scss/_full-pane.scss:22–28` — `.windrose-toolbar-anchor { position:absolute; left:10px; top:50%; transform:translateY(-50%) }` centered against the **whole** `.windrose-container` (header + canvas) → floats mid-screen.
  2. `scss/_tool-palette.scss:241–305` — `.windrose-tool-palette-vertical` has `max-height:100%` but **no `height:100%` / `align-self:stretch`** → collapses to content height (short capsule).
- **Approach:** move the anchor *into the canvas flex row* as a flush-left flex child (or re-scope its absolute positioning to the canvas wrapper, top:0 bottom:0), and give the vertical palette `height:100%` so it stretches edge-to-edge. **Reference the existing `EdgeRail` containment** (`EdgeRail.tsx`, `!fullPane` gate at `DungeonMapTracker.tsx:809`) — it already solves full-height-rail layout.
- **Brackets:** `ToolPalette.tsx:532` renders `<CornerBrackets variant="compact" .../>`; reduce via `CornerBrackets.tsx` (lighter variant / fewer corners) + `scss/_chrome.scss:220–252`.
- **Verify:** rail spans full canvas height, flush to left edge, no dead canvas above/below; brackets present but subtle.

---

## P2 — Drawer re-assembly (Item B) — the big one
**Goal:** ONE cohesive panel: `header → depth band → filter row → chips → body[ 46px vertical ribbon | rail | grid ]`.

- **Current (wrong) stack** — `DungeonMapTracker.tsx:1339–1341` renders, vertically: `renderPaneTabs()` (`.windrose-drawer-panetabs`, :156–161) → `renderSubtoolRibbon()` (`TileSubtoolRibbon.tsx`, horizontal bar, empty when `form==null`) → `TileAssetBrowser` (which renders its OWN `.windrose-tb-head`, `TileAssetBrowser.tsx:1223–1251`). Three headers; ribbon is a top horizontal bar, not a left column.
- **Target assembly:**
  1. **Collapse 3 headers → 1.** Fold pane tabs + browser head into a single header row (title + view toggle + settings + Organize + collapse). Remove the standalone "Select a tile" top bar.
  2. **Move the subtool ribbon to a vertical left column** inside the browser body (the `[ribbon | rail | grid]` flex), not a top bar. `.windrose-fd-subrib` is currently `display:flex` horizontal (`_tile-drawer.scss:51–65`) → make it the 46px vertical column carrying Tiles/Objects tabs + Recent/Starred + Mode subtools.
  3. **Relocate Tiles/Objects tabs** from the top `panetabs` onto that left ribbon (spec). Keep tool-driven switching.
- **Effort:** largest item — touches the drawer render in `DungeonMapTracker.tsx`, `TileAssetBrowser.tsx` header/body structure, `TileSubtoolRibbon.tsx`, and `_tile-drawer.scss` / `_tile-browser.scss`. Sequence after P1 so the shell is stable.
- **Verify:** single header; left vertical ribbon populated; grid + rail fill remaining width.

---

## P3 — Category rail legibility (Item C)
**Goal:** legible rows — 2×2 mosaic + wrapping name + count, never truncated; rail at spec 128px (currently 104px).

- **Truncation (two sources):** inline JSX style at `TileAssetBrowser.tsx:1556` (`whiteSpace:nowrap…ellipsis` on the rail span) **and** CSS `.windrose-tb-card-name` (`_tile-browser.scss:790–797`) + `.windrose-tb-seclabel .catname` (`:422–427`). Must fix both — removing CSS alone won't help the rail (inline wins).
- **Mosaic:** reuse `MosaicCard` (`TileAssetBrowser.tsx:253–278`) in the full-mode rail (`:1549–1558`) instead of plain text buttons.
- **Width:** bump `.windrose-tb-rail` 104→128px (`_tile-browser.scss:326–339`).
- **Verify:** "Rivers Coasts & Seas", "Medieval Fantasy Locations" wrap fully with mosaic; no ellipsis anywhere.

---

## P4 — Merge tuning / role bleed (Item F) — investigate, then tune
**Goal:** stop Structure-role categories (`walls` 349, `paths` 218) appearing under the **Terrain** role; clean noisy chips (`FCWallsDev1`, `hex basic terrain set`).

- Merge engine works (`categoryMerge.ts`); the bleed is likely **role assignment** (tiles' `tileRole`/`depthAffinity`) not the merge itself. Needs a focused investigation: are walls/paths mis-tagged to ground, or is the role→category filter not applied in the rail query?
- **Uncertain** — scope after P2/P3 land; respect the RCA constraint: **no bulk-persisting predicted roles** onto the existing library.

---

## Decisions I need from you (Guildmaster)
1. **Execution order:** P0 quick wins first (momentum), or jump straight to P2 drawer (your biggest pain)?
2. **Strata default (E):** default *new* tile maps to Strata mode? (Leaves existing maps untouched — no migration.)
3. **Drawer width:** keep 320px default, or move toward the spec's 384? (You said width is adjustable.)
4. **Tool set (A):** confirmed staying placeholder — I won't touch the icon list, only the rail's containment + chrome. ✔ (assumed)
