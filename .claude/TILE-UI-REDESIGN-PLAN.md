# Tile Drawer · Layers · Toolbar — Redesign Implementation Plan

**Source:** `Windrose Tile Drawer + Tool UI design handoff.zip` (Claude Design, 2026-06-24)
**Handoff docs:** `README.md` + `IA - Data Model & Flow.md` (§0 supersedes all)
**Branch target:** new feature branch off `main` (NOT the eslint gate branch)

---

## 0. Reading of the brief & fidelity rules

The handoff redesigns **three connected surfaces** tied by one through-line: a **role hue**
(per-role color) consistent across the depth fan, the Layers panel, and the active context.

**Guildmaster's fidelity instructions:**
- **Follow faithfully:** all big purposeful changes & shifts (merge engine, Board→Strata→Layer,
  vertical ToolPalette, subtool ribbon, Tiles⇄Objects switch, render-form gating, Navigate-vs-Filter,
  hue threading, legible category rail).
- **Do NOT follow precisely:** text styles; header treatments that differ heavily from what we have;
  **overall drawer/sidebar behavior** (we keep the codebase's existing fold-to-spine drawer, resize,
  right-dock stacking — these already work and are exempt).
- **The ONE sidebar exception that IS in scope precisely:** the **new block-mode left icon rail**
  (42px rail → ~198px flyout for Layers/Colors/View).
- Call out anything where it's unclear whether a change is purposeful.

**Hard constraints baked into the handoff (non-negotiable):**
- `TileLayerRole = 'ground' | 'structure' | 'props' | 'decoration'`. UI labels `ground` as **"Terrain"**.
- `MapLayer[]` is **flat & ordered**. Board→Strata→Layer is a **projection**, never new nesting in data.
- `renderMode = 'cell' | 'region'` ONLY. "line/autotile/scatter" are **derived composite forms** —
  do NOT overload `renderMode`.
- **RCA constraint:** auto-classification predictions (`predictRenderMode`/`predictDepthTier`) must
  **NOT** be bulk-persisted onto an existing library (a prior incident silently re-rendered 304 tiles).
  Merge/normalize must respect review-before-apply.
- Organization UI (manual re-tag / merge-correction) is an **explicit STUB** this round — wire
  "Organize"/"Adjust" buttons to a stubbed entry point.

---

## 1. What already exists (gap baseline — confirmed by code scout)

| Surface | Already in codebase | File |
|---|---|---|
| Depth fan (horizontal + fan dropdown) | ✅ matches design closely | `DepthBar.tsx` (`DepthBar`) |
| Depth ribbon (vertical, collapsed) | ✅ | `DepthBar.tsx` (`DepthRibbon`) |
| Drawer fold-to-spine + resize | ✅ (exempt — keep as-is) | `DrawerDock.tsx` |
| Full + compact browser modes | ✅ | `TileAssetBrowser.tsx` |
| Organize mode (bulk tag/star/tier) | ✅ (broader stub target) | `TileAssetBrowser.tsx` |
| Virtualization, thumbnail pipeline | ✅ | `usePreactVirtualizer`, `useThumbnailPipeline` |
| Tag chips + AND filtering | ✅ | `TileAssetBrowser.tsx` |
| **Jump/category rail (`showRail`)** | ⚠️ **built but never wired on** | `TileAssetBrowser.tsx` |
| Starred/recent flyouts on spine | ✅ | `DrawerDock.tsx` |
| Loaded-brush footer | ✅ | `TileAssetBrowser.tsx` |
| depth/render-mode predictors | ✅ | `depthPredictor.ts`, `renderModePredictor.ts` |
| Right dock column (Layers/Colors/View) | ✅ (exempt — keep) | `DockPanel.tsx` + children |

**Net:** the Tile Drawer is largely landed. New work is concentrated below.

### What's genuinely missing (the real scope)
1. **Category normalization / cross-pack merge** — no normalization exists; category = raw folder path,
   disambiguated by `${ts.name} / ${cat}` only on collision, then truncated. (`tilesetOperations.ts:103`,
   `DungeondraftImportModal.ts:290`, `displayCategory()`).
