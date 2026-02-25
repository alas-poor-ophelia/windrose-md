## Version 1.5.6
And we're back. Some QoL and bug fixes, as well as a couple big new things.

### New Features
- Freehand drawing is now supported on both hex and grid maps.
	- New Freehand tool is in the draw tool submenu, or press `F` on the keyboard to select it.
	- You can draw freehand scribbles, but the main purpose is to create closed shapes (just get your end point close to your start point and it will close automatically), which will then merge cleanly with the rest of your grid.
	- Once drawn, a freehand shape is erasable cell by cell with the eraser tool, just like normal grid cells. You can also use the rectangular area clear tool to erase parts.
	- Freehand drawing respects your color selection the same way the standard draw tools do.
- Added Object Sets, which is an expansion of the object customizations import/export feature, allowing you to import (or set up a folder which will be auto scanned) multiple Object Sets (think "tile sets") at once, and hot swap between them.
	- For the launch of this feature, I've collaborated with Obsidian community member Bloated Blowfish, and am offering his excellent "Classic Dungeons" objects as a Windrose Object Set.  And by collaborated, I mean he generously offered to let me package and distribute his work. All effort is his, and all errors are mine. That Object Set is packaged with this release, if you wish to use it, and I will make it and any future sets easily downloadable from the front of the Git repo for the future.
	- For now this is still global, but I expect to add the ability to swap active object sets per map with a near-future release.
	- Object Sets have a defined structure consisting of a folder with a JSON file, and an `images/` subfolder if custom images are being used. The folder must live within your vault, and not be in an archive etc.


### Improvements
- The visibility controls now offer a grid visibility button, if you wish to hide the background grid. **NOTE:** There are minor visual artifacts between painted cells along the grid lines. This is due to Windrose's core rendering architecture, and I have no plans of addressing it at this point.
- Objects can now be copied between Grid/Hex types if you make a custom one for one type and want to easily use it with the other.
- All places in settings now use Obsidian modals rather than ugly system alerts, which were hanging around a few places.


### Bug Fixes
- Fixed a bug where forgetting to enter a label for a custom object  would make it impossible to enter a label.
- Fixed a bug where holding Cmd/Ctrl and hovering or clicking an object with a linked note wouldn't show a preview/open the note.
- Fixed a bug where panning the map with right click hold could accidentally grab and drag objects
- Fixed a bug where objects with images wouldn't render on Hex maps.
- Fixed a visual inconsistency where the "remove fog of war tool", really looked like an "_add_ fog of war tool", which led to a confusing experience for users. For now, that has been swapped to add fog. In the future I will likely add another tool, or enhance the functionality of this tool to do the other as well.
