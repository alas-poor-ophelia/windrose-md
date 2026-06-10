# Windrose Performance Lag — Investigation Handoff

**Date:** 2026-06-09
**Status:** PARTIALLY FIXED (desktop much better after fix + restart; **iPad still completely broken**)
**Branch:** `standalone-conversion` (changes below are UNCOMMITTED in working tree + deployed to vault)

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
