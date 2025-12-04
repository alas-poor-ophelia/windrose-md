## Version 1.1.0
This is a pretty big one, with several requested features! 

**IMPORTANT:** For various reasons, the encoded fonts have been broken out into a separate CSS file you will need to add to your snippets. This is packaged with the release (and will be going forward as well).

### Features
- Edge painting
	- There are now two new tools, living under new submenus on the Tool Palette. A “paint edges” tool, and an “edge line” tool. Both allow you to now color grid lines in a different color, either one at a time, or from point to point, depending on the tool you pick.
	- Uses the primary selected color just like all drawing tools.
	- Eraser tool will erase painted lines (setting them back to their default color). Order of operations is object/label —> edge —> cell. 
- Multiple objects in Hex map cells
	- Hex map cells can now have up to 4 Objects in them. 
	- Objects will resize and rearrange to fit naturally in the cell.
	- Erasing, selection, dragging, should all work as expected, with each object individually targetable.
	- For now, this is Hex only, but it wouldn’t be too bad to extend to Grid, if people want it. 
- Object Scaling
	- Individual objects can now be scaled from 10% to 130%, allowing further customization. 
	- This does work on both grid and hex, but for now, if you have multiple objects in a single hex grid, they won’t scale. I may add this later, but it’s fairly delicate getting those all to distribute nicely. (READ: maybe after I can clean up that code some).
- Custom Objects!
	- An extensive custom objects system has been added. Modify existing objects (name or icon), or add new ones.
	- You _will_ need to install the plugin for this. Since no one has yet raised a concern with this (to me at least), I’m hoping that’s fine. But since custom objects are global, it made the most sense to make it a plugin setting only.
	- Objects can be added to any category, blending in seamlessly with stock object options. 
	- Either paste your own Unicode character, or select from one of the almost 500 RPGAwesome icons which are now bundled with the encoded fonts. 
	- Import and export functionality. Think you’ve got a great icon set figured out? It can be exported as JSON and imported by other users (when importing, users may choose to either merge, or overwrite).
- Distance measurements.
	- Cells (hex and grid) can now be assigned a distance (global default, per map overrides, as usual).
	- Distances are separated between Hex and Grid, since people tend to use very different scales. You can choose between imperial or metric measurement systems (you’re welcome, Americans).
	- New Distance Measuring tool added. Click a square, and move your mouse around to see the distance between your origin and where your mouse is. Click to dismiss.
	- Supports various systems for diagonal measurement: alternating (DnD style), equal (Chebyshev), and true distance (Euclidean).

### Improvements
- New keyboard shortcuts for tools.
	- Press “D” for Draw, “S” for Select, “E” for Erase, and “M” for measure.
- Opacity can now be adjusted on painted colors (cells, edges)
- X/Y pixel offset can now be set on background images. 

### Bug Fixes
- Partial addressing of an issue with resizing hex maps. Users are now warned about content they have drawn/placed on a map that would be deleted if they resized the grid. Hoping to have a better solution for this in the future, but ran into issues with some of my renderer changes.