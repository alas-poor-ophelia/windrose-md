# MapCanvas Components

## Purpose

This directory contains the main map rendering component and its layer system. MapCanvas orchestrates all visual layers and coordinates between contexts, hooks, and user interaction.

## Architecture

MapCanvas was refactored from a 2000+ line monolith into a composition-based architecture:

```
MapCanvas.tsx (orchestrator)
├── DrawingLayer.tsx          # Cell painting, erasing
├── ObjectLayer.tsx           # Placed objects (doors, traps, etc.)
├── TextLayer.tsx             # Text labels
├── FogOfWarLayer.tsx         # Fog overlay
├── FreehandLayer.tsx         # Freehand curve drawing
├── RegionLayer.tsx           # Named regions
├── NotePinLayer.tsx          # Note link indicators
├── MeasurementLayer.tsx      # Distance measurement display
├── AreaSelectLayer.tsx       # Multi-select rectangle
├── HexCoordinateLayer.tsx    # Hex coordinate display
├── TilePlacementLayer.tsx    # Tile placement tool
├── DiagonalFillOverlay.tsx   # Diagonal fill preview
├── ShapePreviewOverlay.tsx   # Shape tool preview
├── SegmentHoverOverlay.tsx   # Segment hover feedback
├── SegmentPickerOverlay.tsx  # Segment picker UI
├── CardinalIndicators.tsx    # N/S/E/W indicators
├── MapCanvasActionButtons.tsx # Floating action buttons
└── RerollDungeonButton.tsx   # Dungeon generation reroll
```

## Key Patterns

### Layer Components

Each layer:
- Receives state via `useMapState()` and other context hooks
- Handles its own rendering logic
- Is independent - can be added/removed without affecting others
- Uses geometry abstraction (never assumes grid vs hex)

```javascript
function SomeLayer() {
  const { geometry, mapData, canvasRef } = useMapState();
  const { currentLayer } = useMapSettings();
  
  // Render logic using geometry methods
  const cells = geometry.getCellsInViewport(...);
  // ...
}
```

### Overlay vs Layer

- **Layers**: Render map content (cells, objects, fog)
- **Overlays**: Render interaction feedback (hover states, previews, selection)

### Canvas Rendering

- Layers don't render directly to main canvas
- Use `useCanvasRenderer` hook for coordinated rendering
- Respect pan/zoom transform from `usePanZoomCoordinator`

## Context Dependencies

Components here consume (never provide):
- `MapContext` - Core map state, geometry, refs
- `MapSettingsContext` - Current layer, visibility, preferences
- `MapSelectionContext` - Selected objects, multi-select state
- `EventHandlerContext` - Centralized event handling

## Adding a New Layer

1. Create `NewLayer.tsx` following existing layer patterns
2. Use `useMapState()` for geometry and map data
3. Handle both grid and hex via `geometry.*` methods
4. Add to MapCanvas.tsx layer composition
5. Consider z-order (fog usually on top, drawing on bottom)

## Common Gotchas

- **Don't access DOM directly** - Use refs passed through context
- **Don't store derived state** - Compute from context values
- **Don't assume pixel coordinates** - Use geometry.cellToPixel/pixelToCell
- **Don't forget touch** - All interactions must work on iPad