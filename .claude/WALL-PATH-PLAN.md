# Wall & Path Tiles — Implementation Plan

**Status:** Draft for Guildmaster review (2026-06-12)
**Goal:** Dungeondraft-style wall/path tiles: textures swept along user-drawn polylines whose segments can be bent into curves, with first-class editing UX on kb/m and touch, in both map-block and full-pane views.

---

## 1. Research Summary (what we verified)

### 1.1 Dungeondraft's actual model (from Modding API + docs + raw pack inspection)

- **Walls are polylines with optional per-segment quadratic arcs.** Each vertex is an
  `ArcVector2`: `Position`, optional `ArcPoint` (ONE quadratic bezier control point for
  the segment), `HasArcPoint` bool. No cubic beziers, no tangent handle pairs.
- Draw flow: click-to-place vertices; **Shift+click** starts an arc — mouse movement bends
  the segment before the next click confirms. Dedicated **Edit Points** mode afterward:
  drag vertices, click segment to insert vertex, Delete to remove vertex/segment.
- Walls auto-close into loops when the last point meets the first (`Wall.Loop`).
- Per-wall options: texture, color tint, shadow toggle, joint style (sharp/bevel/round),
  `NormalizeUV` (uniform texture tiling vs stretch).
- **Paths are a different system in DD**: raw points + global `Smoothness` float (0–1,
  spline smoothing at render time), width slider, taper/fade transitions. NOT editable
  after placement (a known DD pain point — we can do better).
- Pack format: `textures/walls/*.png` strips + `*_end.png` caps + `data/walls/*.dungeondraft_wall`
  JSON sidecars (`{"path": ..., "color": ...}`). `textures/paths/*.png` strips, no sidecar.
- Texture conventions: horizontal strips, tile seamlessly left-to-right, 256px = 1 grid
  square, ≥1px transparent top/bottom gutter. DD generates light-occlusion from the
  vertical midpoint of the strip.

### 1.2 Raw artifact evidence (Fantasy Core Raw v0.15.0, decoded pixels)

| Asset | Size | Notes |
|---|---|---|
| `Walls/Wall_Glass_01_a.webp` | 1500×29 | thin wall strip |
| `Walls/Wall_Glass_01_a_end.webp` | 8×28 | end cap, matches strip height |
| `Walls/Metal_Bars_01_a.webp` | 1500×58 | repeating diamond finials |
| `Paths/Bridge_Stone_01_a.webp` | 1200×464 | wide path; structural posts must tile seamlessly |
| `Paths/Bunting_01_a.webp` | 3000×109 | decorative path |

Variant letters (`_a`–`_f`) are color/style variants (community convention, not DD-required).
Top-level raw pack dirs: `Lights/ Objects/ Paths/ Patterns/ Portals/ Terrain/ Walls/`.

### 1.3 Windrose code survey (file:line verified 2026-06-12)

- **Curve type** (`types/core/curve.types.ts:31-53`): `start + BezierSegment[]` (cubic),
  anchors implicit (anchor N = `segments[N-1][4..5]`). Schneider-fitted from freehand
  (`src/geometry/curves/curveFitting.ts`). **Resists hand-editing** — no explicit anchor
  or handle identity. Verdict: do NOT extend; build a parallel type.
- **Outline tool** (`src/hooks/interactions/useOutlineTools.ts`): the working precedent
  for vertex-drag UX — explicit `vertices: Point[]`, hit radius `hexSize*0.4`,
  pointer-down/move/up drag, double-click commit, overlay-canvas handles
  (`OutlineLayer.tsx:289-308`). Hex-only, straight-only, stored outside layers.
  **Hazard:** commits a history entry EVERY drag frame (`useOutlineTools.ts:216`) — do not copy.
- **Correct undo pattern** (`useObjectDragSelect.ts:399,450`): `onChange(staged, /*suppress*/true)`
  during drag, `onChange(final, false)` on release = one undo entry per gesture.
- **Renderers**: `curveRenderer.ts` (Path2D + WeakMap cache, world-space under
  translate/scale), `tileRenderer.ts:379` (stamp + region/worldRepeat modes). A wall
  renderer plugs in beside these in `useCanvasRenderer.ts` z-order (~line 662-683);
  static-layer cache keys on layer reference — streaming drag updates bust it correctly.
- **Input**: split MouseEvent/TouchEvent (NO PointerEvent API), central dispatch in
  `useEventCoordinator.ts:910-941`; two-finger = pan/zoom always (line 112-142) with
  300ms multi-touch cooldown; synthetic-mouse-after-touch suppression (500ms); double-tap
  detector synthesizing dblclick (line 891); long-press = context menu only. No angle
  snapping exists anywhere yet.
