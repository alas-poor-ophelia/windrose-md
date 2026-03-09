## Version 1.5.8
Some freehand polish, some new flexibility for objects, and the beginning of proper Obsidian API integration.

#### **WARNING:** THE PLUGIN WILL BE BECOMING MANDATORY WITHIN THE NEXT 2-3 RELEASES. FOR NOW, IT REMAINS OPTIONAL OVERALL, BUT WINDROSE IS MOVING IN A DIRECTION THAT WILL MAKE KEEPING THE PLUGIN OPTIONAL TOO MUCH UPKEEP.

### New Features
- Freeform object placement.
	- Objects can now be "unlocked" from their grid cell, allowing free world-space movement similar to how text labels work. Hold Alt+Shift and click to place an object at an arbitrary position, or use the new toggle in the selection toolbar to convert an existing object between grid-anchored and freeform.
	- Freeform objects use diamond-shaped selection handles to visually distinguish them from grid-anchored ones.
	- Dragging freeform objects uses continuous world-space movement rather than snapping to grid cells.
- Per-map object set selection.
	- You can now swap which object set is active on a per-map basis, right from the map settings. No more being locked into a single global set across all your maps.
- Obsidian API integration.
	- Windrose now hooks into native Obsidian APIs via the companion plugin for a handful of UI elements. Note linking, text label editing, and parts of the map settings modal now use native Obsidian modals (with autocomplete, native color pickers, etc.) when the plugin is installed.
	- If the plugin isn't installed or something goes wrong, everything falls back to the existing Preact-based UI, so nothing should break.

### Improvements
- The "close" indicator for freehand shapes is now much more visually obvious, making it clearer when your shape is about to snap shut.
- Rectangle-style tool previews (size overlay, affected area highlight) have been extended to the area select and clear rectangle tools, not just fill rectangle/circle.
- Added a new visual overlay (diamond indicator) when holding Alt+Shift on a selected object to indicate freeform placement mode, matching the existing arrow overlay for Edge Snap (Alt).
- Image Adjustment Mode on grid maps now includes a grid size control, making it easier to align Windrose's grid with a pre-existing grid on your background image without needing to bounce back and forth between tabs.

### Bug Fixes
- Fixed an issue where the rectangle tool and clear area tool preview was offset from where it should have been.
- Fixed a bug where freehand shape interiors weren't scaling properly with zoom, causing visual misalignment at non-default zoom levels.
- Fixed a bug where freehand shape borders wouldn't visually merge with adjacent freehand shapes the way painted cells do.
- Fixed a bug where freehand shapes would lose their fill color and turn black when the compass was rotated to East or West orientations, particularly when abutting normal painted cells.
- Fixed the Edge Snap overlay (the one that appears when holding Alt on a selected object) which was, to put it generously, completely busted.
- Fixed several bugs with background image handling in Image Adjustment Mode, particularly around interactive repositioning not behaving correctly.
- Fixed a bug where the layer menu could obstruct clicks.
