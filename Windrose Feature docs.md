# The Plugin
Although WindroseMD is itself a datacore script, and not technically a plugin, it does ship with and install its own plugin to manage settings, and better integrate into Obsidian. Although once mandatory, the plugin is now required, due to an increased reliance on Obsidian’s own APIs.

The plugin has a rich settings menu, offering many global defaults and customizations to be changed.

The plugin has these sections:
 - Hex Map Settings
 - Color Settings
 - Color Palette
 - Fog of War
 - Map Behavior
 - Distance Measurement
 - Object Types

## Plugin Commands
With the plugin installed, Windrose has a couple global commands.

- Insert new map
- Generate random dungeon

## Installation and Updates
You will be prompted to install or update the plugin when you load WindroseMD for the first time, or after updating Windrose.

# Map Types
Windrose has two different styles of maps: 
- Grid: square grid, i.e. for dungeons
- Hex: Hexagonal layout, radial or offset (“rectangular”), i.e. for world maps

# Features
### What Windrose Is
- Graph paper in Obsidian, a flexible grid you can draw layouts for dungeons or worlds in, and add objects atop. Within this, there is a lot of flexibility, for instance, import an image of a pre-made map to a grid map, import images of your party and monsters for **object** icons, and link those objects to player or monster notes, and you have a battlemap.
- A preliminary tool that can you start a design in, and then **export as an image** to trace in an external application like Dungeondraft (and then you could move the finished map back as a background if you wanted).

### What Windrose Isn’t
- A full map design tool like Dungeondraft. New features are always getting added, and some will continue to take it closer, but it’s simply not practical to reinvent the entire wheel inside Obsidian.
- A Leaflet/TTRPG Tools: Maps replacement. Although much of the functionality is supported, WindroseMD is primarily intended to be a design and planning tool, rather than a live record of your world, and thus has more limited tools around travel, distance, pin visibility, etc. This may be expanded in the future, but will never become the main focus, as other plugins do this much better.

## Tool Palette
When it comes to creating or modifying a map, the Tool Palette contains most things you need. It is located below the map name box in any Windrose block. It has these tools. Some tools may only appear on grid, not hex, and vice versa

- **Select** tool group 
	- **Select** tool: move or modify the map or contents
	- ** Multi-select** tool: Select multiple objects or text labels in an area
- **Draw** tool group
	- **Paint** tool: Color in an individual cell with selected color
	- **Paint segments** (**GRID ONLY**): Paint segments of a single cell. Subdivides a cell into 8 triangular subsegments. Allows for half, quarter, or smooth diagonals.
	- **Paint edge** (**GRID ONLY**): Paints an “edge” (paint over grid lines) with selected color. Use for custom borders, etc
	- **Freehand** tool: Create non-grid locked polygonal shapes
- **Color palette**: Select or create new colors to use in your maps. Colors can be defined globally in settings plugin.
- **Eraser**: erase things. Affects most map contents
- **Region** tool group (**HEX ONLY**)
	- **Paint region**: Define a new map region cell by cell.
	- **Select region**: Define a new map region by selecting a polygon. Double click to close.
- **Fill** tool group (**GRID ONLY**)
	- **Draw rectangle** tool: Draws a rectangle, corner to corner. Uses selected color.
	- **Edge line**: Paints an edge in a line, point to point.
	- **Diagonal fill**: 
- **Fill circle** (**GRID ONLY**): Draws a “circle”, center to radius. Used selected color.
- **Erase rectangle**: Erases contents of selected rectangle.
- **Place object**: Place “Objects” on the map—used for any dungeon stocking, world landmarking, etc. Think doors, traps, mountain ranges, forests. Places currently selected object from object sidebar.
- **Text Label**: Create a text label on the map. Configurable size, color, font.
- **Measure**: Measures from point to point, using defined cell size. Units configurable globally or per map.
- **Undo**: Undoes last action. Remembers up to 50 actions, does not persist on Obsidian restart.
- **Redo**: Redoes undone action. 

## Map Controls
### The Windrose
The Windrose is a compass icon, located in the top right of a WindroseMD block’s map canvas. Clicking it will change the compass orientation. On a grid map, this will rotate the actual map orientation. On hex, it’s purely aesthetic/informational.

By default, hovering the Windrose will show the map controls. These can be toggled to be always on in the Map Settings.

### Map Controls
The Map Controls offer a set of controls and sub menus for modifying the way you’re viewing a map. The following options are present:

- **Expand map** button: Expands the WindroseMD block to take up the full width of the note its in.
- **Zoom controls**: Zoom from 10% to 200%. Zoom can also be controlled with scroll wheel or a two finger pinch.
- **Layers**: Shows the Layer submenu.
- **Regions** (**HEX ONLY**): Shows the Region submenu
- **Visibility**: Shows the visibility controls. Toggle different parts of the map display on or off. Also contains **Fog of War** controls.
- **Map Settings**


