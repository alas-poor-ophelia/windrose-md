## Version 1.7.0

A rather unplanned but hopefully interesting release around a few new features. A new shape/polygon overlay, as well as some new stuff for solo play. And some new/hopefully better stuff around keyboard shortcuts.

### New Features
- **Shape Overlays** — Place square and circle shape overlays anywhere on the map (world space/not grid snapped). A new "Place Shape Overlay" tool uses two clicks to define the shape (corner-to-corner for squares, edge-then-center for circles, same as the fill tools). Shapes can be selected, dragged, recolored, deleted, and toggled between grid-snapped and freeform placement.
- **Player Objects & Light Radius** — Any object can now be marked as a "Player" via the selection menu. Player objects gain a toggleable light radius with customizable range and color, rendered as a radius on the canvas. When a player object is dragged to a new position, fog of war is automatically cleared within the light radius at the drop point. Supports compound undo (fog + position).
- **Object Measurement Overlay** — A new ruler toggle in the object selection toolbar. When enabled, dragging an object shows a dashed measurement line from the origin to the current position with the formatted distance (respects your distance/unit settings).
- **Clone Layer** — Clone a layer via the layer panel's right-click menu. Choose "Clone All" (full content including objects, text labels, and fog of war) or "Map Only" (painted tiles, edges, and curves only). The clone is inserted above the source layer and auto-selected.
- **New Keyboard Shortcuts: Layer Navigation** — Press `[` and `]` to switch between layers while hovering over the map. No more clicking through the layer panel to swap.
- **Fixed/other new Keyboard Shortcuts: Undo/Redo** — `Ctrl+Z` (undo) and `Ctrl+Y` / `Ctrl+Shift+Z` (redo) now work while hovering over the map.
- **Configurable Keyboard Shortcuts** — All keyboard shortcuts (tool selection, layer navigation, undo/redo) are now visible and rebindable in the plugin settings. Open Settings → Windrose MapDesigner Settings → Keyboard Shortcuts to see the full list. Click any shortcut to rebind it, or reset individual shortcuts or all at once.

### Improvements
- Tool palette tooltips now dynamically show the configured shortcut key (e.g., "Select/Move (S)") and update if you rebind shortcuts.
- Note link modal now includes a "Create Note" button that closes the modal and opens Obsidian's new file dialog, for quick note creation from Note Pins and Link Note.
- Note link modal now disambiguates duplicate note names by showing the parent folder path beneath each suggestion.
- Settings plugin updated to v0.18.2.

### Bug Fixes
- Fixed clear area tool not removing edges/lines created with the Draw Edge tool.
- Fixed color picker interaction bugs.
- Fixed layer controls intercepting clicks intended for the map canvas.
