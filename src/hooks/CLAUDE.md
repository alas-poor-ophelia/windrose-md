# Custom Hooks

## Purpose

Encapsulate stateful logic, side effects, and event handling. Hooks sit between pure utilities (`objects/`, `drawing/`, `geometry/`) and Preact components.

## Taxonomy (where a new hook goes)

| Folder | Rule |
|--------|------|
| `canvas/` | Frame and gesture infrastructure: rendering, pointer routing, pan/zoom, live overlay sync |
| `drawing/` | Paint-class tools: cells, edges, segments, shapes, diagonal fill |
| `objects/` | Object manipulation: select, drag, place, resize, modify, hover |
| `state/` | App and document state: map data, history, tool state, saving, panels, feature flags |
| `walls/` | The wall/path/opening tool: state + handlers, overlay paints, drawer-footer control surface |
| `app/` | Composition hooks for the root map component (DungeonMapTracker): drawer state, map-list actions, board handlers, adjacent sub-maps, tileset art handlers, chrome state. Only DMT calls these |
| `interactions/` | Every other tool/feature interaction (fog, regions, outlines, measure, Beacon, sub-hex, keyboard) |

Only real hooks use the `use*` prefix. The former non-hook files `useSelectionActions.ts` and `useToolbarPosition.ts` now live in `components/toolbars/` as `selectionActionBuilders.ts` and `toolbarPosition.ts`.

## Directory Structure

