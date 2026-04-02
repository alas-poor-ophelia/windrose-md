# UI/UX Design Patterns for Canvas-Based Map Editors

Compiled from established patterns in Figma, Excalidraw, tldraw, Canva, Dungeondraft, Inkarnate, Wonderdraft, Foundry VTT, Roll20, and others. Filtered for relevance to Windrose (dungeon/hex map editor running inside Obsidian/Electron).

Apply when: designing new UI components, adding tools/interactions, reviewing UX flows, or planning features that involve canvas interaction, toolbars, panels, or viewport management.

---

## 0. Windrose Design Language (Existing Patterns)

New UI must match the existing visual language. Windrose uses a **medieval fantasy aesthetic** (bronze borders, ornamental brackets) combined with modern interaction patterns.

### Theme Variables

All colors use CSS custom properties in `WindroseMD-CSS.css`. Never hardcode colors — use these variables:

```css
--dmt-bg-primary: #1a1a1a       /* Dark background */
--dmt-bg-secondary: #2a2a2a     /* Panel background */
--dmt-bg-tertiary: #3a3a3a      /* Hover/active background */
--dmt-border-primary: #c4a57b   /* Bronze accent — the signature color */
--dmt-border-secondary: #3a3a3a /* Subtle borders */
--dmt-text-primary: #ffffff     /* Main text */
--dmt-text-secondary: #cccccc   /* Secondary text */
--dmt-text-muted: #888          /* De-emphasized text */
--dmt-accent-blue: #4a9eff      /* Action/interactive blue */
--dmt-accent-red: #8b0000       /* Danger, rotation indicators */
--dmt-warning: #ffaa00          /* Warning states */
--dmt-error: #ff4444            /* Error states */
--dmt-transition: all 0.15s ease /* Standard transition */
```

### CSS Naming Convention

Strict `.dmt-` prefix with BEM-style naming:
- Block: `.dmt-container`, `.dmt-tool-palette`, `.dmt-modal`
- Element: `.dmt-tool-btn`, `.dmt-sidebar-header`
- Modifier: `.dmt-tool-btn-active`, `.dmt-sidebar-collapsed`

All CSS lives in a single file: `src/css/WindroseMD-CSS.css`. Don't create new CSS files.

### Button Pattern

Every interactive button follows this template:

```css
.dmt-[name]-btn {
  background-color: var(--dmt-bg-secondary);
  border: 1px solid var(--dmt-border-secondary);
  border-radius: 3px;
  color: var(--dmt-text-primary);
  cursor: pointer;
  transition: var(--dmt-transition);
}
.dmt-[name]-btn:hover {
  background-color: var(--dmt-bg-tertiary);
  border-color: #4a4a4a;
}
```

Active tool buttons use bronze background (`--dmt-border-primary`) with dark text and red SVG accent.

### Animation Patterns

- **Standard transition**: `var(--dmt-transition)` = `all 0.15s ease`
- **Stagger reveals**: Each item gets `transitionDelay: (index + 1) * 40ms`, reverse on collapse
- **Entry animations**: `slideUp` (translateY + opacity), `fadeIn`
- **Spinner**: `@keyframes rotate` for save status
- **Easing**: `cubic-bezier(0.4, 0, 0.2, 1)` for drawer items, `cubic-bezier(0.25, 0.1, 0.25, 1)` for compass

### Touch Adaptations

- Canvas height: 600px desktop, 400px mobile (configurable via settings)
- Controls drawer: auto-collapse after 800ms desktop, 3000ms touch
- Segment picker: modal on touch, drag on desktop
- Detection: `(hover: none) and (pointer: coarse)` media query

### Decorative Elements

The app uses ornamental SVG corner brackets on `.dmt-container` with glow filters. These are part of the brand identity. New containers that feel "primary" can use them; utility panels should not.

---

## Design Metrics Quick Reference

Hard numbers. Bookmark this section.

