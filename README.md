WIndrose MapDesigner (WindroseMD) is a simple TTRPG-focused mapping tool for Obsidian, built on [Datacore](https://github.com/blacksmithgu/datacore). It started as something like graph paper in Obsidian and then... grew? Supports both traditional grid based maps as well as hex maps, with a bevy of customization options, an emphasis on (what I think is) thoughtful design, and first class mobile/touch compatability.

Low tech enough to run in your text editor, high tech enough to... make you forget you're in your text editor?

![Full Interface](docs/images/main-ui-docs-screenshot.png)

"Windrose" is an obvious reference to a compass rose, a visual object I've always had a fascination with. If anything, the marketing copy is that it speaks to the "care in design" I put into this project, but really I just liked the name, and like compass roses (and am not a designer). Feel free to refer to this project as just "Map Designer" if you want--above all I want this tool to be useful. 

## What It Does

Draw dungeons or world maps cell-by-cell (or rectangle by rectangle (or circle by circle)), drop in objects for doors and traps and treasure, add your own text labels (with fonts!), and of course link things to your notes (remember? We're in your text editor). Designed to work in Reading mode, Live Preview, inside callouts, etc.

With release 1.0.0, Windrose now supports hex maps as well (pointy/flat/radial coordinates/background image support). Hex is still a work in project which will be iterated on in the very near future, but I'm excited to share what I have

Touch is first class for Windrose. It is designed to be usable on tablets with touch—pan around, pinch to zoom, tap to place things. And it's at least somewhat performance.

That said, it also works fully on desktop Obsidian, with the added convenience of keyboard and mouse shortcuts.

## Features

**Drawing**

- Paint cells with customizable colors (and opacity)
- Rectangle and circle fill tools
- Erase tool (or clear entire areas if your artistic vision is scuffed/a cat walks on your keyboard)
- 50-level undo/redo (for when the cat walks on your keyboard a lot)

![Drawing Tools](docs/images/drawing-tools-docs-screenshot.png)

**Hex Maps**
- Supports both pointy and flat-top hexes, configurable in global settings as a default.
- Set a size for your grid.
- Display coordinates.
- Coordinates can be configured to display as the default rectangle, or set to display a radial hex grid. Full radial/center out support coming soon.
- Up to 4 objects allowed per hex, for any regions with multiple points of interest.
- Supports background images. Select any image from your vault, and how many hexes you want to divide it into (with presets, as well as full customization).

![Hex Map](docs/images/hex-map-docs-screenshot.png)

**Objects**
- ~40 object types across categories: navigation (doors, stairs, portals), hazards (traps, pits), dungeon features (chests, altars, furniture), encounters (monsters, NPCs, bosses), and general markers.
- Full object customization: Rename, rearrange, delete, change the icon of any default object, as well as adding your own custom objects and categories. Supports any unicode character (so long as you have a supporting font), as well as the bundled RPG Awesome icon set.
- Resize objects, rotate them, change their scale, change their colors (including being able to assign custom ones), add notes, forget what the heck ♅ means (don't worry, there's tooltips). You can also move them around.
- Maintain separate object listings for Hex and Grid maps.
- Export and import icon sets to make easy backups, or share your vision with others.
- Objects can be placed in the center of a grid space, or hold ALT while placing or dragging an object to enter Snap to Edges mode, which allows you to place objects on grid lines.
- Link any object to an Obsidian note—hover to preview, ctrl/cmd+click to open

![Map Objects](docs/images/objects-docs-screenshot.png)

**Text Labels**
- Place labels anywhere—no grid limitations
- Drag, rotate, edit in place
- Customize font, color, size, etc etc (with live preview)
  
**Map Layers**
- Add multiple layers to your map, to represent different levels, alternate states, whatever you want.

![Layers screenshot](docs/images/docs-layers-screenshot.png)

**Fog of War**
- Add fog of war to your hex or grid maps, using either a color of your choice, or import your own tileable image from your vault.
- Optional and configurable edge blurring effect makes for a more immersive fog effect.
- Add or remove fog from individual cells, fill areas, or add or remove fog from the entire map.

![Fog of War screenshot](docs/images/docs-fog-of-war-screenshot.png)

**Navigation**
- Space+drag or two-finger pan (or hold scroll wheel)
- Scroll wheel or pinch to zoom
- Rotate the whole map (the "Windrose") 

**Configuration**
- Comes with its own optional plugin, which can be installed and updated with the click of a (couple) buttons. This plugin allows you to set global defaults for things like colors, hex map orientation, etc. It is 100% optional, and you will not be asked again if you decline. 
- Each map has per map settings, including local overrides for any global settings, fiddly UI preferences you probably won’t need, and additional hex map options to configure size or background image. 

## Installation
Windrose is distributed as a “[compiled](https://github.com/alas-poor-ophelia/datacore-compiler/)” Datacore script, which just means it’s been all packaged up in a single Markdown file, for nice and easy use.

**NOTE**: As of version 1.3.0, an example royalty free fog of war image is included with the release. Feel free to use this, or find your own.  *(credit for tile goes to "Finding-The-Time" on DeviantArt)*

**IMPORTANT: As of version 1.1.0, the extra fonts are included as a separate file in the zip which must be added to your CSS snippets. This is to keep vault size down if you don't care about the extra fonts, allow better support inside the plugin, and allow easier customization for new fonts (more relevant for future releases.)

There is also an optional but STRONGLY recommended Templater template included. All it does is just give you a shortcut to insert a new map, but it makes that process effortless, something which can otherwise be fiddly. But also completely optional.

1. Download the latest release from the Release page.
2. Copy `compiled-windrose-md.md` anywhere into an Obsidian vault, and the optional (but strongly recommended) Map Designer Template into your Templater templates folder (if using).
3. Install Datacore and Templater (if using) from Community Plugins.
4. **Optional**: copy fog of war image to somewhere in your vault, if you plan to use it.
5. Note that on its first run, Windrose will create a `windrose-map-data.json` file in your vault’s root. You may move this file wherever you want in your vault, but you may only have one file of this name in your vault, and this will hold all your map data, so don’t lose it.

## Usage

1. Run Templater template  (or copy/reference demo block from compiled script)
2. Choose a name for your map, and a type (Grid or Hex)
3. Accept or decline plugin installation
	3a. Enable plugin if installed (or you may enable later, as any plugin).
4. Start mapping!

## Thanks to
Blacksmithgu for creating Datacore, and making it easy enough to trick myself into thinking that learning React was a good idea.

Many members of the Obsidian TTRPG discord, including:
- BloatedBlowfish
- Coehoorn
- 36457453746
- LastElf
- And many others, especially those who goaded me into and taught me about hex mapping.

And my DM, who got me excited about both TTRPGs, but also having fun with software dev again.