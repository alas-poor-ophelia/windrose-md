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
- [x] **5** Thumbnail/List view toggle — **DONE & live-verified (2026-06-25).** Built the missing capability: `viewMode` state (`grid`|`list`), a `listMode` derived flag (`!compact && !organize && viewMode==='list'`), `rowSlice` (1 tile/row in list) feeding `fullRows`, a `LIST_ROW_H=34` virtualizer height, a `.windrose-tb-list`/`.windrose-tb-listrow` dense `[thumb|name|pack]` render branch, and a header `.windrose-tb-viewtoggle` grid/list segmented control (`lucide-layout-grid`/`lucide-list` — both verified rendering real SVG path content live, 4/6 children). Reuses the existing virtualizer + `TileThumbnail` + `handleTileClick`. Verified live: toggle flips, list shows 34px rows (name+pack `Hex Samples`+thumb), row-click selects (`.sel`), active button gold, toggle-back restores grid. 0-warning gate held.
- [ ] **13** Remaining Layers-menu `.is-tablet` — earlier pass covered board-tab/board-btn/stratum-add/layer-action; the new `.windrose-dock-board-select` got its own tablet override. Spot-check any other dock controls on device.

**Handoff (fresh session — builds / investigations):**
- [x] **1** Left ribbon — DONE & live-verified (2026-06-25). Ribbon now stacks per spec: **Tiles/Objects tabs → divider → Recent/Starred view-filters → divider + "Mode" cap → active tool's subtools**. Recent/Starred were moved off the category rail onto the ribbon by **lifting `railSel` to DMT as a controlled prop** (`tileRailSel`/`setTileRailSel`), threaded to `TileAssetBrowser` via a controlled/uncontrolled hybrid (`railSel = railSelProp ?? railSelLocal`) so every existing call site was untouched. Rail is categories-only now. Added `.windrose-fd-subrib-cap` SCSS. Verified: ribbon Recent→on flips rail "All" off (shared state round-trip), toggle back works, icons render, 0-warning gate, no runtime errors.
- [x] **3** Subtool flyouts — DONE & live-verified (2026-06-25). Root cause (measured, not guessed): the flyout *did* open (`position:absolute; left:100%`, z-1001) but the vertical rail's `overflow-y:auto` forces `overflow-x:auto`, shearing the right-opening menu to a ~3px sliver. Fix: in vertical mode the flyout is now `position:fixed`, anchored from the trigger button's rect — **but** Obsidian's `.workspace-leaf` has `contain:strict`, which makes IT (not the viewport) the containing block for fixed children, so coords are offset by a `fixedContainingOffset()` helper that walks up to the nearest transform/filter/contain ancestor. Gated to `vertical` so horizontal (block) mode keeps its working CSS-absolute path. Verified: 6px gap, vertically centered, fully visible, hit-testable, sub-option click selects the tool + closes. NB flyout opens via **long-press / right-click**, not a click on the ▼ indicator.
- [x] **7** Layers **Simple mode = Boards-only — DONE & live-verified (2026-06-25).** Conflicted with the earlier-resolved Q5 ("Simple = genuinely flat layer list"); **Guildmaster chose "Floors list only"** (floor pick/add/delete, NO per-layer rows; layer management lives in Strata). Rewrote the Simple branch in `DockLayerList.tsx`: gated on `onBoardSelect != null` so **tile (board-capable) maps** get the floor list while **non-board maps keep the flat layer list** untouched. New `.windrose-dock-floor-list/-row/-name/-del` SCSS (mirrors `.windrose-dock-layer-row`). `lucide-square-stack` verified rendering (3 SVG paths). Verified live: 2 floors ("Ground Floor"/"Floor 2"), "Floors" label, "Add Floor" footer, 0 per-layer rows leaked; clicking a floor switches the active board and round-trips into Strata (same board selected); Strata↔Simple toggle works. 0-warning gate held.
- [x] **9** **Filter drill-down — DONE & live-verified (2026-06-25).** Added `filterView`/`filterSearch` state + a `Filter` button in `.windrose-tb-filter` + a full-takeover overlay (`.windrose-tb-fscreen`) drilling Filter → Tags/Packs → searchable checkable value rows → Done, plus a disabled "Grid · auto" note row. Reuses the EXISTING `activeTags`/`packFilter`/`availableTags`/`availablePacks` — so quick chips and the Filter screen share one state for free (verified: checking a value flips the quick chip + Filter badge). SCSS mirrors the `.fd-*` prototype with `--windrose-*` tokens; fixed an Obsidian base-`button{justify-content:center}` bleed on the rows (`justify-content:flex-start`). `lucide-filter` verified rendering live. 0-warning gate held.
- [x] **10** Pack/tag chip section — **DONE & live-verified (2026-06-26).** The "design re-consult" was answered by the **handoff itself** (`Downloads/_tile_ui_handoff/.../drawer/drawer-full.jsx` + README §"The Tile Drawer") — I'd been asking the Guildmaster to re-derive what the spec already locks; the fix was to READ the prototype, not poll. Rebuilt to match `.fd-packs`: tag chips curated to **first 8** (`.slice(0,8)`); **pack chips** now a labeled facet row — leading **"Packs"** label (`lucide-folder-input`, 3-path valid) + pills of `[gold dot][humanized short name][count]` + a trailing **"clear"** link; gated on **role-scoped** `availablePacks.length > 1` (spec's `packsHere`). Pack names **auto-humanized** (`humanizePackName` in `categoryMerge.ts`: split acronym/camelCase, strip trailing dev/version tokens — `FCWallsDev1`→"FC Walls"; +3 unit tests, 18/18) and flow everywhere via `availablePacks.short` (chips + Filter screen `labelFor`). DD-origin dot-tint **DONE (2026-06-26)** — added `TilesetOrigin`/`origin?` to `TilesetBase`, derived at build in `createTilesetFromTiles` from tile vault paths (`/dungeondraft-packs/` ⇒ `'dungeondraft'`, else `'native'`; pure, retroactive, no migration), threaded through `availablePacks.origin` → dot is `--windrose-accent-blue` for DD packs, `--windrose-depth-ground` (gold) for native. Live-verified: `FCWallsDev1`→"FC Walls" blue dot (`oklch(0.52 0.18 256)`), `Hex Samples` gold (`#c4a57b`); +2 unit tests. Live-verified by temporarily relaxing the gate to `>0` (then reverted): "Packs" label, "Hex Samples"×53 / "FC Walls" chips, gold dot `#c4a57b`, select→`.on`, clear works. With the 2 disjoint installed packs no single role has >1 pack, so the row correctly **stays hidden** in normal use. 0-warning gate held.
- [x] **11** Category-vs-Packs — INVESTIGATED, NOT A BUG (2026-06-25). The merge engine (`categoryMerge.ts`) is real, correct, and unit-tested (15/15, incl. a 3-pack→one-"Forest" collapse). Live proof: rail shows "Volcanic Wastes"/"Basic Terrain" from raw folders `Hex Volcanic Wastes`/`Hex Basic Terrain Set` → noise-strip fired. The rail is category-driven, NOT one-row-per-pack. The "looks pack-shaped" impression is a **data coincidence**: the two installed packs (Hex Samples = terrain biomes; FCWallsDev1 = walls/paths only) have **disjoint** categories, so there's no cross-pack overlap to collapse under any single role. No re-import needed (categories populate fine from `tilesetOperations.ts:103` = first-level subfolder). **Minor real gap (optional):** the prod call site `TileAssetBrowser.tsx:857` pushes `{raw,pack}` and never sets `curated:true`, so the spec'd "Core pack seeds the canonical label" is dead in prod (works only in the unit test that passes `curated`); label falls to first-seen folder's `cleanLabel`. Wiring it needs a "which tileset is Core" notion in the data model. **Informs #10:** pack chips show raw folder names (`FCWallsDev1`) — a display-cleanup concern, not a merge bug.
- [x] **12** Rail mosaics — DONE & live-verified (2026-06-25). Root cause: the `requestThumbs` batching effect (`TileAssetBrowser.tsx:1025`) only collected paths from the grid's **virtual window** (+ all filtered tiles in compact), never the rail's 2×2 category previews — so rail mosaic tiles outside the grid window stayed blank until the category was opened (which rendered them into the grid). Fix: in the `!compact` branch, also push the first ≤4 tiles of each `groupedTiles` entry when `showRail`, and add `showRail`/`groupedTiles` to the effect deps (so depth switches re-request). `requestBatch` is idempotent (skips cached/pending) so grid+rail overlap dedupes. Verified: 16/28 rail cells filled before → **28/28 on fresh load, no click**.

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