| Metric | Value | Source |
|--------|-------|--------|
| Min touch target | 44×44px | Apple HIG |
| Min button gap | 8px | Prevents mis-taps |
| Spacing grid | 4px or 8px increments | No arbitrary values |
| Body text minimum | 16px | Readability |
| Text contrast (WCAG AA) | 4.5:1 ratio | Normal text |
| Large text contrast | 3:1 ratio | 18pt+ or 14pt bold |
| Working memory limit | 7 ± 2 items | Max toolbar items per group |
| Quick feedback | < 100ms | Hovers, cursor changes |
| Standard transition | 150–300ms | Panel open/close, state changes |
| Maximum animation | 500ms | Never exceed |
| Loading spinner delay | 300ms | Don't flash on fast operations |
| Long press threshold | 500ms | Context menu trigger |
| Double-tap window | 300ms | Between taps |
| Touch/mouse debounce | 500ms | Ignore synthetic mouse after touch |
| Zoom range | 10%–3200% | Windrose uses 10%–400% |
| Smart snap distance | 2–8px | Before snapping engages |
| Canvas render target | 60fps | During pan/zoom |
| Toast auto-dismiss | 4–8s | Info notifications |
| Autosave debounce | 2000ms | Windrose standard |

### Accessibility Essentials

- **Reduced motion**: Respect `@media (prefers-reduced-motion: reduce)` — set `animation-duration: 0.01ms`
- **Focus styles**: `outline: 2px solid` with `2px offset` on all interactive elements
- **Color independence**: Never use color as the sole information conveyor (add icons/text)
- **Keyboard navigation**: Tab through all controls, Escape to close/deselect
- **Gesture alternatives**: Every gesture must have a button equivalent (WCAG 2.5.7)

---

## 1. Tool Palettes and Tool Switching

### 1.1 Tool as State Machine Node (tldraw pattern)

**Do this:** Model each tool as a top-level state in a hierarchical state machine. Each tool defines how the editor responds to input while active. Tools have child states (e.g., HandTool -> Idle | Pointing | Dragging).

**Not this:** Giant switch statements on `currentTool` scattered across event handlers.

**Why it works:** tldraw's StateNode architecture means events bubble from root through active children until handled or a transition occurs. Adding a new tool means adding a new state node, not touching existing handlers.

**Windrose parallel:** `useToolState.ts` + `useEventCoordinator.ts` already manage tool state. New tools should follow the pattern of self-contained state with clear idle/active/completing phases.

### 1.2 Single-Letter Tool Hotkeys (universal)

**Do this:** Assign single-letter shortcuts to every tool. V=select, H=hand/pan, B=brush/draw, E=eraser, R=rectangle, L=line, T=text, M=measure.

**Not this:** Multi-key combos for primary tools, or no keyboard access at all.

**Why it works:** Every major canvas app (Figma, Photoshop, Excalidraw, tldraw) uses this convention. Users' muscle memory transfers between apps. One keypress to switch is fast enough to not interrupt flow.

**Rule:** Tool hotkeys must work when the canvas is focused but NOT when a text input, modal, or panel has focus. Check `document.activeElement` or use Obsidian's `Scope` system.

### 1.3 Sticky vs. One-Shot Tools

**Do this:** Drawing/painting tools are sticky (stay active after use). Creation tools (place object, add text label) are one-shot (revert to select tool after placing). Provide a "lock" mechanism (double-click tool icon or press shortcut twice) to make one-shot tools sticky.

**Not this:** All tools sticky (forces manual switch back to select) or all tools one-shot (forces re-selecting brush after every stroke).

**Why it works:** Figma, Excalidraw, and Dungeondraft all distinguish between continuous tools (pen, brush) and discrete tools (place shape, add component). Matches mental model: "I'm painting" vs "I'm placing one thing."

### 1.4 Toolbar Position and Layout

**Do this:** Primary tools in a compact vertical strip on the left edge or horizontal strip at the top/bottom. Group related tools visually (drawing tools together, selection tools together). Show the active tool with a filled/highlighted state.

**Not this:** Floating toolbars that obscure content, or tools scattered across multiple locations.