2. **Subtool ribbon** (`.fd-subrib`, 46px) — Tiles/Objects tabs + Recent/Starred + tool subtools.
3. **Render-form facet + subtool gating** (derived form, form×tool matrix as data).
4. **Tiles⇄Objects switch** inside the drawer (today Objects = separate `ObjectSidebar`).
5. **Full-pane Filter drill-down screen** (block mode has it; full-pane lacks the equivalent).
6. **Board→Strata→Layer** projection in the Layers panel (today `DockLayerList` is a flat list;
   `MapLayer.tileRole` exists but is never read for grouping).
7. **Vertical ToolPalette** in full-pane (today horizontal in both modes).
8. **Block-mode 42px left icon rail** (today: floating left-panels absolutely positioned over canvas).
9. **Hue threading** (`--role-tint`) bidirectional between depth fan ⇄ Layers.

---

## 2. The merge engine (ported from `drawer/tile-data.jsx` — in scope)

3-stage normalize → cluster, **applied as a read-time projection** over existing
`TileEntry.category` + `pack` (respects RCA: no destructive rewrite of stored categories).

1. **Tokenize** `raw` folder: split parens, split camelCase, split on `[\/_\-\s&,]+`, lowercase,
   strip non-alpha.
2. **Strip NOISE:** `hex, hexes, hexagonal, square, squares, grid, gridded, tile, tiles, tileset,
   tilesets, set, sets, pack, packs, assets, art, the, and, of, a, an`.
3. **ALIAS** to canonical token: `flooring/floor→floors`; `plank(s)/boards/timber/wooden→wood`;
   `flagstone/cobble(s)/cobblestone→stone`; `cavern/cave(s)→caverns`; `wall→walls`;
   `door/portal(s)→doors`; `furnishing(s)→furniture`; `crate(s)/barrel(s)/basket/container→containers`;
   `river→rivers, coast→coasts, lake→lakes, water→rivers`.
4. **Fuzzy cluster** by **Sørensen–Dice on token sets, threshold 0.6** (greedy, declaration order,
   highest-score wins). **Core/curated pack seeds the canonical label.**

**API to recreate:** `groupsFor(role,{merge,packs})`, `mergeReport(role)` (provenance: per-folder
pack + exact/fuzzy score), `facetsForRole(role)`, `tileMatches(t,filters)`, `tileTags(t)`.

> Stale-comment trap: the doc says "Dice ≥ 0.5"; the code constant is **0.6**. Use 0.6.

---

## 3. Canonical role hues (resolve the palette conflict)

The prototype ships **two** palettes for the same four roles. Per README, **`DEPTHS` is canonical:**

| Role (schema) | UI label | Hue | Note |
|---|---|---|---|
| `ground` | **Terrain** | `#c4a57b` | gold — also the global UI accent |
| `structure` | Structure | `#7c93b8` | blue |
| `props` | Props | `#a98bdb` | **purple** (swapped off copper `#c08a6a` per Q1 — gold/copper read too samey) |
| `decoration` | Decoration | `#86b87c` | green |

**RESOLVED (Q1):** Terrain stays gold (it's the global accent); **Props moves to purple** (`#a98bdb`, the
`layer-panel.jsx` purple) to break the gold/copper similarity. Final set: gold · blue · purple · green.
Thread via a `--role-tint` CSS var set high in the tree from the active role; consume on the depth fan,
the Layers active row, and (future) the brush chip.

---

## 4. Phased plan (distinct, testable)

Ordering follows the handoff's own gating (merge → filter → form), expanded to cover Layers/Toolbar/rail.
Each phase ends green on `npm run check` + its named tests before the next begins.

### Phase 0 — Foundations: role hues + shared active-role state
- Centralize the 4 canonical hues (§3); emit `--role-tint` from active role high in the tree.
- Confirm `tileDepth` (`useTileBrush.ts`) is the single shared active-role source for fan + Layers.
- Decide visibility persistence (Q3): `hiddenLayers` is session-only today.
- **Test (unit):** hue mapping + role↔label mapping. **Visual:** `--role-tint` updates on role change.

### Phase 1 — Category normalization & cross-pack merge engine ⭐ headline
- Port the §2 engine to `src/assets/` (pure functions). **Unit-test heavily** with multi-pack fixtures.
- Wire `groupsFor(merge=true)` as a **read-time grouping** in `TileAssetBrowser` (no stored rewrite).
- For **new imports** only, optionally persist normalized `category` (gated, review-before-apply).
- `mergeReport(role)` feeds the banner (Phase 2).
- **Test (unit):** "Hex Forest" + "Forest Hex Tiles" + "Foliage/Forest" → one "Forest"; provenance correct.

