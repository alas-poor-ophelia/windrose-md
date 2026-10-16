/**
 * spikes/weather/overlay-demo/main.ts
 *
 * Offline harness for the Windrose x U+13080 Weather exploration. Mounts the
 * REAL WeatherOverlay over a mock hex map (drawn with the real HexGeometry
 * and region renderer) and runs the REAL weather and travel maths, one panel
 * per world day. Weather comes from fixture.json, captured read-only from
 * the live weather plugin, so nothing here needs Obsidian.
 */
import { h, render } from 'preact';
// The plugin bundle contains preact/compat, whose global vnode hook is what
// turns camelCase SVG props (fillOpacity, strokeWidth) into real attributes.
// Without it here the overlay renders fully opaque — unlike the plugin.
import 'preact/compat';
import type { Point } from '#types/core/geometry.types';
import type { MapData, Region } from '#types/core/map.types';
import type { WadjetWeatherReport } from '#types/integrations/wadjet.types';

import { HexGeometry } from '../../../src/geometry/core/HexGeometry';
import { computeCentroid, renderRegions } from '../../../src/geometry/renderers/regionRenderer';
import type { HexGeometryLike } from '../../../src/geometry/renderers/regionRenderer';
import { WeatherOverlay } from '../../../src/components/overlays/WeatherOverlay';
import type { WeatherRegionVisual } from '../../../src/components/overlays/WeatherOverlay';
import { classifyWeatherVisual, formatBadgeTemperature } from '../../../src/weather/weatherVisuals';
import { buildCellZoneIndex, computeSegmentWeatherEffects, hasWeatherZone } from '../../../src/weather/weatherZones';
import { computeWeatherTimeRatio, evaluateWeatherTravel, formatWeatherNote } from '../../../src/weather/weatherTravelRules';
import { computeRouteTravelTime, formatTravelTime } from '../../../src/travel/travelTimeOperations';
import {
  createTravelAllowance,
  createTravelMode,
  createTravelPack,
  upsertPackItem,
} from '../../../src/travel/travelPackOperations';

import { walkRouteWithForecast } from './forecastWalk';
import type { RouteLeg } from './forecastWalk';
import fixture from './fixture.json';

const HEX_SIZE = 28;
const CANVAS_HEIGHT = 400;
const MILES_PER_HEX = 6;
const DAYS = [2, 3, 6];

const geometry = new HexGeometry(HEX_SIZE, 'flat', null);

/** Every hex within `radius` of a centre hex */
function blob(cq: number, cr: number, radius: number): Point[] {
  const hexes: Point[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
      hexes.push({ x: cq + dq, y: cr + dr });
    }
  }
  return hexes;
}

const regions: Region[] = [
  {
    id: 'r-greywold', name: 'Greywold Highlands', hexes: blob(2, 2, 2),
    color: '#6b8f4e', opacity: 0.28, borderColor: '#4d6b36', borderWidth: 2, visible: true, order: 0,
    weatherZoneId: 'greywold-highlands',
  },
  {
    id: 'r-ashfall', name: 'Ashfall Coast', hexes: blob(7, 0, 2),
    color: '#a8643c', opacity: 0.28, borderColor: '#7d4526', borderWidth: 2, visible: true, order: 1,
    weatherZoneId: 'ashfall-coast',
  },
];

/** A journey from the highlands' western edge to the coast's eastern edge (one row below the labels) */
const route: Point[] = [{ x: 0, y: 4 }, { x: 2, y: 3 }, { x: 7, y: 1 }, { x: 9, y: 0 }];

const reports = fixture.reports as unknown as Record<string, WadjetWeatherReport[]>;
const wording = fixture.wording as Record<string, string[]>;

function reportFor(zoneId: string, day: number): WadjetWeatherReport | null {
  return reports[zoneId]?.find(r => r.dayOrdinal === day) ?? null;
}

function wordingFor(zoneId: string, day: number): string {
  const index = reports[zoneId]?.findIndex(r => r.dayOrdinal === day) ?? -1;
  return index >= 0 ? wording[zoneId][index] : 'no report';
}