- **View modes**: map block (markdown code block) vs full pane (`WindroseMapView.ts`,
  `fullPane` prop). Shared persisted viewState. `windrose-floating-bar` (the tool options
  strip precedent, `OutlineLayer.tsx:321-467`) is `position: fixed` — viewport-anchored,
  acceptable per existing tools but note for block mode.
- **Tool registration**: add literal to `ToolId` (`types/tools/tool.types.ts:17-52`),
  ToolPalette entry, new layer component with `registerHandlers('wall', proxy)`, one
  dispatch branch in `useEventCoordinator.ts:263+`.

### 1.4 UX research (external survey)

- **Curve creation models ranked for our constraints** (kb/m + touch parity, small viewport,
  cartographer users): (1) midpoint-drag "bow the segment" (Figma Bend, Affinity segment-drag);
  (2) 3-click arc (Cities: Skylines Simple Curve); (3) auto-smooth through points
  (Illustrator Curvature, Wonderdraft); (4) classic bezier handles — rejected: steep
  learning curve, poor touch story, overkill for walls.
- **Finish conventions**: Escape=cancel, double-click=finish, Enter=commit, click-first-point=
  close loop, persistent **Done button for touch** (universal in iPad vector apps).
- **Touch**: 44px minimum hit targets (visual dot can stay small); two-finger always =
  navigate (Affinity model — matches our existing two-finger pan); two-finger tap = undo
  (iOS standard, optional); modifier keys become toolbar toggles.
- **Small viewport**: handles constant screen-pixel size regardless of zoom; progressive
  disclosure (low zoom = line only, mid = vertices, high = vertices + bow handles);
  nodes hidden unless the path is in edit mode (universal pattern).
- **Editing entry**: double-click/double-tap the placed wall → edit mode with handles;
  double-click a segment → insert vertex (Tiled/Inkscape standard).

---

## 2. Design Decisions

### D1. Data model: new `WallPath` type, DD-compatible quadratic arcs

```ts
// types/core/wallpath.types.ts
type WallPathId = string;                       // "wall-{ts}-{rand}"

interface WallVertex {
  x: number;                                    // world coords
  y: number;
  arc?: [number, number];                       // quadratic control point for the
                                                // segment LEAVING this vertex (DD ArcVector2 model)
}

interface WallPath {
  id: WallPathId;
  vertices: WallVertex[];                       // explicit, editable anchors
  closed: boolean;                              // loop
  assetRef: { tilesetId: string; tileId: string }; // wall/path strip asset
  kind: 'wall' | 'path';                        // affects defaults, not structure
  widthScale: number;                           // 1.0 = native strip height in world units
  tint?: string;                                // multiply color (DD wall color)
  flip: boolean;                                // reverse texture direction
  // joint: 'sharp' | 'bevel' | 'round'         // DEFERRED — overlap looks fine initially
}
```

Rationale: explicit vertices = trivially editable (Outline precedent); one optional arc
point per segment = exactly DD's model, exactly the "bow the segment" UX, and converts
1:1 if we ever import DD maps. Unifies walls and paths under one structure (unlike DD,
ours stay editable after placement — a deliberate improvement).

Storage: `layer.wallPaths: WallPath[]` (per-layer, like curves/tiles). Add to
`LayerHistorySnapshot`, `fileOperations.ts` migration block (init `[]`), save queue
unchanged.

### D2. Rendering: arc-length texture sweep with straight-segment fast path

New `src/geometry/renderers/wallPathRenderer.ts`, called from `useCanvasRenderer.ts`
between curves and tiles (walls sit above terrain, below objects — confirm during build).

- **Straight segments** (the common case): tile the strip with repeated `drawImage`
  along the segment under a single rotate transform. Cheap.
- **Curved segments**: flatten quadratic to polyline at zoom-appropriate tolerance,
  walk arc length, draw vertical slices of the strip (slice width ~4-8 world px)
  each under its own tangent transform. Standard texture-sweep technique.