**Why it works:** Fitts's Law -- edge-anchored toolbars have an effectively infinite boundary on one side, making them faster to target. Figma uses left toolbar, Excalidraw uses top toolbar, Dungeondraft uses left toolbar. All keep it compact and anchored.

**Windrose note:** `ToolPalette.tsx` is already positioned. Keep it anchored. Avoid floating palettes that compete with the canvas.

### 1.5 Tool Options in Context, Not in Toolbar

**Do this:** Show tool-specific options (brush size, snap mode, fill color) in a small contextual bar near the toolbar or above the canvas -- NOT as extra buttons in the main tool strip.

**Not this:** Cramming every option into the toolbar, or requiring a separate settings panel for basic tool options.

**Why it works:** Excalidraw shows stroke color, fill, stroke width, and roughness in a horizontal options bar above the canvas when a drawing tool is active. tldraw shows tool options in a floating panel near the toolbar. This keeps the primary toolbar scannable while making options immediately accessible.

---

## 2. Zoom, Pan, and Viewport Controls

### 2.1 Three Ways to Pan (mandatory)

Every canvas app must support all three pan methods:

1. **Middle mouse button drag** -- most desktop users' primary method
2. **Space + left-click drag** (or dedicated Hand tool) -- Photoshop convention, universally expected
3. **Two-finger drag** on trackpad/touch -- matches OS-level map/photo conventions

**Not this:** Only supporting scroll-to-pan or only supporting hand tool.

**Rule:** Space-to-pan must be a temporary override that returns to the previous tool on release. Do NOT switch to the hand tool permanently.

### 2.2 Zoom Toward Cursor (mandatory)

**Do this:** Zoom toward the mouse cursor position (or pinch center on touch). The point under the cursor stays fixed on screen during zoom.

**Not this:** Zoom toward canvas center regardless of cursor position.

**Why it works:** This is how Google Maps, Figma, Photoshop, and every map app works. Users zoom to inspect a specific area. Zooming toward center forces a pan-then-zoom workflow that doubles interaction cost. Steve Ruiz's "Creating a Zoom UI" article documents the math clearly.

**Implementation:** When zooming by factor `f` at screen point `(sx, sy)`, adjust camera: `newCamera.x = sx - (sx - camera.x) * f`, `newCamera.y = sy - (sy - camera.y) * f`.

### 2.3 Zoom Level Display and Presets

**Do this:** Show current zoom percentage in a small, clickable indicator (bottom-left or bottom-right corner). Clicking it opens a dropdown with presets: 50%, 100%, 200%, Fit to Content, Zoom to Selection.

**Not this:** No zoom indicator, or zoom only via keyboard with no visual feedback.

**Shortcuts (Figma convention):**
- `Ctrl+0` or `Shift+0`: Reset to 100%
- `Shift+1`: Fit all content in viewport
- `Shift+2`: Zoom to selection
- `Ctrl++` / `Ctrl+-`: Step zoom in/out

### 2.4 Zoom Limits and Steps

**Do this:** Set reasonable zoom limits (e.g., 10% to 3200%). Use logarithmic zoom steps (each step multiplies by ~1.2x) so zooming feels consistent at all levels.

**Not this:** Linear zoom steps (feels too fast when zoomed in, too slow when zoomed out).

**Rule:** Always allow zoom-to-fit even if the result would exceed normal zoom limits. The user needs to see their entire map.

### 2.5 Minimap (optional but valuable for large maps)

**Do this:** Small overview rectangle in corner showing entire canvas with a viewport indicator. Draggable viewport rectangle for quick navigation. tldraw uses a WebGL minimap; simpler implementations use a scaled-down canvas render.

**When to add:** When maps can exceed ~4x the viewport in any dimension. Dungeon maps with multiple rooms/levels benefit significantly.

---

## 3. Selection and Multi-Select

### 3.1 Marquee Selection (rubber band)

