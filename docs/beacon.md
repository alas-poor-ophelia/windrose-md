---
layout: default
title: The Beacon
nav_order: 7
permalink: /beacon/
---

# The Beacon

The **Beacon** is a movable position marker with a **range**. It tracks anything that has a location and a reach — the party is the common case, but a rival faction, an advancing army, or a spreading storm work identically. Wherever it stands, it continuously answers *"what's within reach of this point?"* — visually on the canvas, interactively in a results list, and optionally as a generated note in your vault. A map can hold as many Beacons as you like, each with its own range, filters and note. (Requires the *Beacon* feature — like the other session tools, it can be switched off under Features.)

## Placing Beacons

The Beacon shares the pin tool group in the palette with note pins — long-press (or right-click) the pin button and choose **Beacon**. Click an empty cell to place a Beacon there (it snaps to the grid, square or hex); every click on empty ground places another one. The first Beacon is labeled "The Party" in the default color; each one after that gets its own numbered label ("Beacon 2", "Beacon 3", ...) and a distinct color, so a glance at the canvas tells them apart. Clicking a Beacon selects it instead of placing a new one, and dragging it moves it, range ring following live. Up to four Beacons can share a cell: they arrange themselves around the cell the way stacked objects do, each keeps its own range ring centred on the cell, and clicking picks the one under the pointer. A full cell refuses a fifth.

The selected Beacon is the one whose card is on screen. With the select tool, clicking a Beacon selects it too, so you can adjust one without leaving the tool you were using.

## The range ring

The Beacon's range is set in the map's configured distance units — the same per-cell distance and unit the measure tool uses, so no calibration is ever needed. The ring renders whenever the Beacon exists, in either of two styles:

- **Circle** — a clean geometric ring at the range radius.
- **Cells** — a highlight of the actual cells within range under the map's distance rules (diagonal rule on square grids, true hex distance on hex maps). On a hex map this is the classic hex-crawl "range bloom."

Every Beacon draws its own ring, in its own color, and answers its own range query — overlapping rings simply overlap.

Markers currently in range get a subtle glow on the canvas, so "what's in reach" reads at a glance.

## The Beacon card

Selecting the Beacon opens a floating controls card:

- **Label** — a display name for whatever the Beacon is tracking.
- **Range** — in map units; zero, negative, or non-numeric input is rejected with feedback.
- **Ring style** — circle or cells.
- **Icon and color** — an icon picker with searchable RPG Awesome icons (a short search string can also be applied as a literal symbol — emoji, ★, and friends), and the shared color picker.
- **Filters & related** — result scoping (below).
- **Beacon note** — vault-note generation (below).
- The **nearby results** list.

## Nearby results

The Beacon's candidates are the map's linkable markers: note pins and objects with a linked note. Distances use the map's native distance semantics — the same rules as the measure tool — so results are map-rule-correct, not straight-line approximations. If several markers link the same note, the note appears once at its minimum distance. Markers with a display label but no link get their own separate "nearby" list.

Results are sorted by distance and show the note name and formatted distance — plus a **travel time** per active travel mode, when [travel packs]({{ site.baseurl }}/measurement-and-travel/#travel-packs) are configured for the map. Activating a row opens its note; a **show on map** button navigates to the source marker and flashes it. An empty result set says so explicitly ("Nothing in range").

Results stay current as the Beacon moves, its range changes, or nearby markers are added, moved, or removed — including through undo/redo.

Other Beacons in range appear in their own **Beacons** list, with the same distance and travel time as any marker; a Beacon that generates a beacon note is linked, and **show on map** pans to it. Every Beacon is visible to the others by default. To hide one (a rival faction the party should not see coming), switch off **Visible to other beacons** in that Beacon's Filters & related section.

Scoping and filters, per Beacon:

- **Layers** — query all layers, or only selected ones.
- **Tags** — a note qualifies if it bears at least one configured tag.
- **Properties** — a note qualifies if a frontmatter property matches one of the configured values.

## Related notes

Each Beacon can expand its results with **related notes**: **off**, **by tags** (other vault notes sharing an in-range note's tags), or **by backlinks** (notes that link to an in-range note). Related lists are capped per entry with an explicit "+N more" overflow.

## The Beacon note

Optionally, the Beacon can generate a **beacon note** — a markdown note in a vault folder you choose, holding the current nearby results as a table of note links with distances (and travel times, when configured). Updates are debounced and change-detected: if the results didn't change, the file isn't rewritten. The note carries an ownership marker, so Windrose will never overwrite a note it didn't generate; a manually deleted beacon note is recreated on the next update; and removing a Beacon offers to delete its note (the Beacon is removed either way). Each Beacon owns its own note, so several Beacons on one map generate several notes.
