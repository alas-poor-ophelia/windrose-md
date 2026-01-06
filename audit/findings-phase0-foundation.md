# Phase 0: Foundation Inventory

## Session Metadata
- Date: 2026-01-05
- Purpose: Establish baseline understanding of existing infrastructure before critical path audit
- Focus: What already exists for 1.6.x/1.7.x features?

---

## 1. Layer System

**Status: FULLY IMPLEMENTED**

The layer system is production-ready and integrated throughout the codebase.

### What Exists

| Component | Location | Description |
|-----------|----------|-------------|
| `MapLayer` type | `types/core/map.types.ts` | Full layer definition: id, name, order, visible, cells, edges, objects, textLabels, fogOfWar |
| `layerAccessor.ts` | `src/utils/` | CRUD operations, z-ordering, migration support |
| `useLayerHistory.ts` | `src/hooks/` | Per-layer undo/redo with state preservation on layer switch |
| `LayerControls.tsx` | `src/components/` | UI panel with drag-to-reorder, visibility toggle, add/delete |

### Architecture Notes
- Layers are dungeon "floors" - each layer is a complete 2D map
- Z-order via numeric `order` field (0 = bottom)
- Migration system handles v1 (no layers) → v2 (layers) automatically
- Per-layer fog of war supported

### Readiness for 1.6.x/1.7.x
- **Subhexes/regions (1.6.x)**: Layer infrastructure could support this, but would need conceptual extension (layers within hexes vs floors of a dungeon)
- **Multi-floor dungeons (1.7.x)**: Ready - just needs vertical connection UI (stairs/elevators)

---

## 2. Asset/Image Management

**Status: PARTIALLY IMPLEMENTED (Hex Background Only)**

Background image support exists for hex maps. No general image-as-object system yet.

### What Exists

| Component | Location | Description |
|-----------|----------|-------------|
| `BackgroundImage` type | `types/core/map.types.ts` | path, lockBounds, gridDensity, sizingMode, etc. |
| `imageOperations.ts` | `src/utils/` | Vault scanning, caching, preloading, dimension queries |
| `ImageAlignmentMode.jsx` | `src/components/` | Interactive drag-to-align UI |
| `useImageAlignment.ts` | `src/hooks/` | Drag interaction handling |

### Architecture Notes
- Images loaded from vault paths
- Module-level caching (persists across renders)
- Grid density presets: sparse (12 cols), medium (24), dense (48), custom
- Two alignment modes: edge-to-grid, corner-to-grid

### Gaps for 1.6.x/1.7.x
- **Custom hex tiles (1.6.x)**: Need `ImageObject` type, image rendering in ObjectLayer, image picker UI
- **Background images for grid maps (1.7.x)**: Need to extend `BackgroundImage` to grid mode
- **Asset library**: No persistent asset management - images are just vault paths

---

## 3. Object System

**Status: HIGHLY EXTENSIBLE**

Two-tier object system with built-in types + user customization. Already supports icons, colors, rotation, scale.

### What Exists

| Component | Location | Description |
|-----------|----------|-------------|
| `MapObject` type | `types/objects/object.types.ts` | id, type, position, size, label, linkedNote, alignment, slot, scale, rotation, color, opacity, locked, layerId |
| `ObjectType` / `CustomObject` | Same + settings types | Built-in + user-defined object types |
| `objectTypeResolver.ts` | `src/utils/` | Merges built-ins with overrides, resolves final definition |
| `objectOperations.ts` | `src/utils/` | CRUD with slot assignment (hex multi-object) |
| `hexSlotPositioner.ts` | `src/utils/` | Up to 4 objects per hex with auto-layout |

### Object Properties (Current)
```
id, type, position, size, label, linkedNote, alignment,
slot, scale, rotation, color, opacity, locked, layerId
```

### Icon Support
- **Unicode symbols**: Any character
- **RPGAwesome icons**: Full icon font library
- Resolution prefers icon if both specified

### Gaps for 1.6.x/1.7.x
- **Y-level ordering (1.6.x)**: Need `zIndex` or similar property on objects
- **Zoom-sensitive visibility (1.6.x)**: Need `minZoom`/`maxZoom` properties
- **Custom image objects (1.6.x)**: Need `imagePath` property + image rendering path
- **Object metadata (general)**: Could add generic `metadata: Record<string, unknown>` for extensibility

---

## 4. Rendering Pipeline

### Current Flow
1. `useCanvasRenderer.ts` - Main coordination (~41KB, largest hook)
2. Geometry abstraction (`GridGeometry`, `HexGeometry`)
3. Layer-specific renderers (`gridRenderer`, `hexRenderer`)
4. Per-layer: cells → borders → objects → text labels → fog of war
5. Selected items get interactive handles

### Performance Patterns
- `CellMap` for O(1) cell lookup
- Image caching with deduplication
- Layer visibility toggling
- Objects grouped by cell for spatial queries

### Watch Areas for 1.6.x/1.7.x
- **Radial hex rendering (1.6.x)**: Will need new rendering path in `HexGeometry`
- **Y-ordering (1.6.x)**: Objects need to render in z-order, not insertion order
- **More layers × more zoom (1.6.x/1.7.x)**: Performance ceiling unknown

---

## 5. Summary: Foundation Readiness

| Feature | Foundation Status | Gap Size |
|---------|-------------------|----------|
| Multi-floor dungeons | ✅ Ready | Minimal (UI only) |
| Subhexes/regions | 🟡 Conceptual stretch | Medium - layers are "floors" not "zoom levels" |
| Custom hex tiles | 🟡 Partial | Medium - need image object type + rendering |
| Y-level ordering | 🟡 Object model exists | Small - add property + render sort |
| Zoom-sensitive visibility | 🟡 Object model exists | Small - add properties + render filter |
| Radial hex rendering | 🔴 Not started | Large - new geometry math |
| Background images (grid) | 🟡 Hex-only currently | Small - extend existing |
| True layer system (1.7.x) | 🟡 Floors exist | Medium - different concept than floors |

---

## Notes for Phase 2

When auditing critical paths, pay special attention to:

1. **`useCanvasRenderer.ts`** - How hard would it be to add Y-ordering? Zoom filtering?
2. **`HexGeometry.ts`** - How coupled is it to coordinate-based rendering? Can it extend to radial?
3. **Layer system** - Is the "floor" metaphor baked in, or is it abstracted enough for other uses?
4. **Object rendering** - Where does render order come from? How hard to change?