**Do this:** Click-drag on empty canvas to create a selection rectangle. Objects intersecting the rectangle are selected. Hold Shift to add to existing selection. Hold Alt/Option to subtract from selection.

**Not this:** Requiring Ctrl+click on each individual object for multi-select.

**Intersection vs containment:** Use intersection (partial overlap selects) by default. Some tools offer Ctrl+drag for containment-only selection (object must be fully inside the rectangle). Figma supports both.

### 3.2 Shift+Click to Toggle Selection

**Do this:** Shift+click adds to selection if unselected, removes if already selected. This is universal across all design tools and file managers.

**Not this:** Shift+click replacing the entire selection, or Ctrl+click for toggle (breaks convention).

### 3.3 Click-Through / Deep Selection

**Do this:** In apps with layers or grouped objects, double-click enters a group. Ctrl+click (Cmd on Mac) selects through groups to the deepest element.

**Windrose parallel:** Objects on different layers, or sub-hex cells within a hex. Consider whether click should select the top-most layer object or the cell underneath.

### 3.4 Selection Visual Feedback

**Do this:** Selected objects get a visible bounding box with resize handles. Multi-selected objects get a combined bounding box. Show a count of selected objects ("3 objects selected") in the status bar or a floating indicator.

**Not this:** Only changing the object's appearance (color change, etc.) with no bounding box.

**Handle design:** Corner handles for resize, edge handles for stretch, rotation handle above the top edge (Figma pattern). For map objects, diamond handles to distinguish from cell selection.

---

## 4. Property Panels and Inspectors

### 4.1 Contextual Properties (Excalidraw pattern)

**Do this:** Show properties relevant to the current selection. No selection = show canvas/map properties. One object selected = show that object's properties. Multiple selected = show shared properties, with mixed values shown as "--" or a partial indicator.

**Not this:** A fixed panel showing all possible properties regardless of selection.

**Why it works:** Excalidraw uses `SelectedShapeActions` that adapts to what's selected, showing stroke color, fill, opacity, etc. only when relevant. Figma's right panel does the same. This reduces cognitive load -- users see only what they can act on.

### 4.2 Inline Editing Over Modal Dialogs

**Do this:** Edit properties directly in the panel or via on-canvas controls (drag to resize, click color swatch to pick color). Use modals only for complex multi-step operations (map settings, export).

**Not this:** Opening a modal dialog to change a single property like color or size.

**Windrose note:** The native modal conversions (NoteLinkModal, TextLabelEditor) are good for complex interactions. For simple properties (object color, size), prefer inline panel controls.

### 4.3 Adaptive Layout (Excalidraw pattern)

**Do this:** Property panels adapt to available space. Desktop = full sidebar. Tablet = compact panel. Mobile = bottom tray/sheet. Excalidraw uses `stylesPanelMode` with "full", "compact", "mobile", and "tray" modes.

**Windrose context:** Since this runs in Obsidian, the available space depends on the pane layout. Detect the pane width and switch between full sidebar and compact/collapsed modes.

---

## 5. Keyboard Shortcuts and Modifier Keys

### 5.1 Universal Modifier Conventions

These are cross-app conventions users expect. Violating them creates confusion:

| Modifier | Universal Meaning |
|----------|-------------------|
| **Shift** | Constrain (aspect ratio, 45-degree angles, axis-lock), add to selection, snap to grid |
| **Alt/Option** | Duplicate while dragging, measure from center, subtract from selection |
| **Ctrl/Cmd** | Precision (disable snap), deep select through groups, system shortcuts |
| **Space** | Temporary hand/pan tool (hold to pan, release to return) |

**Rule:** Never reassign Shift, Ctrl, or Alt to meanings that contradict these conventions. Users will fight muscle memory.

### 5.2 Modifier Key Visual Feedback

**Do this:** When the user holds a modifier key, update the cursor and/or show a brief tooltip indicating what the modifier does in the current context. Figma changes the cursor icon when holding Alt (shows duplicate icon) or Space (shows grab cursor).

**Not this:** Silent modifier keys where users have to memorize or guess what each modifier does with each tool.