## Map Settings
Map Settings is a modal opened from the **Map Controls**. It contains a set of settings and options which will affect the map it is opened from. 

### Appearance
- Change **Object Set** from global default
- Change basic colors and appearance for the drawn grid of this map. Must check box to override global defaults (set through Settings plugin).
	- Grid line color
	- Grid background color
	- Grid line thickness
- Configure **Fog of War** color or image for this map
- Configure a custom height for this map (separate settings for desktop or mobile)

### Hex Grid (HEX ONLY)
- Set a **background image** for hex maps
- Choose between a **Radial** or **Rectangular** (Offset) shape for your hex map
- Set the size of your hex map
	- Measured in **rings** for radial, and **rows/columns** for rectangular

**Pointy** vs **Flat Top** hexes are configured as a global default in the settings plugin

### Background (GRID ONLY)
- Set a **background image** for grid maps

### Measurement
- Choose units for the **measurement** tool

### Preferences
- Toggle if **pan and zoom** should be remembered for this map
- Toggle if the **object sidebar** open/close status should be remembered for this map
- Toggle if the **expanded state** should be remembered for this map
- Toggle if **map controls** should stay always open, or show on hovering the Windrose.
- **Export** the map as a PNG to your vault. Captures the entirety of the currently visible layer (including background image and any peeking layers).

## Map Functionality
### Modifying the Grid
The **Grid** broadly refers to the set of lines superimposed across a map canvas, and is also the main interaction language for Windrose, at least by default. The **paint** tool paints a single cell, **objects** are placed in cells, etc.

For **grid maps**, there are two variations of grids.
- The primary grid: The main set of imposed lines that this section is discussing
- The interior grid: Grid lines that how up “inside” blocks of painted cells, to allow the grid to still be easily visible.

These can be configured in settings.

#### Grid Size
##### Cell Size
Cell size for both Hex and Grid maps is generally in reference to a **background image**. It is assumed otherwise this doesn’t matter too much and is mostly a functionality of zoom. However, if a background image has a pre-drawn grid, or you need to size a grid to show in proper relation to an image, changing size makes more sense.

##### Grid Area
**Grid** maps have effectively infinite area. The map grid will draw out as far as you go. **Hex maps** have a limited area (this is both a convention, of world maps tend to have set boundaries and a **performance** concern, as hex maps are slightly more compute heavy to draw).

#### Hex map style
**Hex maps** can be **radial**, which draws hexes in **rings** radiating out from a center point, forming a hex of hexes; or **rectangular**, which is an offset hex pattern. The size of your map area can be configured for both of these in settings.

#### Image backgrounds
Any (static, non-animated) image in your vault can be set as the background of a map, through the **Map Settings**. 

It is recommended to use background images < 50MB on most devices. Windrose will support larger images, but this may have performance implications. Performance and workable size will depend on the power of your device. 

##### Adjusting the background
A series of predefined options are available for sizing your grid to your image. You can choose from **sparse** (fewer, larger cells), **medium**, or **dense** (many smaller cells), or set a custom number of cells that you want.

There is also extensive fine tuned control to set exact offsets and cell size. Subpixel measurements are supported for total compatability (i.e. a cell height of 20.2px).

### Drawing
#### Cell Painting
Painting is the primary mode of map-making in Windrose. Think of it as filling in squares on graph paper. Use the **paint tool** and click a cell to fill it with the currently selected color from the color palette. Click or tap one at a time, or drag.

##### Segment Painting (GRID ONLY)
Sometimes you may want to represent something that is not a perfect square. **Segments** subdivide a square grid cell into 8 sub-triangles. This allows for quarter cells, half cells (think small alcoves off a dungeon room, shallow closet, etc), as well as true diagonals, by filling in the proper segments. 

For smooth diagonals specifically, you can quickly fill out a whole edge, by using the **diagonal fill** tool and clicking in the “crook” of a 45 degree staggered/staircase set of painted cells to fill in the gaps with smooth diagonal segments.

##### Area Painting
Using the **rectangle** or **circle** area paint tools, one can fill a large areas of cells with fewer clicks. A preview is shown to show the space that will be painted. Rectangles go corner to corner (2 click process), and circle goes outwards from the center of the circle out to the length of the radius.

##### Edge Painting
Color the edges of a a cell differently (main or interior grid) for greater visual clarity, embellishment, or subdivision.

Doable either one cell edge at a time, or in a straight line point to point with the **edge paint** and **draw edge** tools respectively.

