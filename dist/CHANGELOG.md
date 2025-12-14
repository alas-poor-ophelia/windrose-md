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