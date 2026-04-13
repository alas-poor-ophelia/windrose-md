## Version 1.6.1
Continuing the hex maps theme — this release is headlined by hex tile painting, and rounds out with a bunch of quality of life improvements across the board.

### New Features
- Hex Tile Painting
	- Paint image tiles onto hex maps. Import tileset folders from your vault (configured in the settings plugin), and paint tiles with click or drag.
	- A new **Tile Asset Browser** panel shows available tilesets and tiles. Browse by subfolder, click to select.
	- Tiles support **rotation** (60° increments) and **horizontal flip**.
	- **Base and overlay layers** — overlay tiles render on top of base tiles, for layering terrain and features.
	- **Freeform stamp placement** — place tiles at arbitrary positions, not snapped to the hex grid. Good for scattered trees, rocks, etc.
	- Tile dimensions and overflow (for images taller than the hex, like tree canopies) are auto-detected.
	- Eraser now erases tiles (overlay first, then base).
- windrose-map Code Blocks
	- Windrose now supports a `windrose-map` code block syntax for embedding maps. This is the modern way to create maps, and is what the “Insert new map” command now generates.
	- Simple YAML format: `id`, `name`, `type`. Existing maps using the old compiled-script embedding continue to work.
- Adjacent Sub-Map Preview
	- When viewing a sub-map, neighboring sub-maps now show as ghost previews at the edges of the map. Click a preview to navigate to that sub-map.
	- Toggle on/off per map — the setting persists.

### Improvements
- **Note Pin** has been promoted from the object sidebar to a first-class tool in the tool palette, with its own keyboard shortcut (N).
- **Object Sidebar** has been redesigned to match the tile asset browser's visual style. Includes a new dropdown to switch between object sets without leaving the map.
- **Object Set cross-type fallback** — if your current object set doesn't have objects for the map type you're on (e.g. hex objects on a grid map), Windrose falls back to the default set instead of showing nothing.
- **Region labels** are now draggable — reposition them freely within their region. Reset via context menu.
- **Region visibility toggle** added to the visibility toolbar for hex maps.
- **Sub-map settings** — the Map Settings modal now shows the sub-map name in the title and an info banner when you're editing a sub-map's settings.
- Sub-maps now show the parent map's tilesets, so you can paint tiles in sub-maps too.
- Updated README and Feature docs.
- Major internal codebase refactor that should improve performance and stability.