#### Freehand Drawing
The **freehand** tool allows you to create organic shapes not at all tied to the grid. Draw with mouse or touch in whatever shape you want. If you draw your end point back to your start point, you can create a **closed polygon**. A visual indicator will show if you are close enough to the start point to make a closed shape.

A **closed polygon** will fill in automatically, and be treated functionally identical to a normal painted area, complete with interior grid lines, and border. **Closed polygons** can be erased cell by cell. Unclosed curves will be erased in their entirety with one click.

### Navigation and Interaction
#### Navigating the Map
The **map canvas** can be navigated in a few ways. With the **select** tool, click and drag anywhere on the grid (must not be on object/text label) to move the view pane around. You can also **hold Space** and drag with any tool selected, or **two finger drag** on touch devices.

**Zoom level** can be changed either from the **Map Controls** or with scroll wheel, or two finger pinch.

#### Modifying Objects and Labels
Using the **select** tool, clicking any **object** or **text label** will present a set of options for modification.

### Objects

#### Object Sidebar
The **Object sidebar** is open by default, and is the sidebar/drawer on the left side of a WindroseMD map block. It can be closed by clicking the arrows near the top right. 

It shows all of the objects in your current **object set**. Clicking an object from the sidebar will automatically select the **object placement** tool, and clicking with it will place that object on the map. Current selection can be cleared with the **X** button at the bottom of the toolbar.

Hitting the **freeform** (diamond) button will toggle on **freeform** mode for all object placements, allowing objects to be placed anywhere, instead of snapping to the grid.

Holding down **alt** will enable **edge snap** mode, which allows objects to be placed on an edge rather than in the center of a cell. Holding down **alt+shift** will enable **freeform** mode for that object placement without needing to hit the toggle. These keyboard shortcuts also work when dragging an object with the **select** tool.

#### Selection Menu
Clicking an **object** with the **select** tool will open the selection menu. This offers a variety of modifications you can make to the object

- **Rotate** the object in 45 degree increments. Can also be done by pressing **r** on a keyboard.
- Add a custom **tooltip** to the object’s hover state
- **Duplicate** an object
- Toggle **freeform** mode for the object 
- **Link a note** to the object
- **Link** to another object on your map (useful for stairs between layers, portals, etc)
- Copy a **deeplink** for the object to your clipboard
- Change the **color** of the object
- **Resize** the object, up to 4x its starting size.
- **Delete** the object. This can also be done by pressing **del** on your keyboard with an object selected.

#### Object Sets
**Object sets** are a way to define custom categories and objects. Windrose ships with a default object set, and has other packages available for download and import. **Object sets** can be set on a global or per map basis. They allow the following customization.

- Categories, i.e. “hazards”, “doors”.
- Label, name the object whatever you want.
- Icon. Choose from any Unicode character, **RPGAwesome** icons, or import an image.

Object sets can be exported for sharing, and you can import others. All of this is configurable through the **settings plugin**.

### Text Labels
**Text Labels** are a way to put arbitrary text on your maps. They are not snapped to the grid, and will be centered on where you click with the **text label tool**. Clicking will open the text label modal, which will allow you to select font color, font size, and choose from a selection of bundled fonts. 

It will show a preview of your selections.

#### Selection Menu
Much like **objects** text labels can also be selected with the **select tool**. Clicking a text label with the select tool active will allow you to drag the label around to reposition it, and perform a subset of actions specific to this label.

- **Edit** this label. Opens up the text label dialog again and allows you to change your initial selections, as well as change the text itself.
- **Rotate** the label in 45 degree increments. This can also be done by pressing **r** on a keyboard.
- **Link note** links this label to a specific note in your vault. 
- **Delete** the label. This can also be done by pressing **del** on a keyboard.

### Note Linking and Deeplinking

#### Linking from map to notes (Note Linking)
**Objects** and **Text Labels** can both be linked to other notes in your vault via the selection menu. This will show a hover preview of the note when the object is hovered while holding **cmd** or **ctrl** and moving your mouse over a linked object. Clicking while holding that key will open the linked note in a new tab.

A link with hoverable preview will also show alongside the other selection menu options when an object or label with linked note is selected.

#### Linking from Notes to Map (Deeplinking)
**Objects** can have **deeplinks**. Pressing the **deeplink** button when an object is selected will copy a link to that object to your clipboard. You can then paste this link into any other note in your vault. Clicking that link will open the map up to this specific map and object.

### Fog of War
Windrose supports a relatively rudimentary but rich **fog of war** functionality, if you wish to obscure parts of a map, either for hex crawls, solo dungeon play (see **random dungeon generation**), or anything else.

