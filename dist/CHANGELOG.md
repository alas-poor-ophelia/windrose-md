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

## Version 1.5.0.1
### Bug Fixes
- Fix issue where diagonal fill tool wasn't working because I forgot about it when refactoring the event coordinator.
- Fix a visual bug where external borders were drawn in place of internal borders for some sets of segmented cells due to a coordinate mismatch.
