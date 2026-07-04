# Discord Thread Post

**Download, and install from the [GitHub](https://github.com/alas-poor-ophelia/windrose-md/releases/tag/v1.7.0)**

Windrose MapDesigner, or WindroseMD is a richly featured map drafter/designer that lives inside your Obsidian notes. It supports traditional grid based dungeon maps, as well as hex grids for world maps or hex crawls. At it's simplest, it's graph paper in Obsidian; you can draw quick maps as a player listening to your DM, or scratch up a quick dungeon if your players decide that they actually **do** want to investigate that ruin you didn't plan out. 

Or, you can even generate a random map from scratch (no AI). Are you a Solo RPG player? Generate a random map with fog of war, and set up a custom player token with a configurable light radius to reveal detail as you move through a procedural dungeon stocked with treasure and enemies, all with just a few clicks.

At it's most complex, it supports drawing full world maps with full, importable tileset support, and infinitely* nested regions or submaps.

It's deeply integrated into Obsidian. Place objects on your map and link to specific notes from them. Or vice versa, get a link to an object and drop it in your notes so that you can open up to the exact room.

WindroseMD is not a typical plugin, and is currently built off of and requires the Datacore community plugin. Installation is simple though: Just download the latest release, and drop the files anywhere in your vault. Then install the plugin and start mapping. 

---
Hi all, you may have seen this over in #showcase, but I figured it was time this got its own thread

## version 2
### Features
- Added Expand button above compass which will make the map fill the note pane's full width. Works in Reading and Live Preview, and will work inside callouts, etc.
- Updated some unicode icons (on tools/UI elements, not Objects) to use Lucide icons for greater internal consistency and slightly better fit.
  
### Bug fixes
- Fixed bug where clicking off an Object or Text Label with select tool would not deselect the element as might be expected.
- Fixed bug where trying to two finger pan the map with the color picker open would send the viewport to outer space.

## Version 3
### Features 
- Add functionality to link notes to objects, as well as create standalone Note Pin objects, which will automatically prompt to link a note.
	- Note Linking will offer auto complete on your vault once you begin typing.
	- Objects with linked notes (or Note Pins) will show hover preview of linked note when hovering over object, while still allowing full control and interaction with Select tool.
	- The name of the linked note will also show (as a clickable link) when the object is selected. Clicking that link will open the note in a new tab and focus it.
	- Press Ctrl/Cmd+Left click on the unselected note object to open the link in a new tab in the background.

### Bug Fixes
- Fixed broken tooltip functionality. Tooltips should now show up on mouse hover in any mode with any tool selected.

## rc4
### Features
- No true new features over v3. This release constitutes a major refactor of the underlying Canvas/React architecture to use the more commonly recommended component composition React pattern. MapCanvas (where most of the logic lived) has been reduced from ~700 lines, to ~300, and everything should hopefully be far more stable and extensible. 
- Also began using React's Context pattern for global/infrequent constants.
- Theoretically, this should lead to some performance increases as well, as the entire canvas shouldn't be needing to re-render nearly as much. I've definitely anecdotally noticed a drastic increase on certain actions like panning while zoomed far out.
  
### Bug fixes
- General cleanup and performance fixes.
  
## Version 1.0.0
### New Name!
The big 1.0.0, as I finally admit I should start using real versions!

With that, "Dungeon Map Tracker" is now "Windrose MapDesigner" (or Windrose MD for short)!  Something something this balances the instant understanding of "MapDesigner" while also declaring the something something careful character something something that has been put into the design something.

(I just like the name. Hopefully no one hates it!)

### Features
- Added Hex Maps!
	- Hex maps can be configured to be flat-top or pointy-top. This can be set in the new Global Settings.
	- Hex Maps are (for now) rendered purely in an offset rectangle-style hex pattern. Radial will likely be added soon, but for now see notes on Coordinates.
	- A "quick check" coordinate mode. By tapping or holding down **"C"**  on your keyboard, this will hide all objects and text labels, and show the coordinates. This can be set to be either a toggle, or only last while you're holding the key down.
	- Coordinates can either be in a traditional letter/number rectangle pattern, or a radial coordinate pattern can be selected in map patterns. This is to offer at least a temporary solution for radial/center out hex maps.
	- More options for different coordinate systems may be added later (i.e. numbers only for rectangle) but I'll need input on what people want.
- Background Images.
	- Currently Hex Map only (due to hex maps having finite bounds). In Map Settings, select an image from your vault as a background image. 
	- You may then select from a few presets for density which will fit in a certain number of hexes into the size of your image. You may also customize it freely. For now, the image will always appear based off of the exact calculated center of your grid.
	- This is kind of a new space for Windrose, but the hope is this gives people a nice lightweight way to have a version of their world map or something like that integrated against the rest of their campaign notes. 
- Settings. There are now both global settings (available via an optional Plugin install), and per map settings which will allow you to either override globals, or still set most things if you don't wish to install the plugin.
	- Global Settings Plugin: When you first load this new version, you'll be prompted if you want to install the Settings plugin. If you click yes, it will copy the plugin directly into your `.obsidian/plugins` folder. You will then be asked if you want to enable it. **This plugin is completely optional, and is only there for those who want to set global preferences**. You will not be asked again if you decline the install (unless you reinstall Obsidian/delete the data). You can find the settings in your Obsidian Settings --> Community Plugins --> Windrose MapDesigner Settings, just like you would any other plugin.
		- Future versions of the plugin which make changes to the plugin will prompt for an upgrade.
	- Per-map settings. A new Settings cog button has been added to the bottom of the Map Controls. Clicking this will open the per map settings modal. Here you can override any global settings, and also configure a few other default behaviors.
- Visibility settings. Another new button (an eye) has been added to MapControls. 
	- Clicking this button will toggle the visibility menu. This allows you to individually toggle the visibility of Objects, Text Labels, and Coordinates (hex maps only). Right now, these visibility settings are **per-session only** (they won’t persist across reloads). I can add a setting for this if there’s desire.
	- The “C” keyboard shortcut will always override this, but will restore whatever settings were previously there. This allows for quick “peeks” of the coordinates without disrupting your overall settings
- New unified selection toolbar.
	- Rather than awkwardly positioning actions on selected objects around the corners of the selected object’s bounding box, all actions now appear in a floating “toolbar” below the bounding box (should adjust to above if it would be cut off below).
	- New rotate action has been added to objects.
	- Explicit delete button has now been added to objects and text labels. Note that the DEL keyboard shortcut should still delete objects and text labels, as well as the erase label.
- Snap to Edges (GRID only). Objects can now be placed on orthagonal edges of a grid square, rather than only in the center.
	- Hold ALT while either dragging or placing an object to enable Snap to Edges mode. This will allow objects to be placed on a clicked edge.
	- When dragging, visual indicator will appear when Snap to Edges is active (4 arrows around object). 
		- Future version will offer indicator for placement mode.
	- On mobile/touch interfaces, long press an object when selecting it to toggle Snap to Edges mode. For now, Snap to Edges isn't supported when placing objects on mobile, due to lack of precision.

### Technical (Under the hood) Changes
- ”Geometry” now has a base class which both Hex and Grid extend from. This should hopefully help with preventing bugs, and further stability.
- Various minor optimization changes, code cleanup, etc.
- Improved JSDoc documentation and comments, (removing lots of unnecessary comments, adding missing JSDocs around complex functionality that ~~I’d otherwise forget because I’m bad at math~~ could be confusing.)

### Bug Fixes
- Fix for bug where Text Labels could disappear after editing the text on an existing one
- Partial fix for bug on iPad where canvas could have gone blank after Obsidian was partially garbage collected in background by iOS. Now theoretically takes longer to have an issue, and recovers slightly, but not entirely. **WORKAROUND: Swap to Reading Mode.**


## Version 1.0.5
A small surprise release, one new feature, one crash fix.

### Features
- Added new setting (global and per map) for grid line thickness. Right now that's a range between 1 and 5px (1 is default), and "interior" grid lines display at 50% of the total width.
  

### Bug Fixes
- Fix an intermittent crash  (`color.toUpperCase is not a function`) with creating and selecting a custom color when making a text label.

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
  
## Version 1.1.1
Bugfix release.

### Bug Fixes
- Fixed a bug where tooltips would always display as the first object placed, rather than the object actually hovered.
- Fixed an issue where Note links couldn't be saved to normal objects on hex maps.
- Fixed an issue preventing RPG Awesome icons from showing up
- Fixed a bug where objects on hex maps would sometimes "stick" to the mouse cursor after dragging and releasing the mouse.

## Version 1.2.0
Quality of life and bug fixes, mostly, with a couple new things.

### New Features
- Added "Duplicate" action for objects. This will copy all fields from the selected object and duplicate it into the nearest empty grid square.
- Added color customization to global settings plugin, similar to object customization. Add new default colors, delete/rename/modify existing ones.

### Improved
- Hex maps can now be defined by their size, using either an edge-to-edge or corner-to-corner value, which should translate to Windrose’s radius based system. Check it out in the Advanced tab, after setting an image background.
- Background offset is now much easier to see the changes off. A new “Image Adjustment Mode” is available, which will allow you to adjust the image offset in realtime relation to the rendered hex grid, using either mouse/touch, or arrow keys.
- Settings plugin now has collapsible sections and a search feature to make it easier to navigate.
- The Text Label feature will now remember your last used settings.
- The Map Settings modal is now adjustable in size and draggable. Size settings persist.
- Overall map settings UI polish.
- You can now specify a custom height for your Windrose containers in settings. Supports separate heights for desktop and mobile.
- You can now maintain separate object sets for grid and hex maps. Change the Map Type dropdown in the object customization settings plugin section, to swap between the set you’re modifying.

### Bug Fixes
- An issue where the Color Picker could sometimes get cut off by the edge of the Map Settings has been fixed.
- An issue where the Resize Warning dialog, when your resize of a hex map grid would result in losing objects, was firing entirely too often, has been fixed. The warning should now only show up when to go to click Save.
- An issue where the min/max font size for text labels fired too aggressively, making input of certain numbers difficult has been fixed.
- An issue where custom distances weren’t being used for measurements has been fixed.
- An issue where frequently the undo button would have to be pressed twice to undo a single change has been fixed.

### Technical changes
- MapSettings has had a big refactor, breaking it apart into a proper composed architecture with a Context for state management, like the main Map Canvas uses. It’s still not perfect, but this should make maintenance far easier as code paths will be clearer so my dumb ass will be less likely to introduce bugs.
  

## Version 1.3.0
### Features
- Z Layer support.
	- Create separate layers for your maps. Access the new Layers button in the map controls to show the Layer Controls. You can add an arbitrary (for now, can't promise how it'll do with a whole bunch) number of new layers and drag them to rearrange them (the rearranging will kinda look like it didn't work because right now the names of the layers are locked for now, but it probably did).
	- For now these only work in isolation (i.e. you can't "overlay" a layer over the top of another one with both visible). This is planned to change later. Consider this the MVP.
	- Right click (or longpress) a layer to show the context menu. For now you can only delete layers. You may not delete all layers.
	  
![Layers screenshot](docs/images/docs-layers-screenshot.png)	  
- Image exports. Go to the Preferences tab of map settings and scroll down. For now it's functional (in my testing at least), but very barebones (no customization). Images get exported to vault root.
- Fog of war
	- New Fog of War controls can be accessed through the Visibility controls (eye button in Map Controls, near Zoom). Paint, erase, area equivalents as well as fill/remove all controls to cover some or all of your map with fog of war. 
	- Supports custom color/opacity, but also you may specify a **tileable image** in your vault to use instead of a solid color.
	- Optional and adjustable "blur edges" feature to make the fog look more fog-gy. Disabled by default for performance concerns out of an abundance of caution, but honestly it runs fine even on my iPad. **If you do have performance issues with this, I'd love if you let me know, as there are likely further optimizations I can do.
	- Different Z layers can have their own fog of war.

![Fog of War on a hex map](docs/images/docs-fog-of-war-screenshot.png)
  
### Improvements
- Added an auto hide/show on hover (show on tap on mobile) for the map controls. since they were getting pretty long. and covering a lot of the map canvas.
	- If you hate this, you can disable Map Controls auto hide in settings by checking "always show map controls".
- Partially enabled the compass on Hex maps. It’s usable as a north indicator now at least. I kinda doubt most people are creating hex maps on a different orientation, so this is probably it unless someone _really_ wants to be able to rotate your hex crawl sideways on the fly.
- Multiple objects can now be selected at once. There's a new **multi select tool** in a submenu under the Select/Hand tool. A limited subset of actions are allowed on multi selections: dragging, rotation, and duplication. Feedback welcome.
- Global opacity now persists across reloads/per map.

  
### Bug fixes
- Edge-to-edge and corner-to-corner are now properly labeled in advanced hex grid sizing (unlike before when they were backwards).
- Hopefully fixed an issue where the object buttons in the Object toolbar were hard to read on Light mode themes.
- Moderately improved long press behavior on touch devices in Live Preview.
- Addressed a minor issue where the tool palette buttons could overflow on mobile.

## Version 1.3.1
Fast follow bug fixes.

### Features
- Plugin now adds an "Insert new map" command. Search the command palette for "Windrose" (or "map"). 
	- This technically makes the Templater script optional. I will continue shipping the Templater script for the next few releases at least. I may eventually phase it out of active release, but there's no reason at this point it can't keep working as an optional download, worst case.

### Improvements
- The hover color on selected object/text actions was using the `--background-modifier-hover` attribute, which was a bit _too_ transparent, given that the selection toolbar has no background behind the buttons. That's now using `var(--background-primary-alt, var(--background-secondary))` and will just be solid for now. 

### Bug Fixes
- Fixed an issue where the preview box for multi select was placing itself in reference to the wrong container after a refactor and would appear out of place.
- Fixed an issue where multi-selections were not clearing when a new tool was switched to.
- Fixed a regression on persisting Text Label settings.
- Fixed an issue where the selection toolbar could show up in the wrong position on some platforms.
- Fixed a regression with Text Labels not rotating with the "R" keyboard shortcut.
- Possibly fixed a longstanding issue where reloading Obsidian, or triggering a sync on another device when an object was actively selected could delete that object due to a race condition.

## Version 1.4.0
The "Pathfinding sucks" release. Not Pathfinder; Path _finding_. But this is a fun one, I think?

### Features
- You can now **generate random maps.**.
	- Grid only, these are dungeon maps, I have no idea what a random world map would look like asides noise (which for now is the dedicated "purpose" of hex maps).
	- Access via a new Plugin command "Generate random dungeon". Plugin only for now. Opens a modal that allows you to choose a size and name for your random dungeon, and then inserts it into your active note at your cursor.
	- At least attempts to place logical doors, and a few other objects. This is meant as a **baseline** though, something you can change and doodle on with the standard Windrose tools, rather than a full dungeon, ready to run.
	  

And a couple important notes:
1. This dungeon generation is pure math and graph theory, no AI involved. Windrose will **never** have AI features.
2. I realize that the plugin is becoming increasingly "mandatory", which it was not at first. I'm keeping a careful eye on this and working on formalizing a direction for the future. So far no one has vocalized a complaint, so I don't think it's a big issue with the current user base, but I am compelled to acknowledge the discrepancy between earlier words and current actions.
   

## Version 1.4.1
Whoops.

### Bug Fixes
- The map generation command actually works, now.
  
## Version 1.4.2
Random map enhancements and some maintenance refactors.

### Improvements
- Random map generation:
	- Chance for L/T shaped rooms
	- Make clearer distinction between Small/Medium map size.
	- New "Styles" selector. Don't expect too much from this, but it will give at least some interesting results:
		- Normal
		- Cavern: Larger chance of circular rooms or L/T shaped rooms, organic hallways, no doors.
		- Fortress: Large long hallways, large rooms.
		- Crypt: Shorter hallways, more secret doors.
	- New "Advanced" settings for Random Map generation to tweak the following variables
		- Chance of circle rooms
		- Room size (make larger or smaller rooms more/less common)
		- Loop chance: chance for multiple exits to generate for rooms.
		- Frequency of doors/secret doors
		- Chance for double wide corridors.
		- Straight vs "organic" hallways.
	- A little not very hidden "easter egg" on the Generate Random Map modal.

### Technical Changes
- Major refactor of settings plugin architecture, now using multiple templated files instead of one giant one. This shouldn't be particularly noticeable except for hopefully fewer bugs happening in the settings plugin. 
- Changed name of plugin to "Windrose MapDesigner", dropping "Settings". That was both weirdly wordy, and is also not quite as technically true. Mostly I hated how wordy it was.

## Version 1.5.0
Not many new features, but **major** behind the scenes work. Hopefully releases will be coming somewhat quicker and much more reliably from here on out (that's the hope at least).

### Features
- Partial cell painting is now supported in Grid (dungeon) mode.
	- Two new tools have been added:
		- "Paint Segments" in the draw tool submenu
		- "Diagonal Line" under the rectangle shape tool.
	- Cells can now be divided up into a subset of 8 triangles. This lets you draw diagonals, half cells, quarter cells, or other combinations.
	- The "Paint Segments" tool will allow you to paint one segment at a time. With a mouse, it will show a preview of the segment that will be painted. 
		- On touch devices, a new modal will pop up that will allow you to select which segments to paint (selections will persist, allowing for hopefully quicker drawing of multiple identical partial-cells).
	- The "Diagonal Line" tool will allow to to "fill" in the diagonal edges of a 45 degree set of full cells. I.e., you want a diagonal hallway, or room edge, and so draw it as a "stairstepped" pattern. Rather than needing to fill each of these diagonals 1 by 1, you can click at 1 end and then the other of the stairstep pattern, and this tool will fill the gaps to make it a smooth line.
- Size previews/overlays for shape tools.
	- The fill rectangle, fill circle, and clear rectangle tools now show a clear preview of exactly what area will be covered, with distance measurements (radius for circle) based off of your scale/measurement.
	- On touch devices this is still present, but is now a "3 tap" process similar to the way the distance measurement tool works. 1st tap places start point, second tap shows preview, third tap confirms.
		- I'll probably add a setting to swap between these behaviors soon, especially if anyone dislikes it.

### Bug Fixes
- Fixed a bug where the fill circle tool could create some odd shapes if defining the radius on a diagonal. The circle tool now always uses Chebyshev measurement (basically a diagonal always counts as the same distance as orthagonal).
  
### Technical Changes
- Windrose has been almost entirely rewritten/converted into TypeScript. This means better linting, actual interfaces and inheritance, and overall much easier maintainability (at the cost at some increased build/project complexity on my side, but c'est la vie).
- Alongside that, the Geometry system has been further standardized (both hex and grid now both return `Point(x, y)` coordinates), meaning that individual callers don't need to care what type of map it is, which should cut down on bugs where tools sometimes break randomly between hex/grid (often caused by forgetting to update the call pattern in one place).
- Added automated end to end testing via Playwright and [obsidian-testing-framework](https://www.npmjs.com/package/obsidian-testing-framework?activeTab=readme). Kudos to `@the.tablet` on Discord for her excellent library, and answering of questions.
- Added unit testing.
- Overall, many small cleanups, fixes, and tweaks that should hopefully stabilize the experience and make future iteration much quicker and safer.
  
  
## Version 1.5.1
Dungeon/grid enhancements continue.

### Features
- Deep linking
	- Added a "Copy Link" action to the selection toolbar on objects and text labels, that will copy a markdown link to your clipboard. You can paste this Markdown link into any other note in the vault with your map, and clicking it will open the note with the map (or focus it if already open) and zoom to focus on the linked object or label. This will work on both hex and grid style maps.
- Inter-map linking
	- Added a "Link to object" action to the selection toolbar on objects. Selecting this will put you into a link mode, until you either cancel or click another object. This object can be anywhere on the same map, even cross layer. Ideal for i.e. linking staircases.
- Enhanced layer system.
	- Layers opacity can now be adjusted. In the layer context menu, a new opacity control has been added. Adjusting this down will allow the layer beneath the current one to be partially visible. Only painted cells/edges are shown (no objects/text labels), and only the unpainted cells of the current layer will have reduced opacity. Primarily designed for creating a sense of visual alignment and connection between layers, but I'm sure you could do some other stuff with it if you wanted.
	- Layers can now be renamed and have custom icons added to them. A new Edit action has been added to the layer context menu, which will open a modal supporting these actions. Layer names are ellipsized at 25 characters, but can be as long as you want, and display a tooltip on hover. Icons are like Object custimization--paste unicode or choose from RPGAwesome icons.

### Improvements
- Selection toolbar now wraps into rows, as it was getting quite long.
- The default tool when first loading a map is now the Select tool instead of Draw. I guess debatably an improvement, but it made more sense to me at this point.
   
## Version 1.5.2
This one took a bit longer, but here we are.
### Features
- Additional object rotation options: objects can now be rotated to 45 degree angles. Objects are still rotated the same way (`R` on keyboard, or button in the selection toolbar).
- Several improvements/additions to the random dungeon generation.
	- Dungeon Stocking
		- When generating a dungeon, you may now choose to "stock" it with objects like enemies, traps, and treasure. 
		- You can adjust this with a series of sliders for overall percentage, and tune the percent chance of each type of object.
		- Optional "room styles": Barracks, Library, Shrine. Just a chance for some preset object combinations to show up as room types.
	- Diagonal corridors. Random dungeons can now have diagonal corridors (via the segmented cell feature). Chance is tuneable under settings
	- Water. Dungeons can now have "water", which is just blue painted tiles. Caverns have a chance of spawning underwater monsters and treasure if using Dungeon Stocking.

## Version 1.5.3
### New Features
- Add an “auto fog of war” option to the Advanced Section for map generation, which will place fog of war over everything but the entrance room. Remove fog of war tiles from the visibility menu accessed of of the Windrose map menu (hover the compass).

### Improvements
- Added option to reroll only dungeon stocked objects to the reroll button dialog. This will preserve the map layout but reroll objects.

### Bug Fixes
- Fixed hopefully a majority of the “floating door” bugs. In some cases, the fix for this is to generate edges to create clearer cut boundaries. This results in some thinner interior walls. This is technically a bandaid for a larger corridor carving issue, but I think it’s kind of interesting actually.

## Version 1.5.4
### Bug Fixes
- Fix an issue where the secret doors placed as part of the "open isolated rooms" loop did not respect secret door quota/setting from initial generation.
- Fix an issue where when rerolling only objects on a generated map, entrance/exit stairs got lost.

## Version 1.5.5
This was a quick one because I realized that I had almost all the functionality to use Windrose as a battle map (if you wanted, it wouldn’t be my first choice, but).

So you can now add a background to grid maps (import your map), add new objects with actual images (for character portraits). And with the ability to tie notes to objects, you can reference a note for each character or what have you, and have access to it on hover.

### Improvements
- Objects can now be created (or edited to use) with custom images. The image must be in your vault, and should be PNG or WEBP. There is now a third tab in the New Object modal (all of this is in the settings plugin) which will let you use an image vs pure unicode or RPG Awesome icons.
- Backgrounds can now be added to grid maps (vs just Hex before). You can configure the grid size here, and adjust it the same way you could hex ones in order to align Windrose’s grid with any grid that may be preexisting on the image.

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


## Version 1.5.7
### Bug Fixes
- Fixed an issue where un-closed freehand curves couldn’t be erased or modified. For now, using an erasing tool on any part of an open curve will erase the whole thing.

## Version 1.5.8
Some freehand polish, some new flexibility for objects, and the beginning of proper Obsidian API integration.

### New Features
- Freeform object placement.
	- Objects can now be "unlocked" from their grid cell, allowing free world-space movement similar to how text labels work. Hold Alt+Shift and click to place an object at an arbitrary position, or use the new toggle in the selection toolbar to convert an existing object between grid-anchored and freeform.
	- Freeform objects use diamond-shaped selection handles to visually distinguish them from grid-anchored ones.
	- Dragging freeform objects uses continuous world-space movement rather than snapping to grid cells.
- Per-map object set selection.
	- You can now swap which object set is active on a per-map basis, right from the map settings. No more being locked into a single global set across all your maps.
- Obsidian API integration.
	- Windrose now hooks into native Obsidian APIs via the companion plugin for a handful of UI elements. Note linking, text label editing, and parts of the map settings modal now use native Obsidian modals (with autocomplete, native color pickers, etc.) when the plugin is installed.
	- If the plugin isn’t installed or something goes wrong, everything falls back to the existing Preact-based UI, so nothing should break.

### Improvements
- The "close" indicator for freehand shapes is now much more visually obvious, making it clearer when your shape is about to snap shut.
- Rectangle-style tool previews (size overlay, affected area highlight) have been extended to the area select and clear rectangle tools, not just fill rectangle/circle.
- Added a new visual overlay (diamond indicator) when holding Alt+Shift on a selected object to indicate freeform placement mode, matching the existing arrow overlay for Edge Snap (Alt).
- Image Adjustment Mode on grid maps now includes a grid size control, making it easier to align Windrose's grid with a pre-existing grid on your background image without needing to bounce back and forth between tabs.

### Bug Fixes
- Fixed an issue where the rectangle tool and clear area tool preview was offset from where it should have been.
- Fixed a bug where freehand shape interiors weren’t scaling properly with zoom, causing visual misalignment at non-default zoom levels.
- Fixed a bug where freehand shape borders wouldn’t visually merge with adjacent freehand shapes the way painted cells do.
- Fixed a bug where freehand shapes would lose their fill color and turn black when the compass was rotated to East or West orientations, particularly when abutting normal painted cells.
- Fixed the Edge Snap overlay (the one that appears when holding Alt on a selected object) which was, to put it generously, completely busted.
- Fixed several bugs with background image handling in Image Adjustment Mode, particularly around interactive repositioning not behaving correctly.
- Fixed a bug where the layer menu could obstruct clicks.

## Version 1.5.9
A "quick follow-up" to 1.5.8, mostly cleaning up rough edges from recent features. (Computer hardware issues among other things caused this one to lag, so thank you for your patience)

### Improvements
- The eraser tool now prioritizes freehand curves over painted cells, since curves render on top visually. Previously you'd have to erase the cell underneath before the curve would go away, which felt backwards.

### Bug Fixes
- Fixed the color picker (and tool sub-menus) dismissing themselves immediately when clicked on desktop in some cases. The click that opened them was also triggering the "click outside to close" handler.
- Fixed the layer menu's invisible bounding box blocking clicks on a large area of the map, even when the menu was collapsed.
- Fixed clearing a background image not actually persisting when you saved. 
- Overall hopefully tightened up the new Obsidian native modals.
- Fixed the freeform/grid toggle in the selection toolbar not updating after converting an object via Alt+Shift drag.  
- Fixed a shape preview offset on grid maps caused by a quirk in how default parameters get handled in the compiled bundle.
  
## Version 1.5.10
Bugfix release. Looks like the native obsidian stuff wasn't working properly in 1.5.8, and became entirely broken in 1.5.9, breaking in particular the Map Settings modal pretty egregiously. 

This should now be addressed.

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

## Version 1.6.0
And finally, the long promised beginning of the “hex maps” releases is here! Just like 1.5.x was the “dungeon release”, I plan to do several point releases focused around hex maps. Some of it will doubtlessly affect grid maps as well, and bug fixes will be unaffected, but for now, here’s the first release of new hex map functionality.

Also, I’ve started work on what will likely become a very re-imagined README.md (the frontpage of this project on GitHub), as well as the basis for more detailed actual docs. For now, that is a Feature List, providing a full list of what functionality WindroseMD supports, as that list did not exist anywhere in one place. 

That is also now linked from the top of the README, just so it’s findable. I’ll be fleshing out all the documentation and promo stuff over the next few releases, so keep an eye out for that.

### New Features
- Radial hex maps
	- Hex maps can now be rendered radially, rather than needing to rely only on a radial coordinate overlay on a rectangular grid.
	- This can be adjusted in **Map Settings**.
	- For now, radial coordinates on a rectangular grid are still supported. This may change, as that was more of a shortcut/bandaid until the feature was formally added.
- Regions
	- **Regions** are a new layer/construct for hex maps, which allow you to declare one or more hexes as a region, each of which will have their own color and label, making them distinct “zones” of your hex map.  All tools should work as normal with them.
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
	- When in a sub-map, you can understand where you’re at with the new breadcrumbs view, located between the map name and the tool palette. 
	- Sub-maps can be re-named by changing the name of the map when viewing one.
	- In theory, you can nest infinitely, but I’ve only tested about 3 deep.
	- Hexes with sub-maps indicate that they have one with a diamond icon in the center of the hex. This will only show up if you have made changes to a sub-map/the sub-map has data. 
	- By default, sub-maps will show up as radial maps, with a size of 7 rings. This can be adjusted in the Map Settings menu the same way you would for changing the size/style of a top level hex map.
	- Each sub-map is essentially its entirely own instance of Windrose for now, which means that settings should be individually adjustable for each layer. This will probably be modified at least slightly, for UX clarity if nothing else going forwards.

### Improvements
- The Tool Palette has been slightly reorganized. 
	- The clear rectangle tool has been moved into a group with the Eraser
	- Fill circle, Fill rectangle, and Diagonal fill have been consolidated into a single group
	- “Edge line” has been removed from the fill rectangle sub-menu (not sure why that seemed like a good idea at the time) to become its own top level tool. It has also been renamed to “Paint Line” which I think is a bit clearer.
- As alluded to above, I’ve introduced a new Context menu pattern, using Obsidian’s native context menu API. For now this is just being used for hex map regions/sub-maps, but the pattern will likely be used in some other places going forwards, or backported to places that used different UIs. Let me know what you think.

### Bug Fixes
- Fixed some UI bugs with the Map Settings modal
- Reverted out the non-functional fix for the Color Palette automatically closing itself right after it opened on Linux, as that didn’t fix the bug, and introduced a new issue where the Color Palette couldn’t be closed by clicking outside of it. You can now once again close the palette by clicking outside of it.

## Version 2.0.0

It's here. Windrose MapDesigner 2.0.0 — the standalone release — is final. No Datacore dependency, no preview label: install and start mapping. If you're coming from 1.7.x, your maps and settings migrate automatically on first load, no manual steps. This entry consolidates the 2.0.0-preview line (see those notes below for the full conversion story) and everything shipped since.

### Standalone Plugin
- Windrose is now a standard Obsidian Community Plugin. Everything from v1.7.0 was preserved through a ground-up conversion: full light mode support, native Obsidian modals throughout, and a deep-link system that works in Reading, Live Preview, and full-pane views.
- **First-run survey** — On a fresh install, Windrose asks how you plan to use it and tailors which features are visible. Nothing is ever locked away: every feature has a toggle in settings (Settings → Windrose MapDesigner → Features), so you can start simple and turn things on as you need them. Upgraders get a What's-New notice instead and keep everything enabled.

### Tiles, Everywhere
The tile system grew from a hex-only experiment into the heart of this release.
- **Tiles on grid maps** — Tile placement, previously hex-only, now works fully on grid maps: named tile layers, depth tiers, and brush painting tools.
- **Subtool ribbon** — Tile placement now has proper subtools in the drawer: **Paint** (grid-snapped), **Stamp** (freeform world placement), **Scatter** (jittered stamp brush), **Flood fill**, **Terrain brush**, and **Line** (couples to the wall tool). Per-subtool footer options cover brush size, softness, and edge blend.
- **Terrain brush** — Paint soft-edged, world-space terrain strokes using seamless textures. Terrain strokes share a region mask with region fills, blend at their edges (verified working on iPad), and support undo like everything else.
- **"Add tiles" import wizard** — A 3-step wizard (Source / Tiers / Tags) for importing tile folders from your vault, with automatic render-mode and footprint detection at import time. Dungeondraft packs flow through the same wizard.
- **Dungeondraft pack import** — Import `.dungeondraft_pack` files directly: assets are extracted into your vault with their tags mapped, terrains imported as seamless textures, and pack categories merged with your existing library.
- **Smart tile detection** — Windrose now distinguishes cell art (a door, a chest) from seamless region textures (grass, water) per tile, and detects multi-cell footprints (that 2×3 building places as 2×3, not squeezed into one cell). Per-tileset pixel density is configurable, and every prediction can be overridden per tile via Organize Mode.
- **Redesigned tile browser** — The tile drawer was rebuilt end to end: depth-tier bar, cross-pack category merging, pack and tag filter chips with a full filter drill-down screen, grid/list view toggle (persisted per map), Recent and Starred views on the ribbon, organize mode for bulk tagging/tiering/moving, and a virtualized thumbnail pipeline that stays smooth in libraries with thousands of tiles.

### Walls & Paths
- **Wall and path tiles** — Draw textured walls, fences, and paths along polylines: click-click placement with a live textured preview, drag while placing to bow a segment into a curve, and a full edit mode to select, drag, bow, insert, and delete vertices after the fact. Joints are miter-clipped so angled runs render contiguously. Wall controls live in the drawer footer next to the transform options.

### Boards, Strata, and Layers
- **New layer organization** — Layers are now organized as Boards → Strata → Layers. A board is a whole place (the tower, the dungeon), strata are its floors, and layers are the drawing surfaces within each floor. The Layers dock has a Simple mode (boards only) and a Strata mode for full control, plus a board switcher dropdown. Existing maps migrate automatically.
- **Show floor below** — A board-level ghost option renders the stratum beneath your working floor at reduced opacity — draw the second floor while seeing the first.

### Full-Pane & UI
- **Rebuilt full-pane chrome** — Vertical tool palette with subtool flyouts, unified tiles/objects drawers with shared header chrome, collapsible dock, and a folding left rail in embedded (note) mode that switches between Layers, Colors, and View panels without crowding the canvas.
- **Map deletion** — Delete a map from the full-pane view, with a confirmation speedbump and a persistence-layer guard that prevents a pending autosave from resurrecting the deleted map.
- **Tablet pass** — Touch targets, header controls, and drawer chrome all got explicit iPad sizing.

### Performance
This cycle included a deep performance investigation after a reported iPad slowdown, which turned into a systemic cleanup:
- Root cause fixed: a full-resolution fog-of-war texture was being pattern-filled every frame. Fog patterns are now downscaled and cached.
- Panning now blits a cached static-layer image instead of redrawing the map each frame.
- Canvas renders are coalesced per animation frame; cell rendering is viewport-culled; grid passes batch into single Path2D fills.
- Fixed a save storm where a full-file save fired per pan/draw event; saves are compact JSON now.
- The tile thumbnail pipeline no longer re-scans the library on every interaction.
- Wall edit-drags render ephemerally instead of re-rasterizing the strip per frame.

### Bug Fixes
- Hex tile art snaps to the cell orientation when a tileset's art doesn't match your map's (pointy vs flat).
- Terrain textures no longer develop crosshatch artifacts at far zoom on iPad (WebKit pattern minification — mip-chained texture sources).
- Dungeondraft pack tileset names resolve from the installed-pack registry instead of raw folder names.
- Drawer buttons and selects no longer inherit broken chrome from the host theme, on desktop or tablet.
- Paint stroke integrity fixes: batched strokes undo as one action, flood fills are bounded, and edge blend captures per placement instead of per tile.
- Many more small fixes across the preview line — see the preview entries below.

### Under the Hood
- **Zero-warning lint gate** — The entire codebase now passes ESLint with `--max-warnings 0` (from ~750 warnings), including the full react-hooks/exhaustive-deps cluster, enforced by a pre-commit hook.
- **Release-prep audit** — A final dedup/SRP pass removed a net ~1,400 lines: shared layer handler registration, one viewport transform, decomposed panel components, and typed test fixtures throughout.
- **Persistence hardening** — Map saves serialize through a mutex with validation and refuse-to-overwrite guards; a recovery utility exists for truncated data files.
- **1,748 unit tests** and a modernized E2E suite running against real Obsidian.

## Version 2.0.0-preview4

### Bug Fixes
- **Migration not firing on first install** — Settings migration from the old Windrose MapDesigner plugin now runs before initial settings load, preventing a race condition that could permanently skip the import. Migration guard relaxed so that empty or stub data files no longer block it.
- **Manual settings import** — If migration was missed (e.g., the old plugin was disabled after installing standalone), a new "Import" button appears at the top of plugin settings when old plugin data is detected. Imports object sets, custom objects, and overrides without overwriting current settings.
- **Confusing conflict notice** — The "old plugin still active" warning now uses the correct display name "Windrose MapDesigner" instead of the internal folder name.

## Version 2.0.0-preview3

### New Features
- **Content pack system** — Browse and download content packs from a central registry directly within Windrose. 5 packs available at launch. Browse buttons in Object Types and Fog of War settings sections.
- **Fog texture management** — Installed fog textures now appear in both global settings (with set-as-default and remove) and per-map settings (as clickable rows for quick selection).
- **New map button** — Create a new map directly from the full-pane view header. The "+" button next to the map picker opens a lightweight name/type dialog and loads the new map immediately.

### Improvements
- Map settings modal content now scrolls properly while save/cancel buttons stay pinned at the bottom.

### Bug Fixes
- **Floating panels overlapping iPad sidebars** — Pop-out panels in the full-pane view no longer stack above Obsidian's slide-out sidebars on iPad.
- **Object set picker referencing old plugin ID** — Per-map object set selection was reading from the old Datacore-era plugin ID, making it impossible to swap object sets on a per-map basis. Now correctly reads from the standalone plugin.

## Version 2.0.0-preview2

This release adds a new full-pane map view for working with maps outside of note embeds, complete with a Photoshop-style dockable panel system.

### New Features
- **Full-pane map view** — Open any map as a full Obsidian tab via the compass ribbon icon or the "Open map in full pane" command. The canvas fills the entire content area with no fixed-height constraints.
  - **Dockable panel system** — Right-side dock with collapsible panels that can be popped out into floating, draggable windows. Float/position state persists across reloads.
    - **Layers** — Row-based layer list with inline rename, visibility toggle, delete, and expand-to-edit. Drag reorder support.
    - **Colors** — Swatch grid with opacity slider. Color button in tool palette redirects to floating picker.
    - **View controls** — Zoom, layer visibility toggles, fog of war tools (paint/erase/rect/fill/clear).
    - **Tile browser** — Embedded tile asset browser with empty-state UI and configure button.
  - **Map picker** — Header dropdown to switch between all maps without leaving the view.
- **Insert Map modal** — The "Insert new map" command is now "Insert map." The modal shows existing maps on top for quick code block insertion, with the create-new section below.

### Improvements
- Map name from code block YAML now applies as a fallback for maps that don't have a stored name.

### Bug Fixes
- **Theme color corruption** — Grid line and background colors were being permanently corrupted when switching themes. The resolve functions were called in the write path, persisting theme-specific values to disk. Now stores raw sentinel values and resolves only for display.

## Version 2.0.0-preview — Standalone Plugin

Windrose MapDesigner is now a standalone Obsidian Community Plugin. No more Datacore dependency — just install and go. This release represents a ground-up conversion of the entire codebase while preserving every feature from v1.7.0.

**Your existing maps will migrate automatically.** On first load, Windrose imports your settings and locates your data files from the previous installation. No manual steps required.

### What's New
- **Standalone installation** — Standard Obsidian Community Plugin. No Datacore required. For now, try it out with BRAT! Official store entry coming Soon.
- **Light mode support** — Despite some previous attempts to better support light mode, it was never really fully functional. Windrose should fully respect your Obsidian theme, including light mode. Includes new default light mode colors for the map canvas itself as well.
- **SCSS pipeline** — Styles are now compiled from 22 SCSS partials, making the 6,500+ line stylesheet maintainable.
- **CSS modernization** — OKLCH colors, container queries, `:is()` selectors, standard scrollbar styling, `prefers-reduced-motion` guard, `!important` fully eliminated.

### Improvements
- All modals now use native Obsidian Modal class directly (no Preact-in-native hacks).
- Settings tab fully decomposed: 7 helper modules, 12 modal classes, 6 tab render mixins. This should be functionally the same, but FAR easier to maintain.
- Migration bridge: auto-imports settings from old plugin, scans vault for existing data files, warns if old plugin is still active.
- Deep link system fully standalone: protocol handler, markdown post-processor, CM6 Live Preview extension, DOM fallback.

### Under the Hood — The Conversion

This release is the result of a comprehensive conversion and audit of the entire codebase.

**By the numbers:**
- **55,500+** lines of source code across 8 domain directories
- **5,130** lines of type definitions across 35 files
- **53** custom Preact hooks
- **1,233** unit tests across 36 files (~3.5s)
- **126** E2E tests across 23 files (real Obsidian via Playwright)
- **66** commits on the conversion branch
- **52** JavaScript files eliminated (31 dead templates deleted, 21 converted to TypeScript)
- **~13,600** lines of JS converted to strict TypeScript
- All **5** strict TypeScript flags enabled, **0** type errors, **0** ESLint errors
- **8-phase code audit**: 100+ unsafe casts eliminated, 4 hooks extracted, 5 stale closures fixed, ~1,400 lines of dead code removed. This is everything required by the Obsidian team, and more.
- `window.__windrose` bridge fully eliminated (was 419 lines)
- **CSS**: ~180 `rgba()` calls → OKLCH, 49 `!important` → 0, 283 inline styles → CSS classes. Windrose should now be fully customizable via standard CSS snippets without having to resort to odd hacks.
- **Build**: 803 KB minified `main.js` via esbuild (was a 1.2MB+ interpreted Datacore script)

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