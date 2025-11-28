# Tracker
 ```datacorejsx
const { DungeonMapTracker } = await dc.require("Projects/dungeon-map-tracker/DungeonMapTracker.jsx");

return <DungeonMapTracker mapId="my-test-map" />;
```

---
# Specs
A project (in Datacore) to allow for easier mapping of dungeons. At its heart its a pannable grid view, with each grid representing a 5x5 ft square just like a classic battle map, wherein parts of the grid can be selected/filled in to easily represent rooms in a dungeon as the party explores it.  

Core Features:
- Clicking individual grid spaces one at a time should “fill in” that square, marking it as a room/part of one. 
- Adjacent filled squares are considered connected
- A “room” button which allows for rooms to be created by clicking corner to corner.
- The ability to write the current state to a file as either YAML or JSON.
- Tapping a filled in square should unselect it.
- Architected in such a way that eventually multiple layers will be supported (i.e. placing objects in rooms)
- Each ”block” in a note should only be one map, and a note should be able to contain multiple maps.
- We may want to use Templater (or more DC commands) to allow for easy insertion of a new map block.

Enhancements:
- Zoom in/out
- Outlines for walls
- Limited “object” placement, which will sit “atop” the filled square. Maybe a set icon/letter/appearance for things like doors, and a few auto defined things (thinking literally just letters or at least Unicode, don’t want to mess with importing images). I.e. `T` for trap, etc.
- Tooltips over objects
- Adding combat encounters that link to note blocks.   

# Template Test
> [!dungeon-map]- Russian Circles
> %% Install Datacore plugin to use me (more instructions in Readme) %%
> ```datacorejsx
> window.__dmtBasePath = "Projects/dungeon-map-tracker";
 const { DungeonMapTracker } = await dc.require(dc.resolvePath("DungeonMapTracker.jsx"));
>
> const mapId = "map-1760981753959-h5i7amso4"
> const mapName = "Russian Circles"; 
> 
> return <DungeonMapTracker mapId={mapId} mapName={mapName} />;
> ```

# Hex Test
```datacorejsx
window.__dmtBasePath = "Projects/dungeon-map-tracker";
const { DungeonMapTracker } = await dc.require(dc.resolvePath("DungeonMapTracker.jsx"));

return <DungeonMapTracker
  mapId = "test-hex-combined-6" 
  mapName = "Test Hex Map (Flat)"
  mapType = "hex" />;
```
```datacorejsx
window.__dmtBasePath = "Projects/dungeon-map-tracker";
const { DungeonMapTracker } = await dc.require(dc.resolvePath("DungeonMapTracker.jsx"));

return <DungeonMapTracker
  mapId = "test-hex-pointy7" 
  mapName = "Test Hex Map (Pointy)"
  mapType = "hex" />;
```

 ```datacorejsx
window.__dmtBasePath = "Projects/dungeon-map-tracker";
const { DungeonMapTracker } = await dc.require(dc.resolvePath("DungeonMapTracker.jsx"));

const mapId = "map-1762393926115-1cypezh32"
const mapName = "Expand Test"; 
 
return <DungeonMapTracker mapId={mapId} mapName={mapName} />;
```

> [!dungeon-map]- TEst
> %% Install Datacore plugin to use me (more instructions in Readme) %%
> ```datacorejsx
>const { View: DungeonMapTracker } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "DungeonMapTracker"));
>
> const mapId = "map-1764308324792-kjnfu642v"
> const mapName = "TEst"; 
> const mapType = "hex";
> 
> return <DungeonMapTracker mapId={mapId} mapName={mapName} mapType={mapType} />;
> ```
# Changelog
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
- 

### Technical (Under the hood) Changes
- ”Geometry” now has a base class which both Hex and Grid extend from. This should hopefully help with preventing bugs, and further stability.
- Various minor optimization changes, code cleanup, etc.
- Improved JSDoc documentation and comments, (removing lots of unnecessary comments, adding missing JSDocs around complex functionality that ~~I’d otherwise forget because I’m bad at math~~ could be confusing.)

### Bug Fixes
- Fix for bug where Text Labels could disappear after editing the text on an existing one
- Partial fix for bug on iPad where canvas could have gone blank after Obsidian was partially garbage collected in background by iOS. Now theoretically takes longer to have an issue, and recovers slightly, but not entirely. **WORKAROUND: Swap to Reading Mode.**



