---
layout: default
title: The Beacon
nav_order: 7
permalink: /beacon/
---

# The Beacon

The **Beacon** is a movable position marker with a **range**. It tracks anything that has a location and a reach — the party is the common case, but a rival faction, an advancing army, or a spreading storm work identically. Wherever it stands, it continuously answers *"what's within reach of this point?"* — visually on the canvas, interactively in a results list, and optionally as a generated note in your vault. One Beacon per map.

## Placing the Beacon

The Beacon shares the pin tool group in the palette with note pins — long-press (or right-click) the pin button and choose **Beacon**. Click a cell to place it (it snaps to the grid, square or hex); drag it to move it, and the range ring follows live.

## The range ring

The Beacon's range is set in the map's configured distance units — the same per-cell distance and unit the measure tool uses, so no calibration is ever needed. The ring renders whenever the Beacon exists, in either of two styles:

- **Circle** — a clean geometric ring at the range radius.
- **Cells** — a highlight of the actual cells within range under the map's distance rules (diagonal rule on square grids, true hex distance on hex maps). On a hex map this is the classic hex-crawl "range bloom."

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

Scoping and filters, per Beacon:

- **Layers** — query all layers, or only selected ones.
- **Tags** — a note qualifies if it bears at least one configured tag.
- **Properties** — a note qualifies if a frontmatter property matches one of the configured values.

## Related notes

Each Beacon can expand its results with **related notes**: **off**, **by tags** (other vault notes sharing an in-range note's tags), or **by backlinks** (notes that link to an in-range note). Related lists are capped per entry with an explicit "+N more" overflow.

## The Beacon note

Optionally, the Beacon can generate a **beacon note** — a markdown note in a vault folder you choose, holding the current nearby results as a table of note links with distances (and travel times, when configured). Updates are debounced and change-detected: if the results didn't change, the file isn't rewritten. The note carries an ownership marker, so Windrose will never overwrite a note it didn't generate; a manually deleted beacon note is recreated on the next update; and removing the Beacon offers to delete its note (the Beacon is removed either way).
