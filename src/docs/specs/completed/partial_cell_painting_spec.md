# Partial Cell Painting (Segment System)

**Version**: 1.5.x ("Dungeon Mapper")  
**Status**: Specification  
**Scope**: Grid maps only

---

## Overview

### Goals

Enable painting half-cells, quarter-cells, and individual triangle segments to create:
- Diagonal walls and corridors
- Angled room corners
- More organic dungeon shapes
- Clean diagonal borders at painted region edges

### Non-Goals (MVP)

- Hex map support
- Curves or freehand paths
- Per-segment opacity
- Diagonal line tool (fast-follow)
- Half/quarter modifier shortcuts (post-MVP)

---

## Data Model

### Segment Naming

8 triangular segments radiating from cell center, named by compass direction:

```
    TL ----TM---- TR
    |\ nw  |  n  /|
    | \    |    / |
    |  \   |   /  |
    |   \  |  /   |
    | w  \ | / ne |
   LM------*------RM
    | sw / | \ e  |
    |   /  |  \   |
    |  /   |   \  |
    | /    |    \ |
    |/  s  |  se \|
    BL ----BM---- BR
```

| Segment | External Edge | Boundary Location |
|---------|---------------|-------------------|
| nw | TL → TM | top edge, left half |
| n | TM → TR | top edge, right half |
| ne | TR → RM | right edge, top half |
| e | RM → BR | right edge, bottom half |
| se | BR → BM | bottom edge, right half |
| s | BM → BL | bottom edge, left half |
| sw | BL → LM | left edge, bottom half |
| w | LM → TL | left edge, top half |

### Cell Storage

**Simple cell** (existing, unchanged):
```javascript
{ x: 5, y: 3, color: '#ff0000', opacity: 0.8 }
```

**Segment cell** (new):
```javascript
{ x: 5, y: 3, segments: { nw: true, n: true, ne: true, e: true }, color: '#ff0000', opacity: 0.8 }
```

Key properties:
- **Sparse storage**: Only filled segments are keys in `segments` object
- **Single color per cell**: All segments share `color` and `opacity`
- **Coexistence**: Both cell types can exist in same layer
- **Auto-collapse**: If all 8 segments filled, convert to simple cell on save/commit

### Color Change Behavior

When painting new color onto a cell with existing segments:
- All existing segments adopt the new color
- Newly painted segments are added
- Result: entire cell becomes new color

### Accessor Integration

The `cellAccessor.js` module handles both cell types transparently:

```javascript
// Existing functions work unchanged
getCellAt(cells, coords, geometry)  // Returns simple or segment cell
setCell(cells, coords, color, opacity, geometry)  // Creates simple cell
removeCell(cells, coords, geometry)  // Removes either type

// New segment-aware functions
setSegments(cells, coords, segmentList, color, opacity, geometry)
removeSegments(cells, coords, segmentList, geometry)
getFilledSegments(cell)  // Returns array: ['nw', 'n', ...] or all 8 for simple
hasSegments(cell)  // Returns boolean
```

---

## Border System

### Principle

Draw borders wherever **filled meets empty** - whether that boundary is:
- External edge of cell (current behavior)
- Internal edge between segments within a cell
- External edge between segments across cell boundaries

### Internal Adjacency (Same Cell)

Segments share internal edges at lines from center to boundary points:

| Internal Edge | Segments Sharing |
|---------------|------------------|
| center → TL | w, nw |
| center → TM | nw, n |
| center → TR | n, ne |
| center → RM | ne, e |
| center → BR | e, se |
| center → BM | se, s |
| center → BL | s, sw |
| center → LM | sw, w |

**Border drawn when**: One segment filled, adjacent segment empty.

### Cross-Cell Adjacency

| My Segment | Neighbor Cell | Their Segment |
|------------|---------------|---------------|
| nw | above (y-1) | s |
| n | above (y-1) | se |
| ne | right (x+1) | w |
| e | right (x+1) | sw |
| se | below (y+1) | nw |
| s | below (y+1) | n |
| sw | left (x-1) | ne |
| w | left (x-1) | e |

**Border drawn when**:
- No neighbor cell exists, OR
- Neighbor is segment cell AND adjacent segment is empty

**No border when**:
- Neighbor is simple (full) cell, OR
- Neighbor is segment cell AND adjacent segment is filled

### Border Rendering

Internal edges: Line from center to boundary point  
External edges: Line along cell boundary segment

Both rendered as thin filled rectangles (existing iOS-compatible approach).

### Example

Cell with `nw, n, ne, e` filled (diagonal half), neighbors above and right are full cells:

```
Borders drawn:
- center → TL (internal: nw meets empty w)
- center → BR (internal: e meets empty se)

Result: diagonal line from TL through center to BR
```

---

## Rendering

### Layer Order

1. Grid lines (unchanged)
2. Simple cells (unchanged, existing batch-by-color)
3. Segment cells (new)
4. Interior grid lines (unchanged)
5. Cell borders - simple cells (unchanged)
6. Cell borders - segment cells (new)
7. Edges, objects, text, fog (unchanged)