### 5.3 Arrow Key Nudging

**Do this:** Arrow keys move selected objects by 1 unit. Shift+arrow moves by 10 units (or 1 grid cell). This is the Figma/Photoshop standard.

**Not this:** Arrow keys scrolling the viewport when objects are selected.

### 5.4 Delete and Backspace

**Do this:** Both Delete and Backspace remove selected objects. On Mac, there is no Delete key, so Backspace must work. Provide Ctrl+Z undo immediately.

---

## 6. Undo/Redo

### 6.1 Operation Grouping (critical)

**Do this:** Group related micro-operations into a single undo step. Dragging an object generates hundreds of position updates, but undo should restore the object to its pre-drag position in one step. Use a "begin batch" / "end batch" pattern around drag operations.

**Not this:** Every mousemove during a drag creating a separate undo entry (forces users to press Ctrl+Z hundreds of times).

**Rule for grouping:**
- Mouse down to mouse up = one undo step
- Typing in a text field = debounce into one step per pause (300-500ms)
- Tool operations (paint stroke, erase area) = one step per mouse-down-to-up gesture

### 6.2 Undo Across Tool Boundaries

**Do this:** Undo should work regardless of which tool is currently active. If the user draws with the brush, switches to select, then presses Ctrl+Z, the brush stroke is undone.

**Not this:** Per-tool undo stacks where switching tools resets undo history.

### 6.3 Undo Stack Depth

**Do this:** Keep at least 50-100 undo steps. For memory-constrained environments, use the command pattern (store operations, not full state snapshots) to keep memory usage predictable.

**Windrose note:** `useHistory.ts` and `useLayerHistory.ts` handle this. Ensure operation grouping is correct for drag operations and drawing strokes.

---

## 7. Map-Making Specific: Layers

### 7.1 Layer Panel Design (Foundry VTT pattern)

**Do this:** Show layers in a vertical list with visibility toggles (eye icon), lock toggles (padlock icon), and clear labels. Active layer is highlighted. Drag to reorder.

Foundry VTT's layer system is the gold standard for TTRPG tools:
- **Background**: base map image, always at bottom
- **Tiles**: decorative objects above background
- **Tokens/Objects**: interactive items players see
- **Walls**: invisible barriers for vision/movement (editor-only visibility)
- **Lighting**: light sources affecting visibility
- **Foreground**: elements rendered above tokens (rooftops, arches)
- **Fog of War**: revelation state (separate from layers)

**Not this:** Inkarnate's confusing foreground/background/top layer system where users don't know which layer an object lands on.

**Rule:** Layer ordering should be visually obvious and match rendering order. "What's on top in the list is on top on the canvas."

### 7.2 Layer Isolation Mode

**Do this:** Clicking a layer makes it active. Only the active layer receives new objects or edits. Other layers are visible but non-interactive (dimmed or with reduced opacity). Provide a quick way to "solo" a layer (hide all others).

**Why it works:** Prevents accidentally editing the wrong layer. Photoshop, Foundry VTT, and Dungeondraft all use this pattern.

### 7.3 Layer Visibility Shortcuts

**Do this:** Click eye icon = toggle one layer. Alt+click eye icon = solo that layer (hide all others). These are Photoshop conventions that transfer to map tools.

---

## 8. Map-Making Specific: Grid and Snapping

### 8.1 Grid Display Controls

**Do this:** Provide grid as an overlay that can be toggled on/off, with adjustable opacity. Support at minimum: square, hex (pointy-top), hex (flat-top). Show grid size in the status bar or grid settings.

**Not this:** Grid baked into the background image, or no grid toggle.

**Dungeondraft approach:** Grid is always-on with a snap toggle (shortcut 'S'). Objects snap to grid intersections by default. Hold a modifier key to temporarily disable snap. This is the right default for map-making.

**Roll20 approach:** Alt key snaps fog of war reveals to grid cells. Hex grids have been updated to support precise distance measurement.

### 8.2 Snap Toggle (critical for map tools)

