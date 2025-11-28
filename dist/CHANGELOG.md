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