- **End caps**: `_end` texture drawn at open termini, rotated to tangent.
- **Joints**: naive overlap at vertices initially (DD's "sharp"). Bevel/round deferred.
- **Texture policy (H-531 lesson — bound user-image cost):** strip sources downscaled
  to a capped resolution and cached per (assetId, zoom bucket) offscreen canvas at load,
  never per frame. Walls render into the existing static-layer cache; only the
  in-progress wall draws on the overlay canvas per frame.
- Per-wall `Path2D` centerline cached in WeakMap (curveRenderer pattern) for hit-testing
  and selection highlight.

### D3. Interaction model (the UX core)

**Creation — click-click polyline + bow-to-curve:**
1. Select Wall tool → pick wall/path asset (browser drawer, see D5).
2. Click/tap places vertices; rubber-band preview from last vertex to cursor (overlay canvas).
3. **Curve while drawing:** after placing a vertex, press-drag on the just-placed rubber
   segment's midpoint diamond to bow it (sets `arc`). Also: **Shift+click** places the next
   point in DD arc mode (bend with mouse move, click to confirm) for DD muscle-memory.
4. **Finish:** double-click/double-tap places final vertex + commits; **Enter** commits;
   **Escape** cancels; **click first vertex** closes the loop. Touch: persistent
   **Done / Cancel buttons** on the floating bar (always visible while drawing).
5. Backspace while drawing removes the last placed vertex (DD convention).

**Editing — enter edit mode on the placed wall:**
1. With Wall tool active, click/tap a wall (centerline hit test, ≥44 screen px corridor)
   → selected, handles appear: square vertices + diamond midpoint bow-handles per segment.
2. Drag vertex = move. Drag midpoint diamond = bow/re-bow segment (drag back to
   straighten — snap arc to null when within ε of the chord).
3. Double-click/double-tap a segment = insert vertex there. Hover/select vertex +
   Delete = remove vertex. Delete with whole wall selected (no vertex) = delete wall.
4. All drags use **suppress-then-commit** (one undo entry per gesture).
5. Escape / click empty space = deselect.

**Touch specifics:**
- Two-finger = pan/zoom always (already in coordinator); single-finger on handle = drag;
  single-finger elsewhere while drawing = place vertex.
- Handle hit targets ≥44 screen px regardless of visual size (~8-10 screen px dots,
  constant screen-space size — divide by zoom when drawing in world space).
- Reuse existing double-tap detector and synthetic-mouse suppression.
- Floating bar gains: Done, Cancel, Undo-point, straight/arc mode toggle (the touch
  stand-in for Shift), snap toggle.

**Snapping:**
- Grid snap toggle (vertices snap to cell corners/centers; hex maps to hex vertices/centers).
- **Shift = 45° angle snap** while placing/dragging (new — nothing exists today; keep the
  ref-based modifier pattern from `useObjectDragSelect`). Toolbar toggle mirrors it for touch.

**Small viewport / progressive disclosure:**
- Zoom < ~0.3: selected wall shows centerline highlight only ("zoom to edit" hint in
  floating bar). Mid zoom: vertices only. Higher zoom: vertices + bow diamonds.
- Floating bar is the option surface in both view modes (fixed-position caveat accepted —
  consistent with outline/region tools). Apply CornerBrackets `compact` variant
  (per project memory: transient UI gets corner brackets — first adopter).

### D4. What we deliberately defer

- Light occlusion / shadows (no lighting system in Windrose; fog-of-war is separate).
- Portals/doors anchored to walls (DD feature; future phase once walls land).
- Joint styles (bevel/round), `NormalizeUV`-style stretch mode, taper/fade path transitions.
- DD map import of placed walls (format documented in research; nice-to-have later).
- Freehand-draw-then-fit wall creation (could reuse curveFitting later).

### D5. Asset pipeline

Wall/path strips arrive via the existing Dungeondraft pack importer
(`project_dungeondraft_import`, commit dd5a693d) which currently targets object/tile
textures. Extend:
- Parse `textures/walls/` + `data/walls/*.dungeondraft_wall` + `textures/paths/` from
  PCK and raw-directory packs; pair `_end` caps with strips; group variant letters.
- Store as a wall-asset category on the tileset (new `assetKind: 'wallStrip' | 'pathStrip'`
  rows with strip metadata: native px height, end-cap ref, default tint).
- Browser: a Walls/Paths section in the existing tile browser drawer (Tile Browser
  Redesign phases 1-10 give us DepthBar/drawer infra); selecting one arms the Wall tool.

---

## 3. Phases

### Phase 0 — Asset pipeline (hard prerequisite: no built-in assets ship — Q2 ruling)
- Importer: extract walls/paths strips + sidecars + end caps from DD packs (PCK + raw dirs).
- Tileset model: `wallStrips`/`pathStrips` entries with metadata.
- Browser drawer section; selection arms the (not-yet-existing) tool — feature-flag display.
- Empty-state UX: Walls section with no assets explains how to import a pack.
- Test fixture: small self-authored strip in tests/fixtures/test-vault (test-only, not shipped).
- Unit tests: sidecar parsing, end-cap pairing, variant grouping.

### Phase 1 — Data model + persistence
- `types/core/wallpath.types.ts`; `layer.wallPaths` init/migration in `fileOperations.ts`;
  `LayerHistorySnapshot` field; `createLayerDataHandler('wallPaths')` in `useDataHandlers`.
- Unit tests: round-trip persistence, migration, history snapshots.

### Phase 2 — Renderer (straight walls first)
- `wallPathRenderer.ts`: straight-segment tiling, end caps, widthScale, tint, flip;
  downscale+cache strip sources; static-layer integration; z-order slot.
- Quadratic flatten + arc-length sweep for curved segments (can land mid-phase).
- Drive with hand-authored fixture data before any tool exists (dev-loop + windrose_eval).
- Unit tests: arc-length math, flatten tolerance, transform math (pure functions).

### Phase 3 — Creation tool (straight polylines)
- `ToolId` 'wall', ToolPalette entry, `WallLayer.tsx` (overlay canvas, registerHandlers),
  coordinator dispatch branch.
- Click/tap placement, rubber-band preview, finish gestures (dblclick/Enter/Escape/
  close-loop/Done button), Backspace-undo-point, grid snap.
- Floating bar v1 (Done/Cancel/snap toggle) with CornerBrackets.
- E2E: place wall kb/m, finish gestures, persistence after reload.

### Phase 4 — Curves
- **Design revision (build-time):** unified place-and-drag-to-bow replaces Shift+click
  arc mode. Pointerdown places the vertex; dragging >threshold before release bows the
  new segment through the drag point (quadratic arc passes through cursor at t=0.5,
  C = 2M − (P0+P1)/2); release confirms; drag back within threshold of the chord
  straightens. One gesture, identical mouse/touch, no modifier. Illustrator's
  click=corner / drag=curve, adapted to segment bowing.
- 45° angle snap: **Alt** + toolbar toggle (Shift freed — no arc-mode conflict, but
  kept unbound for now).
- Post-hoc bow editing (midpoint diamonds) lands with edit mode in Phase 5.
- E2E: create curved segment, verify render + persistence.

### Phase 5 — Edit mode
- Centerline hit test (44px corridor), selection state + highlight, handle rendering
  (screen-space sizes, progressive disclosure by zoom).
- Vertex drag / segment-midpoint bow / insert via double-click segment / delete vertex /
  delete wall — all suppress-then-commit.
- Properties on floating bar: width scale, tint, flip, kind defaults.
- E2E: edit flows, undo granularity (one entry per gesture).

### Phase 6 — Touch & polish
- Touch pass on real device: hit targets, double-tap reliability, Done-bar ergonomics,
  map-block-mode ergonomics review.
- Perf pass: telemetry command on a wall-heavy map; verify static-cache behavior on iPad.
- Docs: src/CLAUDE.md + components/mapcanvas/CLAUDE.md updates; release notes.

**Dependencies:** 0 ∥ 1 → 2 → 3 → 4 → 5 → 6. Phases 0-2 are backend-ish and low-risk;
the UX-heavy phases (3-5) each ship a usable increment.

---

## 4. Risks & open questions

| # | Risk / question | Mitigation / decision |
|---|---|---|
| R1 | Curved sweep perf on iPad (slice-per-few-px drawImage) | Static-layer cache means it renders once per edit, not per frame; cap slice count by zoom; telemetry before/after (H-531 doctrine) |
| R2 | Hit-testing curved centerlines | Flattened polyline distance test (reuse `distanceToSegment`); cache flattened points in WeakMap |
| R3 | **RESOLVED (Guildmaster 2026-06-12):** both geometries at launch | Tool enabled on grid AND hex from Phase 3; grid snapping first, hex snap targets (vertices/edge-midpoints/centers) in Phase 6 |
| Q1 | **RESOLVED:** one palette tool | Selected asset determines `kind` (wall vs path) and its defaults |
| Q2 | **RESOLVED:** NO default assets | Tool requires imported DD/content packs. Phase 0 importer is therefore a hard prerequisite for a usable tool. Empty-state UX required: asset browser Walls section explains how to import. E2E test vault still carries a small fixture strip (test-only, not shipped) |
| Q3 | **RESOLVED:** per-layer | `layer.wallPaths[]`; ghost-layer rendering and layer history apply automatically |

---

## 5. Skip-log (guild discipline)

- **Meridian consult skipped** at planning stage: three independent evidence streams
  (DD's own model, codebase survey, external UX research) converge on the same
  architecture (explicit vertices + optional quadratic arc per segment). No competing
  approach survived research. Revisit if Phase 2 rendering surfaces a fight.
- **Parallax adversarial review recommended** on this plan before Phase 1 code.
