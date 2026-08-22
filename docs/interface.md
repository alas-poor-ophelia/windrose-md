---
layout: default
title: Interface and controls
nav_order: 3
permalink: /interface/
---

# Interface and controls

A Windrose map can be worked on in two places:

- **Inline (block)** — the map renders directly in a note, wherever you placed its `windrose-map` code block, including inside callouts. The tool palette sits above the canvas and the drawers dock to the side.
- **Full pane** — the map opens in a dedicated Obsidian workspace tab, giving the canvas the whole leaf. See [Full-pane view and dockable panels]({{ site.baseurl }}/full-pane-and-picture-frame/).

Both share the same tools and controls. In full-pane view, the side drawers can additionally be popped out into floating, dockable panels.

## Tool palette

The **Tool Palette** contains most of what you need to create or modify a map. It sits below the map name box. Some tools appear only on grid or only on hex maps, and some appear only when their feature is enabled.

Several tools are grouped: a group shows one button, and long-pressing (or right-clicking) it reveals the sub-tools.

- **Select** tool group
  - **Select**: move or modify the map or its contents.
  - **Area Select**: select multiple objects or text labels within a rectangle.
- **Draw** tool group
  - **Paint Cells**: color a single cell with the selected color.
  - **Paint Segments** (**GRID ONLY**): subdivide a cell into 8 triangular sub-segments for half-cells, quarter-cells, and true diagonals.
  - **Paint Edges** (**GRID ONLY**): paint the grid lines themselves for custom borders, walls, and subdivisions.
  - **Freehand Draw**: create organic, non-grid-locked polygonal shapes.
- **Fill** tool group (**GRID ONLY**)
  - **Fill Rectangle**: fill a rectangle corner to corner.
  - **Fill Circle**: fill a circle from center to radius.
  - **Diagonal Fill**: place segments along a staggered row of painted cells to smooth a staircase edge into a clean diagonal.
- **Eraser** tool group
  - **Erase**: erase a single thing — cells, objects, labels, tiles, and so on.
  - **Clear Area** (**GRID ONLY**): delete everything within a rectangle.
- **Region** tool group (**HEX ONLY**, requires the *Regions* feature)
  - **Paint Region**: define a region cell by cell.
  - **Draw Boundary**: define a region by clicking out a polygon; double-click to close.
- **Paint Line** (**GRID ONLY**): paint an edge along a straight line, point to point.
- **Color palette**: select or create colors for painting. Colors can also be defined globally in settings.
- **Add Object**: place an object from the object drawer.
- **Place Note Pin** (requires the *Note pins* feature): place a pin linked directly to a vault note.
- **Add Text Label**: place a free-floating text label.
- **Draw Outline** (**HEX ONLY**, requires the *Outlines* feature): draw a polygon shape point-to-point.
- **Place Shape Overlay** (requires the *Shape overlays* feature): place a decorative shape on the map.
- **Measure Distance** (requires the *Distance measurement* feature): measure multi-waypoint routes in configured units — see [Measurement, routes, and travel]({{ site.baseurl }}/measurement-and-travel/).
- **Place Tile** (requires the *Image tiles* feature): activate the tile system and paint image tiles. The placement sub-tool (paint, stamp, scatter, and so on) is chosen inside the tile drawer, not here — see [Image tiles]({{ site.baseurl }}/image-tiles/).
- **Undo / Redo**: up to 50 actions. Does not persist across an Obsidian restart.

## Map controls

### The Windrose

The Windrose is a compass icon in the top-right of a map canvas. Clicking it changes the compass orientation. On a grid map this rotates the actual map orientation; on hex it is purely aesthetic/informational.

By default, hovering the Windrose reveals the map controls. They can be set to stay always-on in Map Settings.

### The controls

The Map Controls offer sub-menus for changing how you view a map:

- **Expand map**: expand an inline block to the full width of its note.
- **Zoom controls**: 10%–200%. Zoom can also be driven with the scroll wheel or a two-finger pinch.
- **Layers**: opens the layers/boards sub-menu (see [Boards, strata, and layers]({{ site.baseurl }}/image-tiles/#boards-strata-and-layers)).
- **Regions** (**HEX ONLY**): opens the regions sub-menu.
- **Visibility**: toggle parts of the map display on or off; also holds the **Fog of War** controls.
- **Map Settings**: opens the per-map settings modal.

## Navigating the map

The canvas can be panned in several ways: with the **Select** tool, click and drag on empty grid (not on an object or label); or hold **Space** and drag with any tool; or **two-finger drag** on touch.

**Zoom** can be changed from the Map Controls, with the scroll wheel, or with a two-finger pinch.

On a trackpad, a **two-finger scroll** pans the canvas and a pinch zooms it, matching platform conventions rather than treating the gesture as a wheel zoom.

## Map settings

Map Settings is a modal opened from the Map Controls. Its settings affect only the map it was opened from, and where a setting has a global default, you must tick a box to override it.

### Appearance

- Change the **object set** from the global default.
- Override basic grid appearance for this map (grid line color, background color, line thickness).
- Configure **Fog of War** color or image for this map.
- Set a custom canvas height (separate values for desktop and mobile).
- Set **picture frame** dimensions for this map — height and width, each with separate desktop and mobile values (see [Picture frame mode]({{ site.baseurl }}/full-pane-and-picture-frame/#picture-frame-mode)).
- Change the **tileset folders** scanned for this map's tiles.

### Hex grid (HEX ONLY)

- Set a **background image**.
- Choose a **Radial** or **Rectangular** (offset) shape.
- Set the map size — measured in **rings** for radial, **rows/columns** for rectangular.

**Pointy** vs **Flat-Top** hex orientation is a global default (see settings).

### Background (GRID ONLY)

- Set a **background image** for this grid map.

### Measurement

- Choose the units used by the measurement tool — standard units, or a custom unit from an enabled [travel pack]({{ site.baseurl }}/measurement-and-travel/#travel-packs), so a hex-crawl map can natively measure in "hexes."

### Preferences

- Remember **pan and zoom** for this map.
- Remember the **drawer** open/closed state.
- Remember the **expanded** state.
- Keep **map controls** always open, versus showing them on hover.
- **Export** the map as a PNG to your vault — captures the entire currently visible layer, including the background image and any peeking layers.

## Global settings

The plugin's settings page is a single scrolling page of collapsible sections. Some sections only appear when their feature is enabled:

- **Features** — one toggle per feature (see [Feature toggles and onboarding]({{ site.baseurl }}/getting-started/#feature-toggles-and-onboarding)).
- **Hex Map Settings** (requires *Hex maps*) — orientation and hex defaults.
- **Color Settings** — default grid colors and appearance.
- **Color Palette** — define reusable colors for the palette.
- **Fog of War** (requires *Fog of war*) — global fog color/image, and a **Browse** button for downloadable fog texture packs.
- **Map Behavior** — general behavioral defaults.
- **Distance Measurement** (requires *Distance measurement*) — default units.
- **Travel Packs** (requires *Distance measurement*) — create, edit, enable/disable, export, and import [travel packs]({{ site.baseurl }}/measurement-and-travel/#travel-packs).
- **Tile Sets** (requires *Image tiles*) — the **Add tiles** wizard and your list of tileset folders.
- **Object Types** — customize objects and categories, and a **Browse content packs** button for downloadable object sets.
- **Keyboard Shortcuts** — view and rebind shortcuts.
