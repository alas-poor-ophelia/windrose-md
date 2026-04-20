## Version 1.6.3
Pretty big quality of life release, with continued fixes and improvements to the hex tiles. Deep links have been completely rewritten to work reliably in both Reading and Live Preview modes, with hover previews that show a map thumbnail when you mouse over a link. The selection toolbar got a full redesign, objects now have right-click context menus, and tile painting has new per-tileset configuration options.

### New Features
- **Deep Link Rewrite**
	- Deep links now use a `windrose:` custom URL scheme instead of the old `obsidian://` protocol, which had reliability issues on some systems.
	- Deep links work in both **Reading mode** and **Live Preview**.
	- **Hover previews** — hovering a deep link shows a map thumbnail with a crosshair on the target location. Preview size and zoom level are configurable in settings (Map Behavior section).
- **Selection Toolbar Redesign**
	- Unified floating toolbar for objects, text labels, and multi-selections, replacing the three separate toolbars.
	- Links section is collapsible (expanded by default for Note Pin objects).
	- Right-click (or long press) context menu for objects via Obsidian's native Menu API — works on unselected objects too.
- **Per-Tileset Rendering Settings**
	- Gear icon in the tile asset browser opens an inline config panel per tileset.
	- **Stamp threshold** — control when tiles render as full-hex vs. freeform stamps based on their size relative to the hex.
	- **Min stamp scale** — set a minimum size for freeform stamps to prevent tiny rendering at low zoom.

### Improvements
- **Clear All** buttons (Outline and Fog of War) now show a confirmation dialog.
- **Outlines** added to the visibility toggle menu (hex maps).
- **Fog of War** toolbar is now a floating toolbar that auto-hides when the visibility menu closes.
- Stamp rendering uses hex-proportional minimum sizing — small stamps scale relative to hex screen size instead of a fixed pixel minimum.
- Object placement now correctly uses the per-map object set ID, fixing issues with imported object set customs not placing correctly.
- Updated Feature docs and README.

### Bug Fixes
- Fixed tile images stretching to full hex size during image load race (naturalWidth guard).
- Old `obsidian://windrose?` deep links still work for backward compatibility.