**Do this:** Default = snap to grid ON. Provide a toggle button (and keyboard shortcut) to turn snap off for freeform placement. When snap is off, hold Shift to temporarily re-enable snap. When snap is on, hold Ctrl to temporarily disable it.

**Windrose parallel:** Freeform object placement (Alt+Shift+click) already exists. The snap toggle pattern should be consistent: default snap on, modifier to override.

### 8.3 Hex vs Square Grid Switching

**Do this:** Grid type is a map/scene setting, not a per-session toggle. Changing grid type should reflow objects that were snapped to the old grid (or warn the user). Display hex coordinates (axial q,r or cube x,y,z) differently from square coordinates (col,row).

**Foundry VTT rule:** Walls snap to grid lines when the scene uses a square or hex grid. Token movement on hex grids uses hex-native pathfinding. Distance measurement accounts for hex geometry (every other column offset).

---

## 9. Map-Making Specific: Fog of War

### 9.1 Paint-to-Reveal (Roll20/Foundry pattern)

**Do this:** Fog of war is an opaque overlay. DM paints areas to reveal them. Provide both cell-by-cell reveal (click or Alt+click for grid-snapped) and freeform polygon reveal (drag to draw reveal boundary).

**Roll20:** Fog divides into grid-aligned cells. Alt key snaps reveals to individual squares or hexes.

**Foundry VTT:** Fog uses walls to calculate vision automatically (dynamic lighting), with a manual fog painting option as fallback.

### 9.2 Fog State Indicators

