## Version 1.6.2
Fast follow, with mostly bug fixes/some polish ontop of 1.6.1, but also added a new polygonal Outline tool for hex maps. It's a little rough around the edges, but good enough to release, I think.

### Features
- **Outline Tool** (hex maps)
	- Draw polygon outlines on hex maps. Click to place vertices, double-click to close the shape.
	- Three line styles: **solid**, **dashed**, and **dotted**. Configurable from the toolbar or per-outline after selection.
	- **Hex Snap mode** — outlines snap to hex cell boundaries, filling enclosed hexes and drawing borders along hex edges. (This is the part that may feel a bit odd, but it works)
	- **Straight mode** — outlines follow your exact vertex placement for freeform shapes.
	- Optional fill with configurable opacity.
	- undo/redo support.
	- Outlines can be edited by clicking an existing Outline with the Outline tool active. Select and drag vertices to reshape. Delete via toolbar, keyboard (Delete/Backspace), context menu, or Clear All.

### Improvements
- NoteLinkModal now auto-submits when selecting a suggestion from autocomplete.
- Region name field now auto-focuses when creating a new region.

### Bug Fixes
- Fixed Note Pin tool not working without placing an object first due to it not appearing as a valid object type
- Fixed adjacent sub-map visibility setting not persisting widely
- Fixed boundary close tool crashing on rectangular hex maps (missing async module load).