### Segment Cell Rendering

```javascript
function renderSegmentCell(ctx, cell, geometry, viewState) {
  const { screenX, screenY } = geometry.gridToScreen(cell.x, cell.y, ...);
  const size = geometry.getScaledCellSize(viewState.zoom);
  
  const center = { x: screenX + size/2, y: screenY + size/2 };
  const points = {
    TL: { x: screenX, y: screenY },
    TM: { x: screenX + size/2, y: screenY },
    TR: { x: screenX + size, y: screenY },
    RM: { x: screenX + size, y: screenY + size/2 },
    BR: { x: screenX + size, y: screenY + size },
    BM: { x: screenX + size/2, y: screenY + size },
    BL: { x: screenX, y: screenY + size },
    LM: { x: screenX, y: screenY + size/2 }
  };
  
  // Triangle vertices for each segment
  const triangles = {
    nw: [center, points.TL, points.TM],
    n:  [center, points.TM, points.TR],
    ne: [center, points.TR, points.RM],
    e:  [center, points.RM, points.BR],
    se: [center, points.BR, points.BM],
    s:  [center, points.BM, points.BL],
    sw: [center, points.BL, points.LM],
    w:  [center, points.LM, points.TL]
  };
  
  ctx.fillStyle = cell.color;
  ctx.globalAlpha = cell.opacity ?? 1;
  
  for (const seg of Object.keys(cell.segments)) {
    const [a, b, c] = triangles[seg];
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.closePath();
    ctx.fill();
  }
  
  ctx.globalAlpha = 1;
}
```

### Performance Consideration