```
hooks/
├── canvas/
│   ├── useCanvasRenderer.ts        # rAF-coalesced renderCanvas scheduling + static-cache lifecycle (renderer itself: geometry/renderers/mapRenderer.ts)
│   ├── useCanvasInteraction.ts     # Pan/touch/space-key state for the canvas
│   ├── useSeamlessSubHex.ts        # Seamless sub-hex dive/surface zoom transition (cooldown, approach prewarm); used by useCanvasInteraction
│   ├── useEventCoordinator.ts      # Attaches canvas listeners; routes pointer events to registered layer handlers by current tool
│   ├── toolDispatch.ts             # TOOL_ROUTES: Record<ToolId, ToolRoute> - per-tool down/move/up/leave/doubleClick routing table
│   ├── useLayerHandlers.ts         # Layer-side registration with the coordinator (typed by HandlerTypeMap, latest-ref Proxy)
│   ├── usePanZoomCoordinator.ts    # Wheel/drag/pinch pan-zoom input, writes through ViewController
│   ├── useViewController.ts        # Live pan/zoom state held OFF the Preact path during a gesture
│   ├── useLiveOverlayTransform.ts  # Keeps SVG overlay groups locked to the canvas during live gestures
│   ├── useLiveOverlayRedraw.ts     # Same, for overlay <canvas> redraws (rAF-coalesced)
│   └── useOverlayCanvas.ts         # A layer's private overlay <canvas>: guarded create, size follows main canvas, remove/unmount
├── drawing/
│   ├── useDrawingTools.ts          # Orchestrator composing the drawing hooks below
│   ├── usePaintTool.ts             # Paint/erase drag: cells, edges, objects, labels, curves, tiles, walls, terrain strokes
│   ├── useEdgeDragTool.ts          # Edge painting/erasing by drag
│   ├── useSegmentDragTool.ts       # Segment painting by drag (desktop)
│   ├── useSegmentPicker.ts         # Touch segment-picker state
│   ├── useSegmentHover.ts          # Segment hover preview
│   ├── useShapeTools.ts            # Rectangle/circle/clear-area/edge-line cell tools
│   └── useDiagonalFill.ts          # Diagonal fill tool
├── objects/
│   ├── useObjectInteractions.ts    # Orchestrator composing the object hooks
│   ├── useObjectDragSelect.ts      # Selection + drag (must stay together: shared long-press ref)
│   ├── useObjectPlacement.ts       # Click placement (snapped and freeform)
│   ├── useObjectResize.ts          # Corner-handle resize
│   ├── useObjectHover.ts           # Hover tracking
│   ├── useObjectModifications.ts   # Scale/rotate/color/note/delete/duplicate
│   ├── useObjectModals.ts          # Note and note-link modal state
│   ├── useMultiSelectionActions.ts # Rotate/duplicate/delete all for a multi-selection (pure edits exported)
│   ├── useObjectLinking.ts         # Object-to-object links: start, complete-on-click, follow, remove
│   ├── useObjectContextMenu.ts     # Native right-click menu for an UNSELECTED object (claimant rule)
│   ├── useDragMeasurement.ts       # Measure-movement toggle and drag distance readout
│   ├── useEdgeSnapModifiers.ts     # Edge-snap / freeform modifier keys
│   └── useGroupDrag.ts             # Multi-select group drag
├── state/
│   ├── useMapData.ts               # Load/hold map data
│   ├── useDataHandlers.ts          # onCellsChange/onObjectsChange/... handlers that write layer data
│   ├── useDebouncedSave.ts         # Debounced save with flush registry and stale-conflict handling
│   ├── useHistory.ts               # NOT a hook any more: pure undo/redo building blocks (field diffs, stack cap) used by useLayerHistory; rename is a later bead
│   ├── useLayerHistory.ts          # Per-layer history and layer switching
│   ├── useToolState.ts             # Current tool, color, opacity
│   ├── usePanelState.ts            # Panel/modal visibility
│   ├── useUILayout.ts              # Expand/collapse and layout state
│   ├── useViewControls.ts          # Zoom in/out, compass rotation, recenter (not ViewController)
│   ├── useFloatingPanels.ts        # Floating dock-panel positions/focus order
│   ├── useFeatureFlags.ts          # Reactive feature flags (core/featureFlags)
│   ├── useThemeMode.ts             # Light/dark detection
│   ├── useTileBrush.ts             # Hex tile brush state
│   ├── useTilesetBuilder.ts        # Scans tileset folders and builds tileset defs into map data
│   ├── useImagePreloading.ts       # Tile image preloading
│   ├── useThumbnailPipeline.ts     # Tile thumbnail requests/cache
│   ├── useVirtualizer.ts           # Preact wrapper over @tanstack/virtual-core
│   └── useMcpBridge.ts             # Registers the instance on window.__windrose.mcpInstances (MCP server + E2E)
├── tiles/
│   └── useTileFilterPipeline.ts    # TileAssetBrowser's memo chain: search/tag/pack/category filtering and grouping (read-only over the metadata snapshot)
├── walls/
│   ├── useWallTools.ts             # Wall tool state, pointer/keyboard handlers, wall mutation (draw/edit/opening modes; ephemeral edit-drag, one commit on pointerup)
│   ├── useWallOverlay.ts           # Wall overlay canvas: draw preview, edit handles (drag hot path), opening ghost, live pan/zoom redraw
│   └── useWallToolSurface.ts       # Publishes the drawer-footer control surface (stable actions, primitive deps)
├── app/                            # DungeonMapTracker composition hooks (one caller)
│   ├── useTileDrawerState.ts       # Tiles/Objects pane + tool coupling, rail sel, grid/list modes, wall surface, bare threshold
│   ├── useTileToolCoupling.ts      # Strip/opening armed <-> wall tool transitions
│   ├── useDrawerRibbon.tsx         # Memoized full-pane drawer ribbon VNode
│   ├── useTileFlyouts.ts           # Recent/starred flyout data + pick
│   ├── useTilesetArtHandlers.ts    # Tileset overrides, global art nudge/scale (debounced), unmount flush
│   ├── useMapListActions.ts        # Map list, select/new/generate/delete
│   ├── useBoardHandlers.ts         # Board (floor) + strata handlers
│   ├── useAdjacentSubMaps.ts       # Adjacent sub-map toggle + click-to-navigate hit-test
│   ├── useDockLayout.ts            # Full-pane dock column/section collapse
│   ├── useLayerLinkActions.ts      # useSubHexLink (copy deep link), useCloneLayerRequest
│   └── useMapChromeState.ts        # useOnboardingState, useSubHexRowReveal, useCanvasFrameSize
└── interactions/
    ├── useKeyboardShortcuts.ts     # Undo/redo, layer nav, global shortcuts
    ├── useCustomEventHandlers.ts   # windrose:* DOM custom events
    ├── useTextLabelInteraction.ts  # Text label place/edit
    ├── useNotePinInteraction.ts    # Note pin place/edit
    ├── useAreaSelect.ts            # Rectangle multi-select
    ├── useFogOfWar.ts              # Fog UI state/operations (vs useFogTools: canvas-level)
    ├── useFogTools.ts              # Fog paint/erase/rectangle
    ├── usePlayerFogClear.ts        # Light-radius fog clearing on drop
    ├── useRegionTools.ts           # Region tools (hex)
    ├── useOutlineTools.ts          # Polygon outline tools (hex)
    ├── useShapeOverlayTools.ts     # Shape overlay (rectangle/circle) placement
    ├── useDistanceMeasurement.ts   # Multi-waypoint measure tool
    ├── useTerrainSampling.ts       # Auto route-segment terrain (sampler context)
    ├── usePartyPinInteraction.ts   # Beacon (party pin) place/drag
    ├── usePartyPinCardPosition.ts  # Beacon controls card anchor/placement
    ├── useSubHexNavigation.ts      # Sub-hex drill-down on a hexKey path; one functional writer (persistence/subHexPath.ts)
    ├── useHexContextMenu.ts        # Hex right-click menu
    └── useAlignmentMode.ts         # Background image alignment mode
```

