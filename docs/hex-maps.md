---
layout: default
title: Regions and sub-maps
nav_order: 10
permalink: /hex-maps/
---

# Regions and sub-maps (HEX ONLY)

## Regions

On hex maps you can declare **regions** with the region tools in the palette — **Paint Region** (cell by cell) or **Draw Boundary** (click out a polygon). Regions render at 30% of the selected color's opacity; you can still paint over them and they coexist. (Requires the *Regions* feature.)

Name a region in the region toolbar that appears while creating or editing it; the toolbar also shows the region's hex count. A region's name floats over it like a fixed label and scales with zoom.

A **regions menu** in the Map Controls lists every region on the map; from there you can toggle a region's visibility or jump to it. Edit a region by clicking it with a region tool, or via a right-click / long-press context menu — to change its name, color, assigned hexes, or delete it. Regions can also link to notes.

## Sub-maps (HEX ONLY)

Hex maps can contain **sub-maps** — nested maps of their own (independent of regions). Create one by double-clicking a hex, or via the right-click / long-press context menu → "Create sub-map." (Requires the *Sub-maps* feature.)

Sub-maps default to radial at 7 rings, adjustable per sub-map in Map Settings. Each is effectively a full Windrose instance and supports all tools and functionality, including further sub-maps — there's no hard nesting limit, though very deep nesting may carry performance or data-size implications.

Inside a sub-map, a **breadcrumb** UI above the tool palette shows where you are in the hierarchy and lets you jump back up. A hex containing a sub-map shows a diamond icon in its center.

Zooming in past a threshold on a hex that holds a sub-map descends into it directly, so a world map and its sub-maps read as one continuous zoom rather than separate maps opened by hand.

A sub-map can also be embedded on its own, without its parent, using the `subhex` key on a `windrose-map` code block (see [windrose-map code blocks]({{ site.baseurl }}/getting-started/#windrose-map-code-blocks)).
