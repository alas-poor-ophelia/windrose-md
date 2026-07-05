# Windrose Performance Lag — Investigation Handoff

---

## SESSION 4 (2026-07-04) — ROOT CAUSE #2: per-input Preact reconciliation (the REAL remaining lag)

**Overturns the old "GPU-compositor" theory.** Live profiling (wrap CanvasRenderingContext2D ops + wrap requestAnimationFrame callbacks + PerformanceObserver longtasks + rAF frame-gap recorder; user drove `my-test-map` = 145 tiles/5 strokes) proved:
- **Canvas render is CHEAP:** longest single rAF (render) callback = **8ms**; ALL canvas ops ~300ms spread over a whole 15-20s session; canvas resizes cost 2ms total; `getImageData` was a one-time thumbnail artifact (0 on repeat).
- **The stalls are NON-rAF:** longtasks of **100-327ms** fire synchronously in the wheel/pointer INPUT handlers, not the render frame. Drawer open vs closed made no difference (rules out tile browser).
- **KEY TECHNIQUE:** wrap rAF callbacks — if rAF-max is tiny but longtasks are large, the cost is in event handlers, not rendering.

**Root cause (3 scouts, code-confirmed):** `viewState` (zoom/center) lives inside `mapData` (`useMapData.ts:21` useState). Every wheel/pointermove tick → `updateMapData` → `setMapData` (+`setPendingData`+`setSaveStatus`, 3 setStates, `useDebouncedSave.ts:83`) → synchronous Preact reconciliation of **17 unmemoized layer components** (all consume `useMapState()` whose context value churns) + the DungeonMapTracker anchor. The existing rAF coalescing (`useCanvasRenderer`) batches the DRAW, not the reconciliation. The static-layer cache excludes viewState — so these re-renders are entirely WASTED (canvas doesn't need React to show pan/zoom).

Contributors: `screenToGrid/screenToWorld/getClientCoords` not `useCallback`'d (defeat the `mapStateValue` memo); `theme`/`customColors`/`mapData`-spread rebuilt inline in DMT.

**The ineffective feather-blur "fix" (tileRenderer blurMaskFilterDownscaled) was REVERTED** — it targeted canvas cost, which isn't the bottleneck.

### VETTED FIX (Parallax adversarial + Meridian, cross-model converged): encapsulated ViewController
Hold live viewState OFF the React path; commit to mapData once per gesture end.

- **DONE:** `src/hooks/canvas/useViewController.ts` — the encapsulated controller (getLive/setLive/beginGesture/commitIfCurrent/cancelIfCurrent/syncCommitted/setRenderCallback), gesture-token-guarded.

### Remaining per-file steps (Meridian's decisive plan):
1. **useCanvasRenderer.ts** — add `viewController` param; in the render effect register `viewController.setRenderCallback(scheduleRender)`; in `renderCanvas` (~:437) read `viewController.getLive()` instead of `mapData.viewState` for the transform (thread through the `renderInputsRef` stash ~:986). Static-settle callback stays.
2. **useCanvasInteraction.ts** — add `viewController` param; replace every `mapData.viewState` read (lines ~125,177,225,264,269,281,337) with `getLive()`; in handleWheel/updatePan/updateTouchPan change `onViewStateChange(...)` → `setLive(...)`; **move `panStart` state → ref** (setPanStart per tick is a reconciliation trigger). Gesture lifecycle: startPan→`beginGesture()` (store id in ref); stopPan→`commitIfCurrent(id, getLive())` + add `pointercancel` + window `blur` handlers; WHEEL has no end → settle timer (ZOOM_SETTLE_MS=150) begins gesture on first tick, resets per tick, commits on settle-fire; touch pinch is its own gesture (wrap begin/commit; drop the touchPanStart/initialPinchDistance setState mirrors — refs already exist).
3. **usePanZoomCoordinator.ts** — add `viewController` to options, forward to inner `useCanvasInteraction`. `handleStoredViewStateChange` becomes the controller's commit sink only.
4. **MapCanvas.tsx (MapCanvasContent)** — `const vc = useViewController(mapData.viewState, onViewStateChange)`; pass `vc` to the DIRECT `useCanvasInteraction` (~:218), `useCanvasRenderer` (~:260), and into `usePanZoomCoordinator` (~:136). Add `useEffect([mapData.viewState])` → `vc.syncCommitted(mapData.viewState)`.
5. Types: `UsePanZoomCoordinatorOptions`, `UseCanvasInteractionResult` params, renderer params.

### Meridian's corrections to earlier assumptions:
- **Dual updatePan listeners are ALREADY deduped** (window handler bails `if (canvas.contains(e.target)) return`, `useEventCoordinator.ts:1044-1055`). LEAVE — it's the safety net for panning off-canvas. Do NOT dedupe.
- **`useCanvasInteraction` is instantiated TWICE** (in usePanZoomCoordinator for handlers, AND directly in MapCanvas ~:218 for screenToGrid/World used by tools). BOTH must get the controller or hit-testing reads committed state while canvas pans on the ref → the invisible regression.
- Overlay layers derive transform from mapData.viewState but only re-run on their own props — once viewState leaves the mapData prop path they naturally stop reconciling. Previews-during-pure-pan is not a real workflow; don't engineer for it.
- Coordinate-fn `useCallback` + collapse-the-triple-setState: DEFER to a secondary memoization/cleanup pass.

### Traps (Parallax) + verification:
- Stale reads (redirect ALL hot-path transforms). Ref/state desync (gesture token drops stale settle commits during undo/load/navigate). Lost gesture end (pointercancel/blur/unmount). Wheel/pan/pinch overlap. Coordinate drift (renderer + hit-testing share exact transform incl north rotation/DPR).
- **Most likely regression:** ONE missed `mapData.viewState` read in hit-testing → hover/drop offset during gesture (passes smoke test, invisible until a user reports wrong-cell drops).
- **Verify:** longtask profiler ~0 during driven gesture; assert NO setMapData mid-gesture; `console.count` on WallLayer stops firing during pan; `worldToScreen(screenToWorld(px,py))` round-trips within 1px on grid+hex, rotated+unrotated; pan→release→reload persists; test undo/navigate/fit-view during wheel-settle, pointercancel, blur.
- **If longtasks persist after step 4:** a SECOND per-tick setState in another hook (hover/selection) is firing — find it with DevTools "why did this render" on DMT, don't add refs blindly.

---


**Date:** 2026-06-09 (updated session 2, late night)
**Status:** Desktop fixed & measured. **iPad untested with Move 2** — needs user verification.
**Branch:** `standalone-conversion`

---

## SESSION 2 UPDATE (2026-06-10)

**Committed:**
- `db7ea444` — Move 1 (rAF coalescing) + Tier 1 (compact save), previously uncommitted
- `20a1a11f` — **Move 2**: viewport-cull cells/edges/borders/interior-lines (grid+hex, active+ghost+adjacent layers), gate `drawGrid` rotation padding on actual rotation (was 95 extra cells/side + 3x-length lines ALWAYS), clamp bounded hex maps to visible range (was drawing EVERY hex on the map per frame), dedupe the double `updatePan` (canvas + window mousemove both fired per event).

**Measured (desktop, 1,373-cell map, zoom ~1.6 pan): fillRects/frame 4,970 → 142.** Zero long-animation-frames in post-fix probes.

**The "what changed at 4-5pm" mystery — exhaustively ruled out on desktop:**
- Obsidian app update: asar mtime March 23 (log shows hourly "up to date" all day, app ran continuously through the window)
- Config/CSS/theme/snippets: nothing newer than Feb 2026
- Vault data: only ONE file changed 16:00–01:00 UTC (the backup this investigation created); cell counts are small (1,434 max)
- No GPU/crash entries in obsidian.log
- **Remaining candidates:** (a) iPad-side Obsidian mobile App Store update ~June 9 (check Settings → About on iPad + App Store update history), (b) transient desktop GPU-process degradation that the full quit cleared. The structural render cost was always there.

**Trap discovered:** `windrose_reload` MCP tool reported success but the app kept running the OLD main.js — burned a full probe cycle on "fix did nothing." Use explicit `app.plugins.disablePlugin('windrose-md')` + `enablePlugin` and verify via behavior probe (fillRect arg histogram shows which code version is drawing). Also: `windrose_get_state` snapshots can be stale/wrong (reported wrong dataFilePath + frozen viewState).

**Remaining levers if iPad is still bad after syncing this build:**
1. Cap canvas DPR on iPad (backing store may be 4-9x desktop pixels)
2. Offscreen static-layer cache (Move 3) — kills the remaining zoomed-out cost where all cells are genuinely visible
3. Batched Path2D instead of per-segment fillRect (verify the iOS stroke-corruption bug first)

---

## SESSION 2, PART 2 — ROOT CAUSE FOUND (`e2ef2c88`)

User reported zero improvement: 5-10s freeze per single interaction, whole-Obsidian
microstutters, and crucially **a new map with no image tiles was nearly fine**.

Instrumented ONE synthetic click on the heavy data: **1,242 getImageData calls
over 12+ seconds.** The tile-thumbnail pipeline (`thumbnailCache.ts`, merged with
the Tile Browser Redesign 2026-06-08) was the storm:
- TileAssetBrowser stays mounted while its drawer is collapsed (DrawerDock fold)
- Compact mode requests thumbnails for ALL filtered tiles (no virtualization)
- Vault has **2,271 tile images** vs `MAX_CACHE = 500` → each pass evicts its own
  entries → every re-render (= every interaction) re-reads + re-decodes +
  re-scans hundreds of images
- Each thumbnail did getImageData + toDataURL on a GPU-backed canvas — two
  compositor-stalling readbacks each. The GPU process is shared by ALL of
  Obsidian → whole-app freezes; iPad GPU = 5-10s per interaction

Fixes (commit `e2ef2c88`): MAX_CACHE 3000, `willReadFrequently: true` on all
scan canvases (software raster — full-library scan now ~70ms CPU total, zero
long tasks), `active` prop suspends requests while drawer collapsed.
**Verified: second interaction after fix = 0 getImageData, 0 long tasks.**

Why earlier conclusions misled: TWO overlapping problems. Pan probes measured
the render path (real, fixed by Moves 1-2) but never triggered the interaction
storm; the rollback test re-checked pan lag only, so "tile commits ruled out"
was wrong for the interaction freezes.

OPEN: what crossed the threshold at 4-5pm June 9 — likely a large DD pack
import pushed the tile library past the 500-entry cache (ask user). Also
consider: pace processQueue with requestIdleCallback; virtualize compact mode.

---

## SESSION 3 — TELEMETRY ERA (the real fixes)

Built `recordPerfTelemetry` (command: "Record performance telemetry (60s)") —
on-device instrumentation that writes a JSON report to the vault root.

**Finding 1 (desktop telemetry): save storm.** 119 one-MB full-file saves
during a single 6s pan (payload diff: only viewState.center changed). The
save-on-unmount effect in useDebouncedSave had pendingData in its deps, so its
cleanup fired an un-debounced save per pointermove (since 2026-05-23,
aa6b1bb5). Each save = main-thread stringify + write + a sync upload all
devices ingest. FIXED `59592c46` (unmount-only flush via ref): 0 saves during
pan, 1 trailing. Companion `17f142f4`: MarkdownRenderChild unmounts block
Preact trees on note close (were zombies until plugin unload; the storm had
masked the missing unmount flush). NOTE: user's "binary tileset" experiment
was actually sync-vs-no-sync (fresh test vault had no Obsidian Sync).

**Finding 2 (iPad telemetry): render-bound at 2-4 FPS.** 9,000-15,000
fillRects/frame, ~900ms per repaint, metronomic stalls; idle = clean 60fps.
Also: every 1MB data-file read/write costs ~900ms on iOS (vs ~10ms desktop)
— per-map file split is future work. Culling can't help a zoomed-out map.
FIXED `ed016584`: **static-layer cache** — static passes render once to a
50%-padded offscreen; pan = translation blit (exact; affine world→screen),
zoom = scale-blit + 150ms-debounced crisp settle re-render; rotation
bypasses. Key traps: getTheme() fresh object per call (key by JSON value);
tileImagesReady oscillates per render (excluded; imageCacheVersion counter
covers image loads). Measured: 4s pan 2,403,404 → 9,334 fillRects, 500 cache
hits / 5 re-renders. `window.__windroseStaticDbg` = temp hit/miss counter,
remove after iPad verification.

iPad verification pending. If good: remove debug counter, run full E2E,
consider BRAT preview release.

---

## Symptom

Windrose became "incredibly laggy / unusable" on **every map, every mode, both devices**, starting ~2026-06-09. Felt like it "worked perfectly hours ago" with no obvious code change.
- **Desktop (RTX 4080):** now *much* better after the fix below **+ a full Obsidian quit/reopen**, but still "a little choppy."
- **iPad:** still **completely broken**, even after a full app restart. This is the unsolved case.
- **Non-Windrose Obsidian (note scroll, tab switch) is fine** → the problem is Windrose's canvas rendering specifically, NOT Obsidian/Electron globally.
- Worst felt during **drag-pan**. Tool-activation lag was mild and is essentially gone.

---

## What we CHANGED (keep these — all uncommitted working-tree edits, already `npm run deploy`'d)

1. **`src/hooks/canvas/useCanvasRenderer.ts` — rAF-coalesced rendering (Move 1).**
   The render effect now stashes inputs in a ref and schedules ONE `requestAnimationFrame` instead of calling `renderCanvas` synchronously on every `mapData` change. Pan writes viewState→mapData on every pointermove, so previously the canvas fully repainted 140–410×/sec.
   **Measured effect: main-thread long tasks during a 6s pan dropped 198 → 1; median frame 8ms.** This is a real win — KEEP IT.

2. **`src/persistence/fileOperations.ts` — cheaper save (Tier 1).**
   `saveMapData` no longer pretty-prints (`JSON.stringify(allData)` not `(…, null, 2)`) and no longer re-parses the output to "validate." Was 3 full JSON passes over the whole multi-map file per save; now ~1. (Did NOT fix the lag — see ruled-out — but it's good hygiene; the data file dropped from 3.66MB→1.55MB, it was 57% indentation whitespace.)

3. **Data: stripped 145 tiles from `my-test-map`** to test the tile-saturation theory.
   Backup at `Garden/90 - Data/12 - Meta/JSON/dungeon-maps-data.BACKUP-2026-06-09T23-58-47.json`. (Did not fix lag.)

4. **OneDrive rule recorded** in `CLAUDE.md` Critical Rules + guild field note + project memory. (The vault path contains `OneDrive` but sync is OFF system-wide — NEVER blame OneDrive.)

---

## What we RULED OUT — and WHY

| # | Hypothesis | Why it's RULED OUT |
|---|---|---|
| 1 | **Recent tile-auto-detect / footprint commits (code regression)** | Built & deployed the commit *before* all tile work (`73a2c75c`). Lag persisted unchanged. The bad behavior exists in code that predates the suspected commits. |
| 2 | **Region-fill edge feathering (blur/createPattern per frame)** | User confirmed it shipped 2026-06-08 and the map was smooth after. Also the laggy map renders no region tiles. |
| 3 | **Per-tile draw math (`resolveTileRender`, footprint)** | Read the code: O(1) object literal + a few arithmetic ops per tile. Far too cheap. `my-test-map` had only 145 tiles (→ stripped to 0, no change). |
| 4 | **`getEntryMap` cache busting** | It's memoized by a tileset signature (`tileRenderer.ts:344`); confirmed cached. |
| 5 | **`saveMapData` JSON serialization (the Tier 1 target)** | Live `JSON.stringify` timing probe during pan caught **ZERO** stringify calls >20ms. Autosave is debounced and does not fire during continuous pan. The save was expensive but is NOT the interaction lag. |
| 6 | **Continuous render loop (canvas redrawing while idle)** | Probe during 48s of pure idle: **0 canvas ops, 0 clears, 0 long tasks.** Canvas only redraws on change. |
| 7 | **Tile-render saturation** | `my-test-map` = 145 tiles (11KB of a 652KB map). Stripping all tiles changed nothing. |
| 8 | **Ballooned tile-metadata file** | `windrose-tile-metadata.json` is 87KB / 354 entries. Tiny. |
| 9 | **Huge background / object / tile images (texture upload stalls)** | Audited every map's image refs vs disk size: biggest referenced image is 4MB. The 158MB/110MB PNGs in the images folder are **orphaned, unused**. `my-test-map` references **zero** images. |
| 10 | **GPU hardware-accel fell back to software** | WebGL renderer string = `ANGLE (NVIDIA RTX 4080 SUPER … D3D11)` — hardware accel ON, not SwiftShader/llvmpipe. |
| 11 | **Memory pressure** | JS heap 93MB / 4096MB (2%). No pressure. |
| 12 | **Obsidian/Electron global degradation** | User reports everything EXCEPT Windrose is fine. It's Windrose-canvas-specific. (Though a full *quit* did help desktop — see open questions.) |
| 13 | **OneDrive sync** | Sync is disabled system-wide. Never the cause. (Recorded permanently.) |

---

## What we CONFIRMED with measurement

- **Pan is render-bound, not JS-logic-bound.** Per-method canvas probe during 6s pan: **11.7M canvas ops, dominated by `fillRect` (8.46M)**, ~140–410 full canvas clears/sec (more than the display refresh).
- **Two structural faults in the render path (pre-existing, NOT recent regressions — git-confirmed no pan/render-trigger commits in the last 2 days):**
  - **(A) No rAF throttle on pan** — `updatePan` (`useCanvasInteraction.ts:274`) → `onViewStateChange` → `setMapData` → Preact re-render → `useCanvasRenderer.ts:655` effect → full `renderCanvas`, synchronously per pointer event. **FIXED by Move 1.** There are also **two** mousemove listeners both calling `updatePan` (`useEventCoordinator.ts:917` canvas + `:1013` window) — not yet addressed.
  - **(B) No viewport culling for cells** — `GridGeometry.drawCells` (`GridGeometry.ts:270`), `gridRenderer.renderCellBorders` (`:339`), `gridRenderer.renderInteriorGridLines` (`:196`) iterate **all painted cells regardless of visibility**, so `fillRect` count scales with TOTAL map cells, not visible area. Grid *lines* ARE culled (`getVisibleGridRange`); cells are NOT. **NOT yet fixed (this is "Move 2").**
- **After Move 1, the remaining desktop hitches have a bizarre signature:** Long Animation Frames API showed **1.4–2.0 second frames** during *focused, visible, active* pan with **`scripts:[]`, `blockingDuration:0`** (zero JS executed), render time 3–6ms. Confirmed focused (not tab-switch artifacts) via a `document.hasFocus()`-tagged probe: 70 focused hitches, worst 1982ms. → The main thread is **idle**; the stall is in the **GPU/compositor process**, below the page.

---

## Current leading theory for the REMAINING lag (esp. iPad)

The residual stalls are **GPU/compositor-bound**, with the main thread idle. The render issues a very high volume of `fillRect` commands (the grid/cell renderer draws borders + interior lines as individual `fillRect`s — a deliberate iOS/CodeMirror stroke-corruption workaround, see `gridRenderer.ts:1` header comment — for EVERY cell with no culling). On a strong GPU (RTX 4080) this mostly drains fast but periodically backs up into multi-second compositor stalls; **on a weak iPad GPU it never keeps up.**

**Why iPad is far worse — the prime untested lever:** iPad is **Retina, `devicePixelRatio` 2–3**, so its canvas backing store is **4–9× more pixels** than desktop's (desktop measured DPR=1, 922×1111≈1MP; iPad could be ~9MP). High-DPI × fillRect-heavy × no-culling × weak GPU = catastrophe. **We never measured the iPad's DPR or canvas size** — do that first next session.

---

## Recommended NEXT STEPS (priority order)

1. **Measure the iPad directly.** Get its `devicePixelRatio`, canvas backing-store size (`canvas.width/height`), and run the per-method canvas probe + LoAF probe (snippets below) during an iPad pan. Confirm whether iPad is (a) drowning in fillRect volume × high DPR, or (b) the same GPU-compositor stall as desktop, or (c) something iOS-canvas-specific.
2. **Implement Move 2 — viewport-cull cells.** Skip cells outside the visible range in `renderPaintedCells` / `renderCellBorders` / `renderInteriorGridLines`. Thread canvas dimensions in (the renderers currently only get `viewState`; `drawGrid` already receives `canvasDimensions` and culls via `getVisibleGridRange` — mirror that). This directly cuts per-frame `fillRect` count to visible-only and should help iPad most.
3. **Consider an offscreen static-layer cache.** The grid + painted cells are static during pan (only the viewport transform changes). Render them once to an offscreen canvas and blit with a transform during pan, redrawing only on actual content change. Eliminates the per-frame fillRect storm entirely. Bigger change; highest payoff for iPad.
4. **Cap canvas DPR on iPad.** If the iPad canvas is 9MP, clamping the backing store to e.g. DPR 1.5–2 (or a max pixel budget) trades a little sharpness for a huge raster cost reduction. Test impact.
5. **Reconsider the fillRect-for-stroke workaround.** Drawing grid/borders as individual `fillRect`s is expensive. If the iOS stroke-corruption bug it works around can be handled another way (batched `Path2D`, or stroking once), the op count drops dramatically. Verify the original bug still reproduces before removing.
6. **Remove the duplicate `window` mousemove `updatePan` listener** (`useEventCoordinator.ts:1013`) if redundant — it can double `setMapData` per event.

## Open questions
- **Why did a full desktop QUIT help** if it's pure render weight? Suggests there WAS a transient GPU-process component on desktop on top of the structural render cost. iPad restart did NOT help → iPad is the pure structural/hardware case.
- **What exactly stalls the compositor for 2s** with the main thread idle? Needs GPU-process profiling (Electron `--enable-gpu-benchmarking` / tracing), outside the page sandbox.

---

## Probe snippets (paste via windrose MCP `windrose_eval`, desktop)

**Per-method canvas probe (arm, then pan ~6s, then read):**
```js
// ARM:
var P=CanvasRenderingContext2D.prototype; window.__rp={by:{},clears:0,lt:[],t0:performance.now()};
['fillRect','clearRect','drawImage','stroke','fill','moveTo','lineTo','arc'].forEach(function(fn){if(P[fn]&&!P[fn].__rp){var o=P[fn];P[fn]=function(){window.__rp.by[fn]=(window.__rp.by[fn]||0)+1;if(fn==='clearRect')window.__rp.clears++;return o.apply(this,arguments)};P[fn].__rp=1;P[fn].__o=o}});
var po=new PerformanceObserver(function(l){l.getEntries().forEach(function(e){window.__rp.lt.push(Math.round(e.duration))})});po.observe({entryTypes:['longtask']});window.__rp.po=po;'armed';
// READ:
var r=window.__rp,el=Math.round(performance.now()-r.t0);JSON.stringify({elapsedMs:el,redrawsPerSec:Math.round(r.clears/(el/1000)),longtasks:r.lt.length,longtaskMs:r.lt.reduce((a,b)=>a+b,0),by:r.by});
// CLEANUP: ['fillRect','clearRect','drawImage','stroke','fill','moveTo','lineTo','arc'].forEach(f=>{if(P[f]&&P[f].__rp)P[f]=P[f].__o});window.__rp.po.disconnect();
```

**Long Animation Frame attribution (proves whether JS or GPU is the stall):**
```js
window.__loaf={frames:[]};var po=new PerformanceObserver(function(l){l.getEntries().forEach(function(e){if(e.duration>=50)window.__loaf.frames.push({dur:Math.round(e.duration),blocking:Math.round(e.blockingDuration||0),scripts:(e.scripts||[]).map(s=>({dur:Math.round(s.duration),name:s.name||s.invoker}))})})});po.observe({type:'long-animation-frame',buffered:true});'armed';
// READ: JSON.stringify(window.__loaf.frames.sort((a,b)=>b.dur-a.dur).slice(0,10));
```

**Environment check:**
```js
var c=document.createElement('canvas'),gl=c.getContext('webgl'),d=gl.getExtension('WEBGL_debug_renderer_info');
JSON.stringify({dpr:devicePixelRatio,renderer:d?gl.getParameter(d.UNMASKED_RENDERER_WEBGL):'?',mainCanvas:[...document.querySelectorAll('canvas')].map(x=>({w:x.width,h:x.height,mp:+(x.width*x.height/1e6).toFixed(1)}))});
```

---

## Files touched this session
- `src/hooks/canvas/useCanvasRenderer.ts` (Move 1 — rAF coalescing) — **uncommitted**
- `src/persistence/fileOperations.ts` (Tier 1 — compact save) — **uncommitted**
- `CLAUDE.md` (OneDrive rule) — **uncommitted**
- Data: `my-test-map` tiles stripped (backup exists) + file rewritten compact
