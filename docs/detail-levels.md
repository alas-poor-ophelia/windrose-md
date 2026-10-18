---
layout: default
title: Detail levels
nav_order: 12.5
permalink: /detail-levels/
---

# Detail levels (HEX ONLY)

With **detail levels**, a hex map subdivides as you zoom in. Each hex splits into a finer lattice of child hexes, and you can paint, draw and place things at whichever level you are zoomed to. Zoom back out and the fine work folds away under the coarse fill. It is one map throughout.

## What this is not

- **Not sub-hex maps.** A [sub-hex map]({{ site.baseurl }}/hex-maps/#sub-maps-hex-only) is a separate nested map you drill into from one hex. Detail levels are the same map, subdividing in place. The two do not mix: a map with sub-hex maps cannot turn detail levels on, and detail levels are not available inside a sub-hex map.
- **Not available on grid maps.** Hex maps only.
- **Not available on rotated hex maps.**
- **Not on by default.** Classic maps are unaffected unless you opt a map in.

{: .warning }
Every device that opens the vault must run Windrose 2.5.0 or later before you enable detail levels on a map. Older versions do not understand them and discard a map's detail levels the next time they save it.

## Enabling detail levels

There are two ways to opt a hex map in:

- **New map dialog.** The **Detail levels** row is **Off (classic)** by default. Pick a preset, such as "4 child hexes per edge (recommended)", "2 child hexes per edge" or "15 child hexes per edge".
- **Existing map.** Open **Map settings**, go to the hex grid settings and switch on **Enable detail levels**.

Either way, Windrose asks **Enable detail levels?** and repeats the version warning above. Choose **Enable** to continue or **Cancel** to leave the map as it is.

The toggle is disabled while the map has sub-maps, and it stays on once the map holds content above level 0. Remove that content to turn it off.

## Settings

These appear in Map settings while detail levels are on.

- **Child hexes per parent edge.** How many child hexes each hex splits into along one edge, per level: 2, 4 or 15. This **locks** once the map has content above level 0, because changing it would reassign every finer hex you already authored.
- **Deepest level.** The deepest level you can paint, up to 6. The default is 3. It cannot go below the deepest level that already holds content.
- **Minimum cell size.** The on-screen hex width, in pixels, at which the map steps down to the next level. The default is 64 and the floor is 8. Smaller values make finer levels appear sooner.

Map settings also show which level the map opens at.

## Navigating

Zooming in steps the map down a level when cells reach the minimum cell size, and zooming out steps back up. A **level overlay** on the canvas shows:

- **A chip for each level**, L0 to the deepest level. The current level is highlighted. Click another chip to zoom to that level while keeping your view centered.
- **A padlock (Lock edit level).** Normally you edit the level you are zoomed to. The lock pins editing to the level you are on, so you can zoom in to look closer without your strokes moving to a finer level. If you zoom out past the locked level, you edit the level you can see.
- **A readout**, such as `level: L2`, with `edit: L1` added when the two differ.

## Editing at depth

You can paint, erase, draw shapes, and place tiles, objects and text labels at the current edit level. New hexes at a finer level sit over the coarse fill beneath, which shows through where you have not painted.

Undo and redo follow the level of the change. Undoing a stroke you made at level 2 restores level 2 content, whatever level you are looking at.

## Objects and labels

An object or text label belongs to the level where you placed it, and shows at that level and the ones around it. To change that, select it and choose **Levels** to open **Visible on levels**:

- **Auto** returns to the default behavior.
- Toggle individual level chips to pin exactly which levels show it. This works on a multi-selection too, where a partly set chip shows as mixed.
- The last visible level cannot be turned off. Pick another level first, or use Auto.

Note pins are placed at the root level only. Trying elsewhere shows "Note pins are placed at the root level only."

## Export

Image export renders the map at the deepest level that holds content, as far as the export size cap allows. If the cap would make that level's hexes sub-pixel, the export paints a shallower level instead.

## The Features toggle

**Settings, Features, Detail levels** hides the controls for adding detail levels (the new-map row and the map-settings toggle). It does not affect maps that already have detail levels: they still display and stay fully editable.

## Limits

- **Size budget.** Detail content is large. An edit that would push the map past its size budget is refused with "Cannot edit this level: over the map's size budget." A single operation is also capped at a number of new cells, with a "too many cells in one operation" notice. Delete some detail content, or split the work into smaller strokes.
- **Rotation lock.** Rotation is locked while the map has content above level 0: "Rotation is locked while this map has content above level 0."
- **Read-only maps.** If a map's detail levels are inconsistent, for example a deepest level set below its content, they are read-only until the settings agree again.
