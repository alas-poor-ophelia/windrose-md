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