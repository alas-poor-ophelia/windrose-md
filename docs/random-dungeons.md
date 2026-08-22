---
layout: default
title: Random dungeons
nav_order: 11
permalink: /random-dungeons/
---

# Random dungeons

Windrose can **generate random dungeon layouts** (grid maps only) via the **Generate random dungeon** command (Ctrl/Cmd+P, or swipe down from the top on mobile). This works from a note in edit mode. (Requires the *Dungeon generator* feature.)

The generation is pure procedural math and graph work — no AI is involved; the animation you watch is an approximation of the algorithm at work. Generated dungeons come with doors and an entrance/exit staircase, and can optionally be stocked with other content.

Basic options:

- **Name** — name the generated dungeon.
- **Size** — Small, Medium, or Large.
- **Style** — influences the shape and character of the dungeon:
  - **Classic**: the default; a variety of room sizes and corridors, close to classic generators like Donjon.
  - **Cavern**: winding corridors, rounded rooms, no doors, more water.
  - **Fortress**: wide corridors and larger rooms.
  - **Crypt**: tight corridors and many small rooms.

Advanced options offer sliders and selectors for:

- **Circular rooms** — chance a room is circular rather than rectangular.
- **Extra connections** — chance a room has multiple entrances/exits.
- **Door frequency** — frequency of door objects.
- **Secret doors** — frequency of secret-door objects.
- **Wide corridors** — chance of double-width hallways.
- **Room size bias** — small, medium, or large.
- **Corridor style** — normal or organic.
- **Diagonal corridors** — chance corridors run diagonally rather than orthogonally.
- **Water features** — chance of rooms with water.

The **dungeon visualizer** updates its live simulation as you tweak these to better reflect your selection.

Each style carries its own default colors for floor, wall, and water, configurable in settings, so a generated cavern and a generated fortress are not produced in the same palette.

| The generator | The result |
| --- | --- |
| ![The Generate Random Dungeon modal, with its live layout preview, style and size selectors, and distance settings]({{ site.baseurl }}/images/dungeon-generator-docs-screenshot.png) | ![A generated dungeon: rooms and corridors stocked with monsters, traps, doors, and furniture]({{ site.baseurl }}/images/random-dungeon-docs-screenshot.png) |

## Dungeon stocking

Windrose can optionally **stock** generated dungeons — populating them with creatures and features including traps, chests, and themed furniture.

Enable or disable **room styles**, which pick from a small set of room templates (a library full of bookshelves, a pantry of sacks and crates, and so on — all or nothing).

Stocking is distributed across a total of 100%, split between:

- **Monsters**
- **Empty rooms**
- **Features**
- **Traps**

Raising one slider lowers the others.

## Solo RPG options

Optionally enable **fog of war** at generation time so the dungeon is obscured, hiding its details until you explore it.

Beyond generation, Windrose has a small set of solo-play features that emerged more than they were designed, but are worth calling out. An object can be designated a **player** token, which unlocks measuring/showing movement across the grid and an optional **light radius** that automatically clears fog of war as the token moves onto it.