// Travel pack: on foot 24 mi per 8 h, 8 h of travel per day
let pack = createTravelPack('Harness pack');
pack = upsertPackItem(pack, 'modes', createTravelMode({
  name: 'On foot', distance: 24, unit: { type: 'standard', unit: 'mi' }, timeValue: 8, timeUnit: 'hours',
}));
pack = upsertPackItem(pack, 'allowances', createTravelAllowance({ name: 'Normal', timeValue: 8, timeUnit: 'hours' }));
const onFoot = pack.modes[0];
const allowance = pack.allowances[0];

const segmentDistances: number[] = [];
for (let i = 0; i < route.length - 1; i++) {
  segmentDistances.push(geometry.getCellDistance(route[i].x, route[i].y, route[i + 1].x, route[i + 1].y) * MILES_PER_HEX);
}
const terrainMultipliers = segmentDistances.map(() => 1);
const cellZones = buildCellZoneIndex(regions);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className != null) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function drawMap(canvas: HTMLCanvasElement, offsetX: number, offsetY: number): void {
  const ctx = canvas.getContext('2d');
  if (ctx == null) return;

  ctx.fillStyle = '#d8c9a4';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Hex grid
  ctx.strokeStyle = 'rgba(70, 55, 30, 0.28)';
  ctx.lineWidth = 1;
  for (let q = -2; q <= 12; q++) {
    for (let r = -8; r <= 10; r++) {
      const vertices = geometry.getHexVertices(q, r);
      ctx.beginPath();
      vertices.forEach((v, i) => {
        const x = v.worldX + offsetX;
        const y = v.worldY + offsetY;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
    }
  }

  renderRegions(ctx, regions, geometry as unknown as HexGeometryLike, { x: offsetX, y: offsetY, zoom: 1 }, {});

  // Route
  ctx.strokeStyle = '#c0392b';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.setLineDash([8, 5]);
  ctx.beginPath();
  route.forEach((p, i) => {
    const c = geometry.getCellCenter(p.x, p.y);
    if (i === 0) ctx.moveTo(c.worldX + offsetX, c.worldY + offsetY); else ctx.lineTo(c.worldX + offsetX, c.worldY + offsetY);
  });
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#c0392b';
  for (const p of route) {
    const c = geometry.getCellCenter(p.x, p.y);
    ctx.beginPath();
    ctx.arc(c.worldX + offsetX, c.worldY + offsetY, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function buildPanel(day: number): HTMLElement {
  const panel = el('section', 'panel');
  const dayLabel = day === fixture.today ? `Day ${day} (today)` : `Day ${day} (forecast, today + ${day - fixture.today})`;
  panel.append(el('h2', undefined, dayLabel));

  const container = el('div', 'windrose-canvas-container');
  const canvas = el('canvas');
  const overlayHost = el('div');
  container.append(canvas, overlayHost);
  panel.append(container);

  // Facts: the weather plugin's own wording per zone, then the journey
  const facts = el('div', 'facts');
  for (const zone of fixture.zones) {
    const row = el('div', 'zone');
    row.append(el('b', undefined, zone.name.replace(' (edited)', '')), el('span', undefined, wordingFor(zone.id, day)));
    facts.append(row);
  }

  const effectForZone = (zoneId: string) => {
    const report = reportFor(zoneId, day);
    return report != null ? evaluateWeatherTravel(report) : null;
  };
  const segmentWeather = computeSegmentWeatherEffects(
    route, (x1, y1, x2, y2) => geometry.getCellsInLine(x1, y1, x2, y2), cellZones, effectForZone
  );
  const weatherMultipliers = segmentWeather.map(e => e.multiplier);
  const combined = terrainMultipliers.map((m, i) => m * weatherMultipliers[i]);
  const fair = computeRouteTravelTime(segmentDistances, terrainMultipliers, 'mi', onFoot, pack);
  const actual = computeRouteTravelTime(segmentDistances, combined, 'mi', onFoot, pack);
  const note = formatWeatherNote(segmentWeather, computeWeatherTimeRatio(segmentDistances, terrainMultipliers, weatherMultipliers));

  const total = segmentDistances.reduce((a, b) => a + b, 0);
  const travel = el('div', 'travel');
  travel.append(
    el('span', undefined, `On foot, ${total} mi`),
    el('span', 'with', actual.ok ? formatTravelTime(actual, allowance) : actual.reason),
    el('span', undefined, 'Fair weather'),
    el('span', undefined, fair.ok ? formatTravelTime(fair, allowance) : fair.reason),
    el('span', undefined, 'Weather'),
    el('span', 'note', note ?? 'none on this route'),
    el('span', undefined, 'Per segment'),
    el('span', undefined, segmentWeather.map(e => `x${e.multiplier.toFixed(2)}`).join('  '))
  );
  facts.append(travel);
  panel.append(facts);

  // The overlay measures the canvas, so the panel must be in the document first
  queueMicrotask(() => {
    const width = Math.floor(container.clientWidth);
    canvas.width = width;
    canvas.height = CANVAS_HEIGHT;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${CANVAS_HEIGHT}px`;

    // Centre the view between the two regions
    const a = computeCentroid(regions[0].hexes, geometry as unknown as HexGeometryLike);
    const b = computeCentroid(regions[1].hexes, geometry as unknown as HexGeometryLike);
    const center = { x: (a.worldX + b.worldX) / 2, y: (a.worldY + b.worldY) / 2 };
    const offsetX = width / 2 - center.x;
    const offsetY = CANVAS_HEIGHT / 2 - center.y;
    drawMap(canvas, offsetX, offsetY);

    const visuals: WeatherRegionVisual[] = [];
    for (const region of regions) {
      if (!hasWeatherZone(region)) continue;
      const report = reportFor(region.weatherZoneId, day);
      if (report == null) continue;
      visuals.push({
        regionId: region.id,
        hexes: region.hexes,
        visual: classifyWeatherVisual(report),
        badgeAnchor: computeCentroid(region.hexes, geometry as unknown as HexGeometryLike),
        badgeText: formatBadgeTemperature(report, 'metric'),
      });
    }

    const mapData = { viewState: { zoom: 1, center }, northDirection: 0 } as unknown as MapData;
    render(h(WeatherOverlay, {
      regions: visuals,
      geometry,
      mapData,
      canvasRef: { current: canvas },
    }), overlayHost);
  });

  return panel;
}

/**
 * Experiment strip: the same journey costed day by day against the forecast,
 * beside the shipped behaviour (departure day's weather for the whole trip).
 */
function buildForecastStrip(): HTMLElement {
  const strip = el('section', 'forecast');
  strip.append(el('h2', undefined, 'Experiment: cost the journey day by day against the forecast (not wired into the plugin)'));

  const speedPerHour = onFoot.distance / onFoot.timeValue;
  const hoursPerDay = allowance.timeValue;
  const legs: RouteLeg[] = segmentDistances.map((distance, i) => ({
    distance,
    cells: geometry.getCellsInLine(route[i].x, route[i].y, route[i + 1].x, route[i + 1].y),
    terrainMultiplier: terrainMultipliers[i],
  }));

  for (const departure of [2, 3]) {
    const walk = walkRouteWithForecast(legs, speedPerHour, hoursPerDay, (cell, dayOffset) => {
      const zoneId = cellZones.get(`${cell.x},${cell.y}`);
      const report = zoneId != null ? reportFor(zoneId, departure + dayOffset) : null;
      const effect = report != null ? evaluateWeatherTravel(report) : null;
      return { multiplier: effect?.multiplier ?? 1, reasons: effect?.reasons.map(r => r.label) ?? [] };
    });

    const row = el('div', 'forecast-row');
    row.append(el('b', undefined, `Leave on day ${departure}`));
    row.append(el('span', 'with', formatTravelTime({ ok: true, amount: walk.totalHours, base: 'hours' }, allowance)));
    const breakdown = walk.days.map(d =>
      `day ${departure + d.dayOffset}: ${d.distance.toFixed(1)} mi in ${d.hours.toFixed(1)} h` +
      (d.reasons.length > 0 ? ` (${d.reasons.join(', ')})` : '')
    ).join('   ·   ');
    row.append(el('span', undefined, breakdown));
    strip.append(row);
  }
  return strip;
}

const panels = document.getElementById('panels');
if (panels != null) {
  for (const day of DAYS) panels.append(buildPanel(day));
  panels.after(buildForecastStrip());
}
// Two frames: microtask mounts, then the overlay's first paint
requestAnimationFrame(() => requestAnimationFrame(() => {
  (window as unknown as { __spikeReady: boolean }).__spikeReady = true;
}));
