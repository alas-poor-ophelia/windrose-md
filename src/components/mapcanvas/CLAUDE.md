# MapCanvas Components

## Purpose

The main map component and its layer/overlay components. `MapCanvas` provides the contexts, owns the main canvas, and hosts the layers passed in as `children` (exposed as `MapCanvas.ObjectLayer`, `MapCanvas.DrawingLayer`, ...). `DungeonMapTracker.tsx` (root component) composes them.

## Files

```
MapCanvas.tsx               # Providers (MapSelection, ObjectLinking, EventHandler, MapState, MapOperations),
│                           #   main canvas + fog canvas, Coordinators (usePanZoomCoordinator + useEventCoordinator)
├── DrawingLayer.tsx          # Cell painting, erasing
├── ObjectLayer.tsx           # Placed objects (doors, traps, etc.); multi-select, linking, right-click menu, drag measure in hooks/objects
├── ObjectHoverTooltip.tsx    # Hovered-object label; sole useHoverState() subscriber (rendered by ObjectLayer)
├── TextLayer.tsx             # Text labels
├── FogOfWarLayer.tsx         # Fog tools
├── FreehandLayer.tsx         # Freehand curves (overlay canvas)
├── TerrainBrushLayer.tsx     # Terrain stroke brush (overlay canvas, hard-edge preview)
├── WallLayer.tsx             # Wall/path tool: composes hooks/walls (useWallTools, useWallOverlay, useWallToolSurface); geometry in drawing/wallEditGeometry.ts
├── OutlineLayer.tsx          # Polygon outlines, hex (overlay canvas)
├── RegionLayer.tsx           # Named regions, hex (overlay canvas)
├── TilePlacementLayer.tsx    # Tile placement tool
├── ShapeOverlayLayer.tsx     # Shape overlays: rectangles/circles, rotate
├── NotePinLayer.tsx          # Note link pins
├── PartyPinLayer.tsx         # Beacon: resolves shared settings once, one PartyPinInstance per pin
├── PartyPinInstance.tsx      # One Beacon: range query, ring overlay, controls card when selected
├── MeasurementLayer.tsx      # Measure tool, terrain picker, auto segment terrain (useTerrainSampling)
├── RouteLayer.tsx            # Saved measurement routes (SVG, always visible)
├── AreaSelectLayer.tsx       # Multi-select rectangle
├── HexCoordinateLayer.tsx    # Hex coordinates (hex only)
├── DiagonalFillOverlay.tsx   # Diagonal fill preview/handlers
├── ShapePreviewOverlay.tsx   # Shape tool preview
├── SegmentHoverOverlay.tsx   # Segment hover feedback
├── SegmentPickerOverlay.tsx  # Segment picker UI
├── CardinalIndicators.tsx    # N/S/E/W indicators
├── RerollDungeonButton.tsx   # Dungeon generation reroll
└── viewportTransform.ts      # Pure world/screen viewport math shared by overlays (not a component)
```

"Beacon" in the UI is `PartyPin` in code.

## Key Patterns

### Layers

Each layer reads shared state from context (`useMapState()`, `useMapSelection()`, ...), uses the geometry abstraction (never assume grid vs hex), and registers its pointer handlers with `useLayerHandlers(name, handlers, { enabled })` (see `hooks/CLAUDE.md`). Layers do not attach their own canvas pointer listeners; `useEventCoordinator` routes events.

Layers do NOT read `MapSettingsContext`: that provider exists only inside the per-map settings modal. Per-map data comes from `mapData`/`useMapState()`; global preferences from `getSetting()` (`core/settingsAccessor`).

### Overlay vs Layer

- **Layers**: tool behavior plus content.
- **Overlays**: interaction feedback (hover, previews).

### Canvas Rendering

- Committed content is drawn by `useCanvasRenderer` onto the main canvas; do not draw map content to it from layers.
- Layers that need live feedback own a private overlay `<canvas>` through `useOverlayCanvas` (hooks/canvas): Freehand, TerrainBrush, Wall, Outline, Region. Do not hand-roll the create/size/remove lifecycle. `MapCanvas` also owns the fog blur canvas.
- Pan/zoom goes through `useViewController` (live state off the Preact path; commit at gesture end), driven by `usePanZoomCoordinator`. Anything positioned in screen space must follow live ticks: `useLiveOverlayRedraw` for overlay canvases, `useLiveOverlayTransform` for SVG groups (RouteLayer, MeasurementOverlay, PartyPinOverlay). See "Live Pan/Zoom" in `hooks/CLAUDE.md`.

## Context Dependencies

Layers consume `MapContext` (state + operations), `MapSelectionContext`, `ObjectLinkingContext`, `EventHandlerContext`. `MapCanvas.tsx` is the provider for all of them (`MapSelectionProvider` and `ObjectLinkingProvider` wrap `MapCanvasContent`).

## Adding a New Layer

1. Create `NewLayer.tsx` following an existing layer of similar kind.
2. Use `useMapState()` for geometry and map data; handle grid and hex via `geometry.*`.
3. Register handlers with `useLayerHandlers`; add the layer name/handler type in `types/hooks/eventCoordinator.types.ts` and routing in `useEventCoordinator` if it owns a tool.
4. If it draws on screen-space overlays, subscribe to the ViewController (above).
5. Add to the layer composition (`MapCanvas.NewLayer` attachment in `MapCanvas.tsx`, rendered by `DungeonMapTracker.tsx`).
6. Mind z-order (fog on top, drawing on the bottom).

## Gotchas

- **DOM**: prefer refs from context; overlay canvases are created and removed by `useOverlayCanvas` (`activeWindow.createEl`, removed on unmount).
- **Don't store derived state**; compute from context values.
- **Don't assume pixel coordinates**; use `geometry.cellToPixel`/`pixelToCell` and `viewController.getLive()`.
- **Touch**: all interactions must work on iPad.
- **Size**: `ObjectLayer`, `RegionLayer`, `OutlineLayer` are large; extract sub-hooks rather than growing them.
