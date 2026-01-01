# MapCanvas Components

## Purpose

This directory contains the main map rendering component and its layer system. MapCanvas orchestrates all visual layers and coordinates between contexts, hooks, and user interaction.

## Architecture

MapCanvas was refactored from a 2000+ line monolith into a composition-based architecture:

```
MapCanvas.jsx (orchestrator, <400 lines)
├── DrawingLayer.jsx      # Cell painting, erasing
├── ObjectLayer.jsx       # Placed objects (doors, traps, etc.)
├── TextLayer.jsx         # Text labels
├── FogOfWarLayer.jsx     # Fog overlay
├── NotePinLayer.jsx      # Note link indicators
├── MeasurementLayer.jsx  # Distance measurement display
├── AreaSelectLayer.jsx   # Multi-select rectangle
├── HexCoordinateLayer.jsx # Hex coordinate display
└── *Overlay.jsx          # Interaction overlays (hover, preview, picker)
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

1. Create `NewLayer.jsx` following existing layer patterns
2. Use `useMapState()` for geometry and map data
3. Handle both grid and hex via `geometry.*` methods
4. Add to MapCanvas.jsx layer composition
5. Consider z-order (fog usually on top, drawing on bottom)

## Common Gotchas

- **Don't access DOM directly** - Use refs passed through context
- **Don't store derived state** - Compute from context values
- **Don't assume pixel coordinates** - Use geometry.cellToPixel/pixelToCell
- **Don't forget touch** - All interactions must work on iPad