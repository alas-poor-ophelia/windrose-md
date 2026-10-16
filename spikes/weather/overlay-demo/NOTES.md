# Weather spike: overlay + travel demo

Offline harness for the Windrose x U+13080 Weather exploration (branch `explore/weather-u13080`).
It exists because the dev vault was running another branch's build while this was written, so
the plugin could not be deployed for a live look.

```bash
node spikes/weather/build.mjs overlay-demo      # -> overlay-demo/dist/bundle.js
node spikes/weather/capture.mjs overlay-demo    # -> overlay-demo/out/demo.png (headless chromium)
```

Or open `index.html` in a browser after building.

## Hypothesis

A weather-bound region can show its zone's weather and slow routes that cross it using only
what the weather plugin's public API returns (`getReport` / `getRange` / `describe`), with the
weather-to-speed mapping owned by Windrose.

## What was built

- The page mounts the real `WeatherOverlay` over a mock hex map drawn with the real
  `HexGeometry` and `renderRegions`. Only the map is fake.
- Weather is `fixture.json`: five days for both zones, captured read-only from the live
  plugin (0.3.1, generator 0.0.3) with `api.getRange` and `api.describe(report, 'short')`.
- Travel numbers come from the real `computeRouteTravelTime`, `evaluateWeatherTravel` and
  `computeSegmentWeatherEffects`: 54 mi on foot at 24 mi per 8 h, 8 h of travel a day.
- `forecastWalk.ts` is an experiment that is not in the plugin: it walks the route cell by
  cell and switches to the next day's weather when the day's allowance is spent.
- The harness imports `preact/compat` for its side effect. The plugin bundle contains compat,
  and compat's global vnode hook is what turns camelCase SVG props (`fillOpacity`) into real
  attributes. Without that import the overlay renders fully opaque here, unlike the plugin.

## Measurements

Fair-weather time for the journey is 2 days + 2 h.

| Leave on | Plugin today (departure day's weather for the whole trip) | Forecast walk |
|---|---|---|
| Day 2 | 2 days + 3.6 h (Sleet, +9%) | 2 days + 5.5 h |
| Day 3 | 3 days + 3 h (Heavy snow, +50%) | 2 days + 2 h |

Leaving on day 2, the party is still in the dry highlands while the coast has sleet, then
reaches the coast on day 3 in heavy snow (13.5 mi that day). Leaving on day 3, the snow has
passed by the time they arrive.

## Verdict

- The overlay and the per-segment travel effect work from the public API alone.
- Costing a multi-day journey with one day's weather is wrong in both directions on real
  data (9% reported against about 19% actual; 50% reported against none). A shipped version
  should walk the forecast, which needs the travel allowance to define a day.
- Tint strength is uncalibrated: rain over a warm region fill reads grey-blue, and cloudy is
  barely visible. Pick values from a lineup in this harness, not by deploying.