### Phase 2 — Tile Drawer: legible category rail + merge banner (full-pane)
- **Wire `showRail=true`** at the call sites; feed merged categories. 128px rows: 2×2 mosaic + wrapping
  name (no truncation) + count. Header "Categories".
- **Merge banner (Option B):** when a merged category is opened → "Merged from N folders across M packs ·
  Adjust" (Adjust → Organize stub). Block: same banner in leaf view, no Adjust button.
- **Pack becomes a filter facet** (chips), not a rail row.
- **Test (e2e):** multi-pack vault → rail shows merged categories; banner on merged category.

### Phase 3 — Tile Drawer: Navigate-vs-Filter surface (full-pane)
- Full-pane **Filter drill-down screen** (Tags / Packs → searchable checkable lists → Done), sharing
  one filter state with the quick tag chips. (Block already has this — reuse the pattern.)
- Empty categories hide when filtered.
- **Test (e2e):** quick chip ⇄ filter screen share state; grid narrows; counts switch to matched/total.

### Phase 4 — Subtool ribbon + Tiles⇄Objects switch + Objects relocation ⭐
**RESOLVED (Q2/Q6): the existing left `ObjectSidebar` is REMOVED and folded into the right drawer as a
separate "Objects" mode. Its internal design/content stays unchanged — only its location moves.** This
turns the Objects pane from a placeholder into real, working content (the relocated `ObjectSidebar` body),
and frees the entire left edge for the block-mode rail (Phase 8).
- Build `.fd-subrib` (46px): **Tiles/Objects tabs** (top) · Recent/Starred · active tool's subtools
  (under "MODE" divider). Per-pane state retained.
- **Relocate `ObjectSidebar` content** into the drawer's Objects pane (object-set selector, search,
  collapsible category grid, 2-col icon grid) — reuse the component body; swap its host/layout chrome.
- Delete the `windrose-left-panels` / canvas-wrapper placement of `ObjectSidebar` and its collapse toggle.
- **Tool-driven switching:** Object tool → Objects pane; any tile-placement tool → Tiles pane
  (palette + ribbon stay in sync).
- **Block controls:** Tiles|Objects segmented control in open-drawer header + Tiles/Objects buttons on
  the collapsed `EdgeRibbon`.
- **Test (e2e):** add-object flow still works from the drawer Objects mode; switch retains each side's
  state; selecting Object tool flips pane. **Regression:** object placement unchanged on canvas.

### Phase 5 — Render-form facet + subtool gating ⚠️ riskiest (after data model concrete)
- **Derived form** per tile (cached): `renderMode` + `ddSourceType` + `freeform` + `autoTileConfig`
  → `{cell, region, line, autotile, scatter}`. **Never overload `renderMode`.**
- Model **form×tool matrix as DATA** (N×N, not hardcoded to 5).
- Ribbon lights only the subtools a selected tile's form supports (★ = default armed).
- **Form badge** on tiles (D5: user-visible). `line`/`autotile` may still *render* as `cell` until their
  renderers land; the browser + gating treat them as real.
- **Test (unit):** form classifier table. **(e2e):** region tile lights region subtools; cell lights cell.

### Phase 6 — Toolbar: vertical ToolPalette (full-pane only)
- Full-pane: `ToolPalette` → **54px left vertical bar**. Tools stacked; **blue corner triangle** flags
  tools with subtools; divider → global color chip; bottom → undo/redo. Active = gold border + glow.
- **Subtool flyouts open to the right** (today they open below).
- Relocate the color button (today JSX-spliced mid-list) to its vertical slot.
- **Block mode unchanged** (horizontal toolbar on top).
- Canvas keeps only zoom (+/−) + compass; other floats consolidate into the dock.
- **Test (e2e):** full-pane vertical palette; block horizontal intact; flyouts open rightward.

### Phase 7 — Layers: Board→Strata→Layer model (`LayersDock`)
**RESOLVED (Q5): real, working hierarchy via flat-data projection (see Q5 below).**
- Add `boardId` to `MapLayer`; add `boards` registry + `activeBoardId` to `MapData`; migrate existing
  layers to a default board.