**Do this:** Show fog state clearly: fully hidden (opaque), previously revealed (dimmed/gray), currently visible (clear). This three-state model (Roll20's "Advanced Fog of War") lets DMs distinguish "explored but not currently visible" from "never seen."

**Not this:** Binary fog (visible/hidden) with no memory of previously explored areas.

---

## 10. Map-Making Specific: Measurement

### 10.1 Ruler Tool

**Do this:** Click to start measurement, move to extend, click to anchor waypoints, double-click or Escape to end. Show distance in grid units (5ft, 10ft, etc.) along the measurement line. For hex grids, count hex traversals, not Euclidean distance.

**Display:** Label follows the measurement line, updating in real-time as the mouse moves. Show both grid distance and straight-line distance if they differ.

### 10.2 Radius/Area Templates

**Do this:** For TTRPG tools, provide area-of-effect templates: circle (radius), cone, line, cube/square. These snap to grid and show which cells are affected. Foundry VTT and Roll20 both support these as measurement subtypes.

---

## 11. Mobile and Touch Interaction

### 11.1 Touch Gesture Mapping

Standard touch-to-desktop mapping (used by all major canvas apps):

| Touch Gesture | Desktop Equivalent | Action |
|--------------|-------------------|--------|
| One-finger tap | Left click | Select / use tool |
| One-finger drag | Left-click drag | Draw / move object |
| Two-finger drag | Middle-click drag / Space+drag | Pan viewport |
| Pinch (two fingers) | Ctrl+scroll | Zoom |
| Two-finger rotate | n/a | Rotate selection (optional) |
| Long press (500ms+) | Right-click | Context menu |
| Double-tap | Double-click | Edit text / enter group |

**Critical rule:** Two-finger pan and pinch-to-zoom must be distinguishable. Use a gesture discriminator: if the distance between fingers changes by more than a threshold (e.g., 10px), it's a zoom. If fingers move roughly parallel, it's a pan. Most implementations allow simultaneous pan+zoom.

### 11.2 Trackpad Pinch Detection

**Do this:** On desktop trackpads, the browser fires `wheel` events with `event.ctrlKey = true` for pinch gestures. This is the de-facto standard since Chrome ~2015 and works across all major browsers. Handle this case separately from regular scroll.

```
if (event.ctrlKey) {
  // Pinch-to-zoom on trackpad
  handleZoom(event);
} else {
  // Regular scroll / two-finger pan
  handlePan(event);
}
```

### 11.3 Touch-Friendly Button Sizing

**Do this:** Minimum 44x44px touch targets (Apple HIG) or 48x48dp (Material Design). Space toolbar buttons with at least 8px gaps. Use icons, not text labels, for toolbar buttons on small screens.

**Not this:** Desktop-sized 24x24px buttons on touch interfaces.

**Rule:** If Windrose will ever be used on tablets (Obsidian Mobile exists), toolbar buttons must meet 44px minimum. This also helps desktop accessibility.

### 11.4 Long Press for Context Menu

**Do this:** 500ms long press opens a context menu at the press location. Cancel if the finger moves more than 10px (it's a drag, not a long press). Haptic feedback on supported devices.

**Windrose note:** Already implemented in `useCanvasInteraction.ts` with 500ms timer and 300ms double-tap window.

---

## 12. Universal Canvas Principles

### 12.1 Tool State Persistence

**Do this:** Remember the last-used tool, zoom level, pan position, and tool options across sessions. When the user reopens the map, restore their viewport and active tool.

**What to persist:**
- Active tool + tool options (brush size, color)
- Zoom level and camera position
- Layer visibility states
- Panel open/closed states
- Grid snap on/off

**Where to persist:** In Windrose, the data JSON file per-map or Obsidian's `workspace.json`.

### 12.2 Non-Destructive Editing

**Do this:** Prefer operations that can be reversed without data loss. When erasing, store the removed data (or use boolean subtraction on geometry). When cropping an image, keep the original and apply a crop mask.

**Not this:** Permanently deleting pixels or geometry on erase.

**Windrose parallel:** The curve boolean erasure system (polygon-clipping) is already non-destructive -- it modifies geometry through boolean operations, preserving the ability to undo.

### 12.3 Viewport Navigation Shortcuts

Standard shortcuts every canvas app should support:

| Shortcut | Action | Notes |
|----------|--------|-------|
| Shift+1 | Fit all content | Zoom/pan to show everything |
| Shift+2 | Zoom to selection | Center and zoom to selected objects |
| Ctrl+0 / Shift+0 | Reset to 100% | |
| Ctrl++ / Ctrl+- | Step zoom | Logarithmic steps |
| Home | Return to origin | Pan to (0,0) |

### 12.4 Status Bar / Coordinate Display

**Do this:** Show current cursor coordinates (in grid units, not pixels) in a status bar at the bottom or a small overlay near the cursor. Show zoom level. Optionally show selected object count and active layer.

**Format for hex grids:** Show axial coordinates (q, r) or meaningful labels (e.g., "C4" for column 4, row C). For square grids, show (col, row) or (x, y).

**Rule:** Coordinates should update in real-time as the cursor moves, but use `requestAnimationFrame` throttling to avoid performance issues.

### 12.5 Context Menus on Canvas

**Do this:** Right-click (or long-press on touch) opens a context menu at the click position. Menu items depend on what was clicked:
- Empty canvas: paste, zoom options, grid settings
- Selected object: cut, copy, delete, bring to front/send to back, properties
- Multiple selection: group, align, distribute

**Not this:** Browser's default context menu appearing on the canvas, or a generic menu regardless of context.

**Implementation:** Prevent default context menu on the canvas element. Build a custom menu component that positions itself at the click coordinates, flipping to stay within viewport bounds.

### 12.6 Cursor Feedback

**Do this:** Change the cursor to reflect the current tool and state:

| State | Cursor |
|-------|--------|
| Select tool, hovering nothing | `default` |
| Select tool, hovering object | `pointer` or `move` |
| Hand/pan tool | `grab` (idle), `grabbing` (dragging) |
| Draw/paint tool | `crosshair` or custom brush cursor |
| Eraser | custom eraser icon or `crosshair` |
| Resize handle | `nwse-resize`, `nesw-resize`, etc. |
| Measuring | `crosshair` |
| Disabled area | `not-allowed` |

**Rule:** Cursor changes must be instantaneous. Any perceptible delay in cursor change makes the interface feel broken.

---

## 13. Anti-Patterns to Avoid

### 13.1 Mode Confusion

**Problem:** User doesn't know which tool is active, accidentally draws when they meant to pan.

**Fix:** Always show the active tool highlighted in the toolbar. Change the cursor. Optionally show the tool name briefly when switching.

### 13.2 Hidden Modifier Key Features

**Problem:** Powerful features only accessible via undiscoverable modifier keys.

**Fix:** Show modifier hints in tooltips. When hovering a toolbar button, the tooltip should say "Rectangle (R)" and "Hold Shift to constrain proportions." Excalidraw does this well.

### 13.3 Undo That Doesn't Work

**Problem:** Undo skips operations, undoes too much (whole sequences instead of single steps), or doesn't work after tool switches.

**Fix:** Test undo after every operation type. Test undo across tool switches. Test undo after save/load. Undo failures destroy user trust faster than almost any other bug.

### 13.4 Zoom Controls That Fight the User

**Problem:** Zoom snaps to preset levels instead of smooth zooming. Zoom toward center instead of cursor. Zoom that resets when switching between hex and square views.

**Fix:** Smooth zoom with cursor anchoring. Preserve zoom level across mode changes unless the content geometry changes.

### 13.5 Panels That Steal Canvas Space

**Problem:** Opening a settings panel, layer panel, or properties panel permanently shrinks the canvas area, forcing a viewport recalculation.

**Fix:** Float panels over the canvas (with transparency/blur) or use collapsible sidebars that trigger a single viewport resize when opened/closed. Excalidraw floats all panels. Figma uses a fixed-width sidebar but handles the resize smoothly.

---

## Sources

- [tldraw Tools Architecture](https://tldraw.dev/docs/tools)
- [Excalidraw Actions and Toolbars (DeepWiki)](https://deepwiki.com/excalidraw/excalidraw/4.1-actions-and-toolbars)
- [Excalidraw Properties and Color Picker (DeepWiki)](https://deepwiki.com/zsviczian/excalidraw/4.6-properties-and-color-picker)
- [Excalidraw State Management (DEV Community)](https://dev.to/isaachagoel/you-dont-know-undoredo-4hol)
- [Creating a Zoom UI - Steve Ruiz](https://www.steveruiz.me/posts/zoom-ui)
- [Figma Keyboard Shortcuts](https://help.figma.com/hc/en-us/articles/360040328653-Use-Figma-products-with-a-keyboard)
- [Figma Zoom and View Options](https://help.figma.com/hc/en-us/articles/360041065034-Adjust-your-zoom-and-view-options)
- [Figma Selection](https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects)
- [Foundry VTT Canvas Layers](https://foundryvtt.com/article/canvas-layers/)
- [Foundry VTT Walls](https://foundryvtt.com/article/walls/)
- [Roll20 Advanced Fog of War](https://wiki.roll20.net/Advanced_Fog_of_War)
- [Dungeondraft Object Tools](https://encounterlibrary.com/dungeondraft-basics/object-tools/)
- [Dungeondraft Custom Snap](https://dungeondraft-encyclopaedia.gitbook.io/guide/custom-assets-and-mods/some-useful-mods/custom-snap)
- [Konva Multi-touch Scale](https://konvajs.org/docs/sandbox/Multi-touch_Scale_Stage.html)
- [Trackpad Pinch Detection](https://tigerabrodi.blog/how-to-handle-trackpad-pinch-to-zoom-vs-two-finger-scroll-in-javascript-canvas-apps)
- [Material Design Gestures](https://m1.material.io/patterns/gestures.html)
- [Canvas Navigation Patterns (Stitchmate)](https://stitchmate.app/handbook/canvas-navigation)
- [Undo/Redo Deep Dive (DEV Community)](https://dev.to/isaachagoel/you-dont-know-undoredo-4hol)
- [Liveblocks Undo/Redo in Multiplayer](https://liveblocks.io/blog/how-to-build-undo-redo-in-a-multiplayer-environment)
