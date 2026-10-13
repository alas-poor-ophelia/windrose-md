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
| `interactions/` | Every other tool/feature interaction (fog, regions, outlines, measure, Beacon, sub-hex, keyboard) |

Only real hooks use the `use*` prefix. The former non-hook files `useSelectionActions.ts` and `useToolbarPosition.ts` now live in `components/toolbars/` as `selectionActionBuilders.ts` and `toolbarPosition.ts`.

## Directory Structure

```
hooks/
├── canvas/
│   ├── useCanvasRenderer.ts        # Draws all layers onto the main canvas (rAF-coalesced)
│   ├── useCanvasInteraction.ts     # Pan/touch/space-key state for the canvas
│   ├── useEventCoordinator.ts      # Attaches canvas listeners; routes pointer events to registered layer handlers by current tool
│   ├── useLayerHandlers.ts         # Layer-side registration with the coordinator (latest-ref Proxy)
│   ├── usePanZoomCoordinator.ts    # Wheel/drag/pinch pan-zoom input, writes through ViewController
│   ├── useViewController.ts        # Live pan/zoom state held OFF the Preact path during a gesture
│   ├── useLiveOverlayTransform.ts  # Keeps SVG overlay groups locked to the canvas during live gestures
│   └── useLiveOverlayRedraw.ts     # Same, for overlay <canvas> redraws (rAF-coalesced)
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
│   ├── useEdgeSnapModifiers.ts     # Edge-snap / freeform modifier keys
│   └── useGroupDrag.ts             # Multi-select group drag
├── state/
│   ├── useMapData.ts               # Load/hold map data
│   ├── useDataHandlers.ts          # onCellsChange/onObjectsChange/... handlers that write layer data
│   ├── useDebouncedSave.ts         # Debounced save with flush registry and stale-conflict handling
│   ├── useHistory.ts               # Generic undo/redo stack
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
    ├── useSubHexNavigation.ts      # Sub-hex drill-down stack
    ├── useHexContextMenu.ts        # Hex right-click menu
    └── useAlignmentMode.ts         # Background image alignment mode
```

## Patterns

### Event Handling Flow

Pointer events are routed centrally; layers never attach their own canvas listeners.

1. A layer builds its handler object and calls `useLayerHandlers(name, handlers, { enabled })` (names are the keys of `HandlerTypeMap` in `types/hooks/eventCoordinator.types.ts`: `'object'`, `'drawing'`, `'wall'`, `'region'`, `'partyPin'`, ...).
2. `useLayerHandlers` stores the handlers in a ref refreshed every render and registers a stable Proxy with `EventHandlerContext`, so the coordinator always sees the latest closures and the layer never re-registers mid-gesture. Pass `enabled: false` (or a tool gate) to unregister.
3. `useEventCoordinator` (called once from `MapCanvas`) attaches the canvas listeners and, per `currentTool`, modifier keys, touch state and selection state, looks handlers up with `getHandlers(name)` and dispatches. To change which tool reaches which layer, edit its tool routing, not the layer.

### Live Pan/Zoom (anything positioned in screen space)

Pan/zoom must not reconcile the Preact tree per input tick. `useViewController` keeps the live `viewState` in a controller (`getLive()`, `setLive()`, `subscribeLive()`, `commitIfCurrent()`); `mapData.viewState` commits once at gesture end. Consequences:

- Read the view through `viewController.getLive()` (as the renderer and `screenToGrid`/`screenToWorld` do), not `mapData.viewState`, inside anything that must track a gesture.
- SVG overlay drawn in world coordinates: `useLiveOverlayTransform` rewrites the group transform per tick (used by RouteLayer, MeasurementOverlay, PartyPinOverlay).
- Overlay `<canvas>`: `useLiveOverlayRedraw(viewController, redraw)` (used by FreehandLayer, OutlineLayer, RegionLayer, WallLayer).
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
