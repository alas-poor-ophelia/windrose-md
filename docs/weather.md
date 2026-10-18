---
layout: default
title: Weather
nav_order: 9
permalink: /weather/
---

# Weather

Windrose can show the weather from a separate companion plugin on your maps: falling rain and snow, a wind needle on the compass, a forecast panel, and weather-aware travel times on measured routes.

This is a display and costing layer, not a weather simulator. Windrose does not generate, store, or edit weather, climates, or calendars. The companion plugin owns all of that, and Windrose only reads from it.

## What you need

The companion is the **U+13080** weather plugin (plugin id `wadjet`), installed and enabled alongside Windrose. Windrose works with the 0.3.x releases and with the newer plugin API; there is no stricter version floor in the code. Some features below need the newer API and quietly do not appear on 0.3.x. Without the plugin installed and enabled, nothing weather-related appears anywhere in Windrose: no tab, no panel, no toggle, no setting.

Weather never reveals fog of war. A fogged cell shows no weather, is costed as fair weather, and contributes nothing to the itinerary. A weather area the players have not uncovered is not listed in the almanac.

## Binding a map to a weather zone

A weather zone is defined in the companion plugin. Windrose only chooses which zone applies where.

- **Whole map.** Open **Map settings** and use the **Weather** tab. **Weather zone** sets the weather for the whole map. On a hex map it applies to every hex that no weather-bound region claims. If you later delete the zone in the companion plugin, the dropdown shows it as "zone not found" and the map shows no weather until you pick another.
- **Regions (hex maps).** Right-click a region and choose **Weather: *zone name***, or **Remove weather** to unbind it. Each region can have its own zone, so a highland region and a coastal region can have different weather on the same map.
- **Sub-hex maps.** A sub-hex level inherits the weather of the hex you drilled from. The Weather tab there offers **Same as the parent hex** or a zone of its own.

## The sky

A bound map gets an animated sky layer: falling rain and snow, drifting fog, and cloud shadows. The **Animate weather** setting in the Weather tab turns the motion off per map (on by default; on a sub-hex it can also follow the parent hex). The **Toggle weather visibility** button in the Visibility controls hides or shows the layer.

## The wind indicator

When the map has weather, the compass draws a wind needle pointing downwind, with the Beaufort force in a small badge at the upwind end. Hover it for wording such as "Fresh breeze from WSW".

## The almanac

When at least one visible area has weather, an **Almanac** appears in the edge rail. It shows:

- the weather area (a dropdown when the map has several),
- the day, a temperature with high and low, feels-like, wind, and visibility,
- ground conditions such as snow cover or mud, which Windrose estimates from the previous two weeks of weather,
- a seven-day strip, and an hour slider with a time-lapse button and an **All day** view.

The view day and hour also drive the sky on the map. **Advance a day** moves the companion plugin's calendar forward, if its owner allows other plugins to do that; otherwise Windrose says the calendar did not move. In the Regions panel, a weather-bound region lists its weather and can open straight into the almanac.

## Weather on routes

With the [measure tool]({{ site.baseurl }}/measurement-and-travel/), travel times account for the forecast. As you measure, Windrose walks the route day by day, using the weather each cell will have on the day you would cross it, plus ground conditions.

- The **Travel** readout notes the weather along the route, and the itinerary shows each day's weather and the time it adds.
- **Leave on** shows seven departure days from the view day with the total travel time for each. The fastest is highlighted. Click a day to set the departure.

The weather slows travel; it never speeds it up, and stacked effects are floored at a quarter of normal speed.

## Weather travel rules

**Settings, then Weather, then Weather travel rules** chooses how weather turns into a speed change. This group is hidden unless the companion plugin is present.

- **Built-in rules** (the default) use fixed thresholds: for example rain, snow, and sleet by intensity, strong wind and gale, poor visibility and dense fog, bitter cold and extreme heat. Within a group the worst effect applies, and groups multiply, so snow in a gale is slower than either.
- Other plugins can register their own rules through the companion plugin. They appear in the same dropdown. If a chosen set is no longer loaded, it is listed as "not loaded".

## Related pages

- [Measurement, routes, and travel]({{ site.baseurl }}/measurement-and-travel/)
- [Fog of war]({{ site.baseurl }}/fog-of-war/)
- [Regions and sub-maps]({{ site.baseurl }}/hex-maps/)