- Render path filters layers by `activeBoardId` (only the active floor draws).
- **Layer** = `MapLayer`; **Stratum** = computed `(boardId, tileRole)` group; **Board** = computed
  `boardId` group (floor switcher: add/switch/delete/persist; new board seeds its own `DEFAULT_TILE_LAYERS`).
- Board creation/switch/delete + per-stratum "+ add layer" (creates a `MapLayer` with that board+role).

**Board-aware correctness guards (REQUIRED — from Parallax adversarial review).** The flat projection is
sound, but these existing sites assume ONE global layer list and corrupt/leak the moment a 2nd board exists.
Each must be fixed and unit-tested as part of Phase 7 (they live in `layerAccessor.ts` + render/history/save,
not just the panel UI):
> **Path correction:** Parallax cited `core/layerAccessor.ts` / `hooks/rendering/useCanvasRenderer.ts`; the
> real files are **`src/persistence/layerAccessor.ts`**, **`src/hooks/canvas/useCanvasRenderer.ts`**,
> **`src/hooks/state/useLayerHistory.ts`**. Treat the line numbers below as approximate (mixed source + built
> bundle) — re-confirm against the real files when Phase 7 begins.
- **C1 `removeLayer` last-layer guard** (`layerAccessor.ts:186`): guard on "last layer **on this board**",
  not global `layers.length`. Board-delete must remove all of a board's layers without the guard orphaning one.
- **C2 `reorderLayers`** (`layerAccessor.ts:266-296`): reassign `order` **within the board**, never globally.
- **C3 `getLayerBelow`** (`layerAccessor.ts:90-110`): the "show layer below" ghost must respect board bounds.
- **C4 static-layer cache key** (`useCanvasRenderer.ts:805-813`): add `activeBoardId` to the key (don't rely
  on `activeLayerId` always changing on board switch).
- **C5 undo/redo** (`useLayerHistory.ts:47-57`): snapshots capture no board context → undo can write a prior
  board's cell/curve/object data into the current board's active layer. Capture/scope board on snapshots.
- **M2 active state invariant:** enforce `activeLayerId` always belongs to `activeBoardId` (single setter that
  updates both; `getActiveLayer` fallback must not cross boards — `layerAccessor.ts:59`).
- **M1 export** (`exportOperations.ts`): board-unaware (renders active board only). Decide: export active
  board, or all boards composited. Document the choice.
