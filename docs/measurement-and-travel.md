---
layout: default
title: Measurement and travel
nav_order: 8
permalink: /measurement-and-travel/
---

# Measurement, routes, and travel

The **Measure Distance** tool (requires the *Distance measurement* feature) measures **multi-waypoint routes**, not just single segments — and with [travel packs](#travel-packs), it turns distance into travel time.

## Measuring a route

Each click (or tap) adds a waypoint; the route renders as a connected path on the map, with a live preview segment from the last waypoint to the cursor included in the running total. Every segment uses the map's native distance semantics — per-cell distance, unit, diagonal rule on square grids, true hex distance on hex maps — and honors the cells/units/both display format.

While measuring, **Backspace** removes the last waypoint and **Escape** clears the route. An in-progress route persists with the map, so a half-measured hex crawl survives closing and reopening the view. **Double-click** the end cell (double-tap on touch) or press **Enter** to finish the route by saving it.

## Saved routes

Finishing a measurement (or its **Save as route** button) converts it into a permanent, styled path on the map, with a name, color, width, and an optional distance label — labels stay hidden until you hover (or tap, on touch). While the measure tool is active, clicking a saved route opens a menu to **edit** its name and style or **delete** it; saving, editing, and deleting all participate in undo history. A **saved routes** toggle in the Visibility controls shows or hides them all.

## Travel packs

A **travel pack** is a named bundle of travel rules for an RPG system (say, D&D 5e overland travel). A pack can contain:

- **Custom units** — name, abbreviation, and a conversion factor (a "league" defined in miles, a "hex" defined as six miles).
- **Terrain types** — each with a speed multiplier (above 1 faster, below 1 slower).
- **Travel modes** — each with a speed as distance per time (24 miles per 8 hours; 3 hexes per day).
- **Per-day allowances** — how much travel time counts as one day (8 hours/day forced march vs. 6 hours/day normal).

Packs are created and edited in the **Travel Packs** section of settings, individually enabled or disabled (only enabled packs surface in map UI), and exportable and importable as files. They're also distributed as [content packs]({{ site.baseurl }}/content-packs/) for one-click install. Custom units from enabled packs are selectable as a map's distance unit — globally or per map — so a hex-crawl map can display "hexes" everywhere.

## Travel times

With an enabled pack, the measurement readout grows a **Travel** block: a live travel time for each of the map's selected travel modes, updating with the route as you measure. Which modes appear — and which per-day allowance applies — is chosen per map from a collapsible selector in the readout itself, so a world map and a dungeon map keep different clutter. With an allowance selected, times render as whole days plus a remainder (say, "3 days + 2.5 h"). If a mode's time base and the allowance don't line up, the readout says so explicitly rather than showing a wrong number.

## Per-segment terrain

With a pack enabled, each route segment can be assigned a **terrain**: click a segment and pick from a popup anchored right at the segment. A segment's effective speed is the travel mode's speed times the terrain's multiplier; unassigned segments travel at plain mode speed. Terrain assignments are preserved when the route is saved.