Segment cells require individual path drawing (can't batch like simple cells). For maps with many segment cells, consider:
- Batching by color where possible
- Caching segment paths if performance becomes an issue

Profile before optimizing.

---

## Tools and UX

### New Tool: Segment Paint

Located as sub-tool under Paint brush (alongside Edge Paint).

**Icon suggestion**: `triangle` or `slice` from Lucide, or custom

### Desktop Behavior

**Click-position-aware painting:**

1. Divide cell into 8 zones radiating from center (like pie slices)
2. Mouse position over cell determines which zone
3. Click paints that single segment
4. Drag across cell paints multiple segments in one stroke

**Visual feedback:**
- On hover, highlight the segment that would be painted (subtle fill or outline)
- During drag, show accumulated segments

**Modifier keys** (post-MVP):
- Shift+click: Paint half (4 segments, diagonal)
- Ctrl/Cmd+click: Paint quarter (2 adjacent segments)

### Mobile/Touch Behavior

**Explicit picker:**

1. Tap cell with Segment Paint tool selected
2. Picker overlay appears, expanded view of cell showing 8 zones:

```
┌─────────────────────┐
│                     │
│   ┌────┬────┬────┐  │
│   │ nw │  n │    │  │
│   ├────┼────┼────┤  │
│   │  w │    │ ne │  │
│   ├────┼────┼────┤  │
│   │    │  s │  e │  │
│   └────┴────┴────┘  │
│                     │
│        [ ✓ ]        │
│                     │
└─────────────────────┘
```

3. Tap segment to toggle fill (on/off)
4. Drag across segments to fill multiple
5. Tap confirm (✓) or tap outside to apply and close

**Picker details:**
- Shows current filled state if editing existing cell
- Filled segments shown in current selected color
- Empty segments shown as outlines or muted
- Toggling off removes segment from cell
- If all segments toggled off, cell is removed entirely

**Quick full-cell**: Use regular Paint tool (no change to existing behavior)

### Eraser Behavior

- Eraser tool erases **whole cells** (simple or segment)
- No partial erasing via eraser tool
- To remove individual segments: use Segment Paint picker, toggle segments off

### Undo/Redo

- Drag stroke (multiple segments in one gesture) = single undo entry
- Picker confirm = single undo entry
- Consistent with existing cell painting behavior

---

## Implementation Phases

### Phase 1: Data Model & Accessor (~2-3 hours)

1. Add segment functions to `cellAccessor.js`:
   - `setSegments(cells, coords, segmentList, color, opacity, geometry)`
   - `removeSegments(cells, coords, segmentList, geometry)`
   - `getFilledSegments(cell)`
   - `hasSegments(cell)`
   - `normalizeCell(cell)` - auto-collapse full segment cells

2. Update existing accessor functions to handle both cell types

3. Add segment constants to `dmtConstants.js`:
   - `SEGMENT_NAMES`
   - `SEGMENT_TRIANGLES` (vertex definitions)
   - `SEGMENT_ADJACENCY` (internal and cross-cell)

### Phase 2: Rendering (~3-4 hours)

1. Create `segmentRenderer.js`:
   - `renderSegmentCells(ctx, cells, geometry, viewState)`
   - Triangle path drawing

2. Update `cellRenderer.js`:
   - Route to segment renderer when `cell.segments` exists

3. Test: Manually create segment cells in data, verify rendering

### Phase 3: Border Calculation (~4-5 hours)

1. Create `segmentBorderCalculator.js`:
   - `getSegmentBorders(cell, cellMap, geometry)`
   - Internal edge detection
   - Cross-cell adjacency checks

2. Update border rendering:
   - Detect segment cells, use segment border calculator
   - Render internal borders (center → boundary point)
   - Render external borders (boundary segments)

3. Test: Various segment configurations, verify borders appear correctly

### Phase 4: Desktop Tool (~3-4 hours)

1. Add Segment Paint to tool palette (sub-tool under Paint)

2. Implement click-position detection:
   - `getSegmentAtPosition(x, y, cellBounds)` - returns segment name
   - Zone calculation from cell center

3. Wire up to `useDrawingTools`:
   - Single click → paint one segment
   - Drag → paint multiple segments
   - Use `setSegments` from accessor

4. Add hover highlight (visual feedback)

5. Test: Paint various shapes, verify rendering and borders

### Phase 5: Mobile Picker (~4-5 hours)

1. Create `SegmentPickerOverlay.jsx`:
   - 8-zone grid display
   - Tap to toggle
   - Drag to multi-select
   - Confirm/dismiss handling

2. Integrate with touch event handling:
   - Detect Segment Paint tool + tap
   - Show picker at cell position
   - Apply changes on confirm

3. Test: iPad/touch device testing

### Phase 6: Polish & Edge Cases (~2-3 hours)

1. Auto-collapse on save (full segment cells → simple cells)
2. Export handling (segment cells render correctly)
3. Copy/paste (if applicable)
4. History/undo verification
5. Performance check with many segment cells

**Total estimate: 18-24 hours**

---

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `cellAccessor.js` | MODIFY | Add segment functions |
| `dmtConstants.js` | MODIFY | Add segment constants |
| `segmentRenderer.js` | NEW | Segment cell rendering |
| `segmentBorderCalculator.js` | NEW | Segment border detection |
| `cellRenderer.js` | MODIFY | Route to segment renderer |
| `useCanvasRenderer.js` | MODIFY | Integrate segment rendering |
| `borderCalculator.js` | MODIFY | Handle segment cells |
| `useDrawingTools.js` | MODIFY | Segment paint logic |
| `ToolPalette.jsx` | MODIFY | Add Segment Paint sub-tool |
| `SegmentPickerOverlay.jsx` | NEW | Mobile picker component |
| `useCanvasInteraction.js` | MODIFY | Picker trigger for mobile |

---

## Testing Checklist

### Data Model
- [ ] Simple cells unchanged
- [ ] Segment cells store/load correctly
- [ ] Auto-collapse works (8 segments → simple cell)
- [ ] Color change updates all segments
- [ ] Mixed cell types in same layer

### Rendering
- [ ] Single segment renders as triangle
- [ ] Multiple segments render correctly
- [ ] Colors and opacity work
- [ ] Performance acceptable with 100+ segment cells

### Borders
- [ ] Internal borders (filled meets empty within cell)
- [ ] External borders (edge of map)
- [ ] Cross-cell: segment meets empty neighbor
- [ ] Cross-cell: segment meets full neighbor (no border)
- [ ] Cross-cell: segment meets segment neighbor
- [ ] Diagonal half creates clean diagonal border line

### Desktop Tool
- [ ] Click paints single segment
- [ ] Drag paints multiple segments
- [ ] Hover shows highlight
- [ ] Works at various zoom levels
- [ ] Undo/redo works

### Mobile Picker
- [ ] Tap opens picker
- [ ] Tap toggles segment
- [ ] Drag fills multiple
- [ ] Confirm applies changes
- [ ] Dismiss cancels
- [ ] Existing segments shown correctly
- [ ] Works on iPad

### Integration
- [ ] Eraser removes whole cell
- [ ] Rectangle fill still works (full cells)
- [ ] Circle fill still works (full cells)
- [ ] Export includes segment cells
- [ ] Fog of war covers segment cells

---

## Future Enhancements

### 1.5.1: Diagonal Line Tool

Click two cell corners, auto-fill segments along 45° diagonal.

### Post-MVP: Modifier Keys

- Shift+click: Half (4 segments)
- Ctrl/Cmd+click: Quarter (2 segments)

### Post-MVP: Per-Segment Color

Allow different colors per segment (requires data model change).

### Far Future: Hex Segments

6-segment model for hex cells (if demand exists).

---

## Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| Segment naming | Short: n, ne, e, se, s, sw, w, nw |
| Storage format | Sparse (only filled segments stored) |
| Full cell representation | Auto-collapse to simple cell |
| Internal borders | Skip borders between filled segments |
| Per-segment opacity | No, per-cell only |
| Color per segment | No, single color per cell |
| Half/quarter modes | Post-MVP |
| Eraser behavior | Whole cell only |
| Rect/circle fill | Full cells only |
| Grid/hex | Grid only for MVP |