- **M3 `hiddenLayers`** session-only + board-agnostic — retire in favor of per-layer `visible` (ties to Q3).
- **M4 sub-hex ghost render** (`useCanvasRenderer.ts:578-611`): filter `mapData.layers` by board.
- **M5 `addLayer`** (`layerAccessor.ts:157`): seed `order` from the board's max, not global max.
- **Blind spots:** (a) "delete board" loop must not hit the last-layer guard and orphan a layer with a dead
  `boardId`; (b) debounced save + mid-window board switch can persist a cross-board-inconsistent snapshot
  (`activeBoardId`≠`activeLayerId`'s board) — snapshot both atomically.
- **Migration:** `migrateToLayerSchema` assigns every existing layer a default `boardId`; Simple/non-tile
  maps still get one implicit board (don't surface it).
- Render config = **compact · flat · `active` role color** (rows neutral at rest; selected layer glows
  its role hue; stratum header carries a colored dot/icon). Keep only the **"overlay"** badge.
- Affordances: drag grip, name, overlay badge, per-layer + per-stratum eye, per-stratum "+", board
  switcher, "Add layer" footer.
- **Simple↔Strata toggle:** Simple = today's flat `MapLayer` list (no strata, no board hierarchy) for
  non-tile users; Strata = the full Board→Strata→Layer projection for tile maps. (Per Q5 — we drop the
  handoff's "flattened-but-marked" depiction; Simple is genuinely flat.)
- **Hue threading (bidirectional):** picking a stratum drives the depth fan + grid; picking a role on
  the fan lights the stratum — shared active-role state, same color.
- Replace `DockLayerList` content in the full-pane right dock (and reuse in the block flyout, Phase 8).
- **Test (e2e):** tile map shows strata; click stratum → sets active role + drawer depth; non-tile flat.

### Phase 8 — Block-mode left icon rail ⭐ HIGH PRIORITY (follow precisely)
- New **42px left icon rail**: Layers / Colors / View icons. **Default closed** (600×400 map stays usable).
- Tap an icon → **~198px flyout panel** over the left of the canvas (`left:42px; z-index:9;
  box-shadow:8px 0 26px`), dismissible toggle. **Overlays** the canvas — does not push it.
- Reuse `LayersDock` (Phase 7), `ColorPicker`, `DockViewPanel` inside flyouts.
- **Replaces** the old `windrose-left-panels` floating chip-list over the canvas.
- **RESOLVED (Q6):** the left edge is now clear — `ObjectSidebar` moved into the right drawer in Phase 4,
  so the rail owns the left edge outright (no coexistence conflict).
- **Test (e2e):** block mode shows rail; tap → flyout; tap again / outside → close.

### Phase 9 — Coherence pass + Organize stub wiring + regression
- Wire every "Organize"/"Adjust" pointer to a stubbed entry point (point at existing organize mode as
  the interim backstop; flag the broader merge-correction UI as a separate session — Q7).
- Reduced-motion handling (disable fan animation); persist view/tweak prefs.
- Full regression: `npm run test:unit` + `npm run test:e2e`.

---

## 5. Explicitly OUT of scope (per fidelity rules / handoff scope flags)
- Re-implementing drawer fold/collapse/resize or right-dock stacking (exempt "overall drawer behavior").
- Matching prototype text styles / header treatments that differ heavily from current.
- The **Organization UI** (manual re-tag / merge-correction) — stub only.
- The prototype **Tweaks panel** (`tweaks-panel.jsx`) — a prototype affordance, not a product surface.
- Older exploration files: `var1–5`, `intro`, `organize`, `smallblock`, `depth`, `depth-final`,
  `drawer-organize-mode.jsx`, `layers-tiles-options.jsx`, `switch-merge-options.jsx` (A/B already chosen).

---

## 6. Open questions

### ✅ Resolved by the Guildmaster
- **Q1 — Role palette:** Terrain gold · Structure blue · **Props purple** (`#a98bdb`) · Decoration green.
- **Q2 — Objects:** `ObjectSidebar` is **removed and folded into the right drawer** as an Objects mode;
  its internal design is unchanged, only its location moves. (Phase 4.)
- **Q6 — Rail vs sidebar geometry:** moot — Objects left the left edge, so the rail owns it. (Phase 8.)

### ✅ Q5 — Board/Strata/Layer model: RESOLVED (nested UX, flat data via projection)
**Goal (Guildmaster):** a real, working **Board → Strata → Layer** hierarchy — each floor (Board) has its
own strata; each stratum its own layers (e.g. Terrain = grass + stone); different floors carry independent
layer sets. The Guildmaster explicitly said the *data shape* matters less than the *behavior* being
faithfully represented in the UI/tooling: "if we can do this without a heavy refactor, I'm all ears."

**Decision: achieve the full nested experience over the EXISTING FLAT `MapLayer[]` via two grouping keys
(a projection) — NOT nested data entities.** This honors the handoff's hard "no nesting in data" constraint
and the RCA-hardened flat persistence path.

- Add **`boardId`** to `MapLayer` (it already carries `tileRole`). Add a `boards` registry + `activeBoardId`
  on `MapData`.
- **Layer** = a `MapLayer` ("grass", "stone").
- **Stratum** = computed group of layers sharing `(boardId, tileRole)`.
- **Board** = computed group of layers sharing `boardId` (a floor; add/switch/delete/persist).
- Only the **active board's** layers render (render path filters by `activeBoardId`).
- New board → new `boardId`, seeds its own `DEFAULT_TILE_LAYERS` (its own 4 strata).

**Verified the flat projection covers every operation:** add/reorder/delete layers (`order`); move a layer
between strata (change `tileRole`); move between floors (change `boardId`); empty strata shown as
"add a layer" placeholders; per-floor fog/objects/cells (they already live on each layer); undo/redo
(boardId is just a field). Nothing in the goal requires nesting tiles/cells under sub-layer entities.

**Blast radius:** moderate & localized — (1) two schema fields + boards registry, (2) render filter by
`activeBoardId`, (3) layers-panel projection (group by board → role → layers), (4) migration assigning
existing layers to a single default board. **Parallax adversarial review: PASSED — decision holds, no
worsened persistence risk — but surfaced required board-aware guards (see Phase 7's "correctness guards").**

### Simple mode — RESOLVED
Simple mode = **the flat `MapLayer` list exactly as the layers menu works today** (one row per layer, no
strata grouping, single implicit board) — for non-tile users who don't want the hierarchy clutter. Drop
the strata marks the handoff drew in its flattened view. Tile maps get the full Board→Strata→Layer
projection; non-tile maps get the flat list.

### ✅ Smaller calls (accepted as recommended)
- **Q3 — Visibility persistence:** today per-role `hiddenLayers` is session-only (`useTileBrush`); per-layer
  `visible` already persists. *Recommend: derive **stratum** visibility from member layers' persisted
  `visible` (stratum-eye toggles all members) and retire the session-only `hiddenLayers` — so all
  visibility persists.* (Verify the tile renderer reads `layer.visible`.)
- **Q4 — Merge persistence:** *Recommend: merge is a **read-time projection** over existing `category`+`pack`
  (RCA-safe), persisting normalized `category` **only for new imports** under review-before-apply.*
- **Q7 — "Adjust"/"Organize" target:** *Recommend: point "Adjust" at the existing organize mode as the
  interim backstop; the broader merge-correction Organize is a separate session.*
- **Q8 — Subtool ownership:** *Recommend: tile-placement subtools move to the drawer ribbon; non-tile tool
  flyouts (select/draw/fill/erase/region) stay in `ToolPalette`.*

---

## 7. Suggested sequencing & risk

- **Do first (high value, low risk, mostly pure functions):** Phase 0–1 (hues + merge engine, unit-tested).
- **Then visible payoff:** Phase 2–3 (rail + banner + filter) — wires existing-but-dormant UI.
- **Then the new structural pieces:** Phase 4 (ribbon/switch), Phase 7 (strata), Phase 8 (block rail).
- **Riskiest last on data:** Phase 5 (form gating) after the data model is concrete.
- **Toolbar (Phase 6)** is independent and can slot in any time after Phase 0.
- **Cross-cutting risk:** Q2/Q6 (Objects + left-edge geometry) touch real, working systems — resolve those
  product calls before Phase 4 and Phase 8 respectively.

---

## 8b. Phase 4a — ready-to-execute spec (Objects fold-in, fully scoped)
Architecture decided: lift a `tilePane` state in `DungeonMapTracker`; pass the `DrawerDock` a wrapper
(NO DrawerDock API change — it renders `{children}` directly into `.windrose-tile-panel-layer`, DrawerDock.tsx:343)
holding a Tiles/Objects toggle + the active pane. `ObjectSidebar` mounts inside the drawer (both modes); its
single left-edge mount is removed. All `ObjectSidebar` props are already in render scope.

**Edits (in `src/DungeonMapTracker.tsx` unless noted):**
1. After the `useToolState` destructure (ends line ~138) add:
   - `const [tilePane, setTilePane] = useState<'tiles'|'objects'>('tiles');`
   - `selectPane(p)`: `setTilePane(p); setCurrentTool(p === 'objects' ? 'addObject' : 'tilePaint');` (the
     forced `tilePaint` on Tiles-tab avoids ping-pong with the coupling effect; record "remember last tile tool" as a tweak).
   - coupling effect: `useEffect(() => { if (currentTool === 'addObject') setTilePane('objects'); }, [currentTool]);`
   - `renderPaneTabs()` → `<div className="windrose-drawer-panetabs">` with two `<button>`s calling `selectPane`.
   - `renderObjectsPane()` → the `<ObjectSidebar .../>` element (copy props from the old mount, but use
     `isCollapsed={false}`, `onCollapseChange={() => {}}`, and `mapData?.` optional chaining). Functions defer
     name resolution, so referencing later-declared `handleObjectSetChange` is safe (no TDZ — H-787 is dep-arrays only).
2. Remove the left `<ObjectSidebar .../>` mount (DungeonMapTracker.tsx ~731–742). **Watch:** `handleSidebarCollapseChange`
   may become unused → `no-unused-vars` gate failure; check and remove/repurpose if so.
3. Wrap BOTH `DrawerDock` children (block site ~983, full-pane site ~1212 — distinguish by indentation, 14 vs 18 spaces):
   `<div className="windrose-drawer-pane">{renderPaneTabs()}{tilePane === 'objects' ? renderObjectsPane() : (<TileAssetBrowser .../>)}</div>`
   (Leave the floating `TileAssetBrowser` at ~1157 tiles-only — record.)
4. SCSS (`scss/_tile-drawer.scss` or `_tile-browser.scss`): `.windrose-drawer-pane{display:flex;flex-direction:column;height:100%}`
   and `.windrose-drawer-panetabs` segmented control (two buttons, `.on` = gold). Mind the Obsidian button-height gotcha (`height:auto`).
**Verify:** null-scan, tsc, eslint `--max-warnings 0`, build:css; then DEPLOY + reload `windrose-md` via eval and
confirm in the running app: Objects tab shows the object grid, **object placement on canvas still works**, Tiles tab unchanged.
**4b (next):** subtool ribbon styling (Recent/Starred + tool subtools), Tiles/Objects on the collapsed spine, ObjectSidebar
visual fit inside the wider drawer. **Phase 8 unblocked:** left edge is now clear for the block rail.

---

## 8. Deferred / revisit (recorded during the build — easy to tweak later)
- **Phase 4b/5 — ribbon geometry:** built as a HORIZONTAL strip under the panetabs, not the prototype's
  46px vertical `.fd-subrib`. Function (form badge + gated subtools) is full-pane live-verified; the vertical
  geometry is visual polish (fidelity rules exempt heavy header/text treatments). (Phase 4b)
- **Phase 4b/5 — subtool behavior wiring DEFERRED:** ribbon subtool selection is display/arming state only.
  The line/autotile/scatter placement renderers don't exist yet, so an armed subtool does NOT change placement
  behavior. Wiring `scatter`→`stampMode` (the one available real behavior) was intentionally NOT done to avoid
  dual-control conflict with the browser's own stamp toggle. (Phase 5)
- **Phase 5 — classifier limits (confirmed by scout):** `scatter` has NO per-tile signal (it's a brush mode),
  so `deriveTileForm` never returns it — it exists only in the matrix/ribbon. `autotile` requires
  `tileset.autoTileConfig`, which is reserved/unused, so it's effectively inert today. Real signals are
  `line` (ddSourceType walls/paths/portals), `region` (renderMode), `cell` (default). (Phase 5)
- **Phase 4b — NOT done (remaining 4b polish):** Tiles/Objects buttons on the collapsed EdgeRibbon spine;
  ObjectSidebar visual fit inside the wider drawer (its header "Hide" button is now a dead no-op since
  onCollapseChange is a stub). Recent/Starred already exist as spine flyouts. (Phase 4b)
- **Phase 5 — per-tile form badge in the GRID:** the badge currently shows only in the ribbon for the selected
  tile. The design's D5 per-tile form badge on every grid thumbnail is not yet applied. (Phase 5)

- **Phase 8 — block-mode live verification GAP (important):** EdgeRail compiles + passes the gate but was
  NOT visually confirmed in-app. This vault renders maps ONLY via the legacy datacore path
  (`datacorejsx` → `compiled-dungeon-map-tracker`); there are zero real `windrose-map` code-block notes, and a
  synthetic one does not render in reading OR live-preview here (the standalone code-block processor produces no
  output for it — an Obsidian post-processor quirk, independent of our code since the processor is unchanged).
  The rail is block-only (`!fullPane`) and the full-pane view never shows it, so it can't be exercised via the
  windrose-map-view either. Confidence rests on: clean tsc/eslint and reuse of the SAME DockLayerList/ColorPicker/
  DockViewPanel already verified in the full-pane dock. **TODO:** verify once a real block map renders (e.g.
  migrate a scratch note to a `windrose-map` block, or fix reading-mode render of fresh notes). (Phase 8)
- **Phase 8 — Regions as a 4th rail icon (hex only):** deviation from the strict "Layers/Colors/View" — added
  Regions to preserve the region-panel access that `windrose-left-panels` provided for hex maps. (Phase 8)
- **Phase 8 — MapControls toggles repurposed:** the canvas MapControls Layers/Regions buttons now drive the
  rail's controlled `openId` (retired the `showLayerPanel`/`showRegionPanel` UI state). Old `.windrose-left-panels`
  SCSS rules left in place (dead, harmless) — cleanup optional. (Phase 8)

- **Phase 6 — subtool flyout direction:** the plan said "today they open below"; the live `.windrose-subtool-menu`
  already uses `left:100%; top:50%` (opens RIGHT). No change made — already matches the design. Minor: in the
  vertical bar a rightward flyout could clip near the container's left padding; not observed, revisit if it does. (Phase 6)
- **Phase 6 — color chip behavior:** full-pane keeps the existing popout-to-floating-ColorPicker (`onColorBtnPopout`);
  the vertical slot just RELOCATES the button below a divider. Inline picker in the bar was not added (design didn't
  mandate it). (Phase 6)
- **Phase 6 — vertical bar positioning:** implemented by floating `.windrose-full-pane .windrose-toolbar-anchor`
  `position:absolute; left:10px; top:50%` over the canvas (NOT a flex column in the layout — avoids a JSX row
  restructure). Robust for 600px+ panes; on a very short canvas the ~684px tall bar could exceed canvas height.
  Revisit with a flex-row wrapper if short-canvas clipping shows up. (Phase 6)


- **Curated-pack marker** — no tileset is flagged "Core/curated", so merge label-seeding is first-wins.
  Designate a curated pack to get preferential canonical labels. (Phase 1/2)
- **Role-scoped browsing** — the browser shows all tiles regardless of `tileDepth` (placement target only);
  merge runs globally as pure dedup. The design's Role→Category scoping is a separate change. (Phase 2)
- **Compact-mode merge banner** — block/compact uses `openCat` (not `railSel`); the banner is full-mode only.
  Wire a compact equivalent in the leaf view (no Adjust button). (Phase 2)
- **Rail mosaic legibility** — the rail lists clean labels + counts; the design's 2×2 mosaic thumb + wrapping
  multi-line name is a visual polish not yet applied. (Phase 2)
- **Full-pane Filter drill-down screen** — quick tag/pack chips cover the common case; the power-user
  push/pop screen (type-to-find over large tag/pack lists, Done) is additive over the same filter state. (Phase 3)

---

## 9. NEXT SESSION — Phase 7 entry point (Board → Strata → Layer)

**Status as of this session:** Phases 0–6 + 8 SHIPPED on `feature/tile-ui-redesign`
(0–3 prior; 4a `49c6ed72`, 6 `20b69c20`, 8 `c467750a`, 4b+5 `f1584a7f`, plan `0eee5063`).
Unit suite 1477/1477 green. Only Phase 7 + Phase 9 remain.

**Why Phase 7 is its own session:** it is the heaviest + RCA-sensitive phase — schema fields +
a persistence migration + render/history/export rewires behind 10 board-aware guards. A prior
incident silently re-rendered 304 tiles. **Hard Rule #4 applies: run Parallax adversarial review
FIRST, pass findings to Meridian, THEN implement the guards.**

**Start-here checklist (all detail already in §4 Phase 7, §6 Q5, and the guards C1–C5/M1–M5):**
1. Confirm branch contains `src/` (ground truth: `git ls-tree feature/tile-ui-redesign --name-only | grep '^src$'`).
2. Re-confirm the guard line numbers against the REAL files (they drift): `src/persistence/layerAccessor.ts`,
   `src/hooks/canvas/useCanvasRenderer.ts`, `src/hooks/state/useLayerHistory.ts`, `src/persistence/exportOperations.ts`.
3. Parallax adversarial review of the flat-projection plan + the 10 guards BEFORE writing code.
4. Schema: add `boardId` to `MapLayer`; `boards` registry + `activeBoardId` to `MapData`; migration in
   `migrateToLayerSchema` assigns every existing layer a default board (Simple/non-tile maps get one implicit board).
5. Implement guards C1–C5 + M1–M5 (each unit-tested) — do NOT skip; they corrupt/leak the moment a 2nd board exists.
6. LayersDock projection (Board→Strata→Layer) + Simple↔Strata toggle + bidirectional hue threading.
7. Decide M1 export semantics (active board vs all-boards composite) and DOCUMENT it.

**Phase 9 (after 7):** Organize/Adjust stub wiring, reduced-motion (disable fan animation), persist view prefs,
full `npm run test:unit` + `npm run test:e2e` regression. Also fold the EdgeRail's Layers flyout onto the new
LayersDock once it lands, and re-verify the Phase 8 block rail once a real `windrose-map` block render is available.
