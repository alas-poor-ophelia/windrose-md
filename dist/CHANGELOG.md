## Version 1.5.9
A quick follow-up to 1.5.8, mostly cleaning up rough edges from recent features.

### Improvements
- The eraser tool now prioritizes freehand curves over painted cells, since curves render on top visually. Previously you'd have to erase the cell underneath before the curve would go away, which felt backwards.

### Bug Fixes
- Fixed the color picker (and tool sub-menus) dismissing themselves immediately when clicked on desktop in some cases. The click that opened them was also triggering the "click outside to close" handler.
- Fixed the layer menu's invisible bounding box blocking clicks on a large area of the map, even when the menu was collapsed.
- Fixed clearing a background image not actually persisting when you saved.
- Overall hopefully tightened up the new Obsidian native modals.
- Fixed the freeform/grid toggle in the selection toolbar not updating after converting an object via Alt+Shift drag.
- Fixed a shape preview offset on grid maps caused by a quirk in how default parameters get handled in the compiled bundle.
