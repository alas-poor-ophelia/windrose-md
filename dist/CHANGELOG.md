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
	- Windrose now supports a `windrose-map` code block syntax for embedding maps. This is the modern way to create maps, and is what the "Insert new map" command now generates.
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

---

## Version 1.6.0
And finally, the long promised beginning of the "hex maps" releases is here! Just like 1.5.x was the "dungeon release", I plan to do several point releases focused around hex maps. Some of it will doubtlessly affect grid maps as well, and bug fixes will be unaffected, but for now, here's the first release of new hex map functionality.

Also, I've started work on what will likely become a very re-imagined README.md (the frontpage of this project on GitHub), as well as the basis for more detailed actual docs. For now, that is a Feature List, providing a full list of what functionality WindroseMD supports, as that list did not exist anywhere in one place.

That is also now linked from the top of the README, just so it's findable. I'll be fleshing out all the documentation and promo stuff over the next few releases, so keep an eye out for that.

### New Features
- Radial hex maps
	- Hex maps can now be rendered radially, rather than needing to rely only on a radial coordinate overlay on a rectangular grid.
	- This can be adjusted in **Map Settings**.
	- For now, radial coordinates on a rectangular grid are still supported. This may change, as that was more of a shortcut/bandaid until the feature was formally added.
- Regions
	- **Regions** are a new layer/construct for hex maps, which allow you to declare one or more hexes as a region, each of which will have their own color and label, making them distinct "zones" of your hex map.  All tools should work as normal with them.
	- A new tool group, **Regions** has been added to the tool palette. It has two tools, both centered around creating new Regions.
		- **Paint Region** allows you to define a region one hex at a time, just like painting the map.
		- **Define Boundaries** lets you encircle an area to define as a region. Click/tap a point on the map, and click again to define a polygonal boundary. Double click/tap to close.
			- Honestly this one is a bit experimental and maybe a bit awkward, but should still be better than clicking individual hexes would be for particularly large regions.
	- When defining a region, a Region toolbar will appear that shows how many hexes you have selected in this region, and allows you to name and save the region.
	- A new button has been added to the **Map Controls** (near the button to open the Layers menu) to open the new Regions sidebar.
		- The Regions sidebar shows a list of all defined regions on the map. Clicking the name of a region will center the map on that region. Clicking the Eye button for a region will show or hide that region on the map.
	- Regions can be edited, either by right clicking (or long pressing on touch devices) any hex of a region and selecting the option, or by clicking or tapping an existing region with either Region creation tool.
- Sub-maps
	- Hex maps can now have nested sub-maps, which allows you to drill down from one hex into another hex map. Think clicking a city hex on the world map to show a hex map of the city in more detail. And then even clicking a district hex on the city map to drill down even further.
	- Sub-maps can be created from the right-click context menu, or by double clicking/tapping any hex. Doing this will automatically open a new sub-map.
	- When in a sub-map, you can understand where you're at with the new breadcrumbs view, located between the map name and the tool palette.
	- Sub-maps can be re-named by changing the name of the map when viewing one.
	- In theory, you can nest infinitely, but I've only tested about 3 deep.
	- Hexes with sub-maps indicate that they have one with a diamond icon in the center of the hex. This will only show up if you have made changes to a sub-map/the sub-map has data.
	- By default, sub-maps will show up as radial maps, with a size of 7 rings. This can be adjusted in the Map Settings menu the same way you would for changing the size/style of a top level hex map.
	- Each sub-map is essentially its entirely own instance of Windrose for now, which means that settings should be individually adjustable for each layer. This will probably be modified at least slightly, for UX clarity if nothing else going forwards.

### Improvements
- The Tool Palette has been slightly reorganized.
	- The clear rectangle tool has been moved into a group with the Eraser
	- Fill circle, Fill rectangle, and Diagonal fill have been consolidated into a single group
	- "Edge line" has been removed from the fill rectangle sub-menu (not sure why that seemed like a good idea at the time) to become its own top level tool. It has also been renamed to "Paint Line" which I think is a bit clearer.
- As alluded to above, I've introduced a new Context menu pattern, using Obsidian's native context menu API. For now this is just being used for hex map regions/sub-maps, but the pattern will likely be used in some other places going forwards, or backported to places that used different UIs. Let me know what you think.

### Bug Fixes
- Fixed some UI bugs with the Map Settings modal
- Reverted out the non-functional fix for the Color Palette automatically closing itself right after it opened on Linux, as that didn't fix the bug, and introduced a new issue where the Color Palette couldn't be closed by clicking outside of it. You can now once again close the palette by clicking outside of it.