## Patterns

### Event Handling Flow

Pointer events are routed centrally; layers never attach their own canvas listeners.

1. A layer builds its handler object and calls `useLayerHandlers(name, handlers, { enabled })` (names are the keys of `HandlerTypeMap` in `types/hooks/eventCoordinator.types.ts`: `'object'`, `'drawing'`, `'wall'`, `'region'`, `'partyPin'`, ...).
2. `useLayerHandlers` stores the handlers in a ref refreshed every render and registers a stable Proxy with `EventHandlerContext`, so the coordinator always sees the latest closures and the layer never re-registers mid-gesture. Pass `enabled: false` (or a tool gate) to unregister.
3. `useEventCoordinator` (called once from `MapCanvas`) attaches the canvas listeners and, per `currentTool`, modifier keys, touch state and selection state, looks handlers up with `getHandlers(name)` and dispatches. Routing lives in `TOOL_ROUTES` (`canvas/toolDispatch.ts`): every `ToolId` must declare its down/move/up/leave/doubleClick behaviour (noop or notConsumed included), so a new tool without a route is a compile error. To change which tool reaches which layer, edit its route, not the layer. Registration is typed: `useLayerHandlers<T>(name, handlers)` checks `handlers` against `HandlerTypeMap[T]`.

### Sub-hex Navigation

The open sub-hex level is a path of hexKeys, not a copy of map data. `persistence/subHexPath.ts` holds the pure helpers (`getMapAtSubHexPath`, `setAtSubHexPath`, `addSubHexEntryAtPath`, `toRootUpdater`). `useSubHexNavigation` exposes `activeUpdateMapData`, which lifts every edit into a functional root update, so there is no propagate-up step and a root write made while a level is open survives. Do not reintroduce a local copy of a level's map data.

### Live Pan/Zoom (anything positioned in screen space)

Pan/zoom must not reconcile the Preact tree per input tick. `useViewController` keeps the live `viewState` in a controller (`getLive()`, `setLive()`, `subscribeLive()`, `commitIfCurrent()`); `mapData.viewState` commits once at gesture end. Consequences:

- Read the view through `viewController.getLive()` (as the renderer and `screenToGrid`/`screenToWorld` do), not `mapData.viewState`, inside anything that must track a gesture.
- SVG overlay drawn in world coordinates: `useLiveOverlayTransform` rewrites the group transform per tick (used by RouteLayer, MeasurementOverlay, PartyPinOverlay).
- Overlay `<canvas>`: `useLiveOverlayRedraw(viewController, redraw)` (used by FreehandLayer, OutlineLayer, RegionLayer, and WallLayer via `walls/useWallOverlay`). The canvas itself comes from `useOverlayCanvas(canvasRef, { active?, onResize? })` (those four plus TerrainBrushLayer): draw via `sized()`, which re-syncs to the main canvas size; it does not handle pan/zoom.
- An overlay that only reads committed state freezes mid-pan and snaps at gesture end.

### Stable References

Memoize callbacks and returned objects:

```typescript
import { useCallback, useMemo } from 'preact/hooks';

function useMyHook(dependency: string) {
  const handleAction = useCallback((value: number) => doSomething(value, dependency), [dependency]);
  return useMemo(() => ({ handler: handleAction }), [handleAction]);
}
```

For values read inside long-lived listeners, keep them in a ref (`ref.current = latest` each render) instead of adding them to an effect dependency list: it avoids re-attaching listeners per edit (see `subHexDiveRef` in `useEventCoordinator`).

### Composition and Return Shape

Orchestrators (`useDrawingTools`, `useObjectInteractions`) compose focused sub-hooks. Return objects with a stable shape: state, actions, computed values.

## Touch Considerations

- Use pointer events where possible; handle pinch and two-finger pan.
- Respect touch target sizing (44px minimum); consider iPad trackpad as hybrid input.

## Adding New Hooks

1. Pick the folder from the taxonomy; create `use*.ts` there (there are no hooks at `hooks/` root).
2. Import from `preact/hooks`.
3. Consume contexts via `useMapState()`, `useApp()`, etc.
4. Return stable references; document with JSDoc.
5. Export via `export { useMyHook }`. If it is not a hook (no hook calls), do not name it `use*`.

## Common Gotchas

- **Stale closures**: most "caching" bugs are this; use the latest-ref pattern for listeners.
- **Unstable references**: returning a new object each render re-renders consumers.
- **Effect cleanup**: always remove listeners; use `activeWindow`/`activeDocument` for popout-window safety.
- **Hooks after early return**: all hooks run before any conditional return.
- **Don't confuse** `useViewController` (canvas/, live pan/zoom) with `useViewControls` (state/, zoom buttons and compass).