The **fog of war** options are accessed through the **visibility menu** from the **Map Controls**. It can be added either a tile at a time, or in rectangles, as well as erased. It is possible to fog or unfog an entire map with a single button click.

By default, **fog of war** is a solid color, but a tileable image may be chosen on either a global or per map basis. The transparency can be adjusted, but **fog of war** will always hide objects and labels, even if parts of the layout are clear. Selecting a tileable image may have performance implications on very large maps.

### Layers/Floors
Maps may have **layers**. Functionally these are similar to “floors”, especially for grid maps, rather than actual drawing layers, although some creativity is certainly possible.

**Layers** are added from the **layer** menu, accessed through the **Map Controls**. Layers may be renamed, and you can adjust how visible/invisible a layer will be. You may select icons for layers.

You can link between layers with the inter-map linking functionality on **objects**.

### Regions (Hex Only)
For **hex maps**, you can declare **regions** using one of the **region creation** tools in the **tool palette**. You can either **paint** regions, one cell at a time, or **select** by clicking out a polygon to define an area. Regions will use the selected color from the color palette at 30% opacity. You can still paint over regions, and they will coexist.

You can name regions using the region creation toolbar that shows when creating or editing a region. The region toolbar will also show the number of hexes in the region. R

The name of a **region** will show up over every region, kind of like a fixed text label, and will scale with zoom.

There is a **region menu** accessible from the **Map Controls** which will show a list of all the regions on your map. From there, you can toggle that region’s visibility, or jump to that region directly.

Regions can be edited by clicking an existing menu with one of the **region creation tools**, or through a right click (or **long press**) context menu. This will let you change name, color, assigned hexes, or delete the region.

### Sub-maps (HEX ONLY)
Hex maps can have **sub-maps**/sub-regions (note: sub-maps are not tied directly to **regions**, they can exist independently). Create a **sub-map** either by double clicking a hex, or right clicking/long pressing a hex and selecting “Create sub-map” from the context menu.

**Sub-maps** default to radial, and a size of 7 rings. This can be adjusted per sub-map from **Map Settings**. These sub-regions are effectively full Windrose instances and should support all functionality/tools, as well as further **sub-maps**. There is no hardcoded limitation on nesting layers, but it may have performance or data-size implications. 

When inside a sub-region, there will be a **breadcrumb** UI above the tool palette. This will show where you are at in the hierarchy, as well as allow jumping back up layers. Layers can be named by changing the name in map name box.

If a given hex has a **sub-map** then a diamond icon will be shown in the center of that hex to indicate that.

## Random Dungeons
Windrose can **generate random dungeon layouts** (this means grid maps only). This can be done by selecting the “WindroseMD: Generate random dungeon” command from Obsidian’s command palette (Ctrl/Cmd+P or swipe down from top). **This will only work from a note which is in edit mode**.

Random dungeons will automatically place with doors, and an entrance and exit staircase. Other objects can be included (see **dungeon stocking**).

Basic customizations are:
- Name: Name the generated dungeon
- Size
	- Small
	- Medium
	- Large
- Style: Controls certain traits or behaviors which will influence shape of the dungeon
	- Classic: Default options. Most close to classic dungeon generators like Donjon, and have a variety of room sizes and corridors.
	- Cavern: Contains more winding corridors, rounded rooms, no doors, etc. More water.
	- Fortress: Wide corridors and larger rooms.
	- Crypt: Tight corridors, many small rooms

Advanced options offer more extensive customization and tweaking. Sliders or selectors for adjusting the following attributes:

- Circular rooms: percentage chance for a room to be circular rather than rectangular.
- Extra connections: percentage chance for a room to have multiple entrances and exits
- Door frequency: percentage for frequency of door objects 
- Secret doors: percentage for frequency of secret door objects
- Wide corridors: percentage chance for double width hallways to be generated
- Room size bias: Choose between small, medium, large
- Corridor style: normal or organic
- Diagonal corridors: percentage chance for corridors to run diagonally vs in straight lines
- Water features: percentage chance for rooms with water.

The **dungeon visualizer** will automatically update its visual simulation as these options are tweaked to better reflect your selection. 

### Dungeon Stocking
Windrose can optionally “stock” generated dungeons, which will try to populate the dungeon with creatures and features, including traps, chests, etc.

Enable or disable room styles (picks from a small selection of room templates, i.e. a library with many bookshelves, a pantry with many sacks and crates, etc. All or nothing.)

Room categories:
- Dungeons are stocked out of a total of 100%, split between:
	- Monsters
	- Empty rooms
	- Features
	- Traps
- Adjusting a slider up will automatically adjust others down.

#### Solo RPG Options
Optionally, you can enable **fog of war** so that a dungeon will be obscured when you generate it, hiding details until you explore.


