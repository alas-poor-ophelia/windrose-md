/**
 * WeatherSkyLayer.tsx
 *
 * The animated weather "Sky": rain, drizzle, sleet, snow, fog banks, cloud
 * shadows and storm lightning over each weather area (bound regions and the
 * whole-map area), clipped to the area's cells minus fogged cells. Drawing
 * is the pure SkyEngine (src/weather/sky); this layer owns its canvas, its
 * clip paths and its animation loop.
 *
 * Loop: one requestAnimationFrame loop per mounted map, running only while
 * the layer is shown, the map has something to animate, the document is
 * visible and the canvas is on screen (IntersectionObserver). Under
 * prefers-reduced-motion it draws one still frame and redraws only when
 * the view, the weather or the shapes change.
 *
 * Clip caching: world-space outlines come from useWeatherShapes (traced
 * once per area/fog/geometry change and shared with WeatherLayer); the Sky
 * keeps the areas that animate. Their screen projection (a few boundary
 * vertices per area) is redone only when the live viewport, the canvas size
 * or north changes. A frame is step + draw, nothing else.
 *
 * Hour rule (skyWeather.ts): with a view hour the Sky reads the hourly
 * report and its precipitation window; with no hour it shows the day.
 * Region name plates (drawn on the map canvas below) are cleared out of
 * every frame so names stay readable under rain, snow and fog.
 *
 * Animation follows the store's resolved `animate` (the map's "Animate
 * weather" setting, inherited by sub-hex levels).
 *
 * Never part of the static cache: a private overlay canvas from
 * useOverlayCanvas, whose backing store is 1:1 with the main canvas (no
 * extra devicePixelRatio scale; SkyFrame.pixelRatio is backing px per CSS
 * px of that canvas).
 */

import type { VNode } from 'preact';
import type { StoredViewState } from '#types/core/map.types';
import type { SkyArea, SkyFrame, SkyWeather } from '../../weather/sky/skyTypes';
import type { SkyShape } from '../../weather/skyClip';
import type { RegionLabelSpot } from '../../weather/skyCells';

import { useEffect, useMemo, useRef } from 'preact/hooks';
import { useMapState } from '../../context/MapContext';
import { useWeatherStore } from '../../context/WeatherContext';
import { useOverlayCanvas } from '../../hooks/canvas/useOverlayCanvas';
import { useWeatherShapes } from '../../hooks/canvas/useWeatherShapes';
import { createViewportTransform } from './viewportTransform';
import { SkyEngine } from '../../weather/sky/SkyEngine';
import { projectSkyShape } from '../../weather/skyClip';
import { regionLabelPlateSize, regionLabelSpots } from '../../weather/skyCells';
import { isQuietSky, toSkyWeather } from '../../weather/skyWeather';

/** Props for WeatherSkyLayer */
export interface WeatherSkyLayerProps {
  /** Weather layer toggle (visibility toolbar) */
  visible: boolean;
}

/** Frame cost counters, readable from a dev console as `canvas.windroseSky` */
interface SkyDebugStats {
  frames: number;
  /** step + draw of the last frame, ms */
  lastMs: number;
  /** exponential moving average of step + draw, ms */
  avgMs: number;
  particles: number;
  drawCalls: number;
  areas: number;
}

const DEFAULT_VIEW: StoredViewState = { zoom: 1, center: { x: 0, y: 0 } };

const NO_SHAPES: { shapes: SkyShape[]; winding: 1 | -1 } = { shapes: [], winding: 1 };

/** Same members, regardless of order */
function sameMembers(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

const WeatherSkyLayer = ({ visible }: WeatherSkyLayerProps): VNode | null => {
  const { mapData, geometry, canvasRef, viewController } = useMapState();
  const weather = useWeatherStore();

  const animate = visible && weather.animate;
  const north = mapData?.northDirection ?? 0;
  const regions = mapData?.regions;

  // Each area's Sky weather for the view day (and hour, when one is set);
  // quiet areas left out
  const skyByArea = useMemo((): Map<string, SkyWeather> => {
    const result = new Map<string, SkyWeather>();
    const day = weather.viewDay;
    if (!animate || !weather.available || day == null) return result;
    const hour = weather.viewTime.hour;
    for (const area of weather.areas) {
      let report = hour != null ? weather.report(area.zoneId, day, hour) : null;
      let hourly = report != null;
      if (report == null) {
        report = weather.report(area.zoneId, day);
        hourly = false;
      }
      if (report == null) continue;
      const sky = toSkyWeather(report, weather.classify(report), hourly);
      if (!isQuietSky(sky)) result.set(area.id, sky);
    }
    return result;
  }, [animate, weather]);

  // Which areas animate, memoized by content: a store version bump that
  // leaves the set alone keeps the same Set, so the clips stay put
  const animatedRef = useRef<ReadonlySet<string>>(new Set());
  const nextAnimated = new Set(skyByArea.keys());
  if (!sameMembers(nextAnimated, animatedRef.current)) animatedRef.current = nextAnimated;
  const animated = animatedRef.current;

  // World-space outlines, shared with WeatherLayer; the Sky keeps the animated ones
  const allShapes = useWeatherShapes(animate);
  const shapeData = useMemo((): { shapes: SkyShape[]; winding: 1 | -1 } => {
    if (allShapes == null || animated.size === 0) return NO_SHAPES;
    return { shapes: allShapes.shapes.filter(shape => animated.has(shape.id)), winding: allShapes.winding };
  }, [allShapes, animated]);

  // Region name plates the Sky leaves clear
  const fogged = allShapes?.fogged ?? null;
  const labels = useMemo(
    (): RegionLabelSpot[] => (geometry?.type === 'hex' && shapeData.shapes.length > 0 ? regionLabelSpots(regions, geometry, fogged) : []),
    [geometry, regions, fogged, shapeData]
  );

  const active = animate && shapeData.shapes.length > 0;

  // Latest inputs for the loop, which is not restarted by input changes
  const inputsRef = useRef({ shapeData, skyByArea, north, geometry, mapData, labels });
  inputsRef.current = { shapeData, skyByArea, north, geometry, mapData, labels };
  const dirtyRef = useRef(true);
  const kickRef = useRef<() => void>(() => undefined);

  const { sized } = useOverlayCanvas(canvasRef, {
    active,
    onResize: () => {
      dirtyRef.current = true;
      kickRef.current();
    },
  });

  // Any input change re-projects the clips (and redraws a still frame)
  useEffect(() => {
    dirtyRef.current = true;
    kickRef.current();
  }, [shapeData, skyByArea, north, geometry, labels]);

  const engineRef = useRef<SkyEngine | null>(null);

  useEffect(() => {
    if (!active) return undefined;
    const main = canvasRef.current;
    if (main == null) return undefined;
    const doc = main.ownerDocument;
    const win = doc.defaultView ?? window;

    engineRef.current ??= new SkyEngine();
    const engine = engineRef.current;

    const motionQuery = win.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = motionQuery.matches;
    let docVisible = doc.visibilityState !== 'hidden';
    let onScreen = true;
    let rafId: number | null = null;
    let lastTime = 0;
    engine.setReducedMotion(reduced);

    const frame: SkyFrame = { width: 0, height: 0, areas: [], mapRotationDeg: 0, pixelRatio: 1 };
    // Name plates to clear after each draw: centre (backing px) and size
    let plates: Array<{ x: number; y: number; w: number; h: number }> = [];
    const stats: SkyDebugStats = { frames: 0, lastMs: 0, avgMs: 0, particles: 0, drawCalls: 0, areas: 0 };

    const project = (overlay: HTMLCanvasElement): void => {
      const inputs = inputsRef.current;
      const geo = inputs.geometry;
      frame.width = overlay.width;
      frame.height = overlay.height;
      frame.mapRotationDeg = inputs.north;
      const cssWidth = main.getBoundingClientRect().width;
      frame.pixelRatio = cssWidth > 0 ? overlay.width / cssWidth : 1;
      const areas: SkyArea[] = [];
      plates = [];
      if (geo != null) {
        const view = viewController?.getLive() ?? inputs.mapData?.viewState ?? DEFAULT_VIEW;
        const transform = createViewportTransform({
          geometry: geo,
          width: overlay.width,
          height: overlay.height,
          zoom: view.zoom,
          center: view.center,
          northDirection: inputs.north,
        });
        for (const shape of inputs.shapeData.shapes) {
          const sky = inputs.skyByArea.get(shape.id);
          if (sky == null) continue;
          const screen = projectSkyShape(shape, transform.worldToBuffer, overlay.width, overlay.height, inputs.shapeData.winding);
          if (screen == null) continue;
          const clip = new Path2D();
          for (const loop of screen.loops) {
            clip.moveTo(loop[0], loop[1]);
            for (let i = 2; i < loop.length; i += 2) clip.lineTo(loop[i], loop[i + 1]);
            clip.closePath();
          }
          areas.push({ id: shape.id, weather: sky, clip, bounds: screen.bounds });
        }
        // The plates are drawn in canvas px, and this canvas is 1:1 with the main one
        for (const label of inputs.labels) {
          const centre = transform.worldToBuffer(label.worldX, label.worldY);
          const plate = regionLabelPlateSize(label.text, view.zoom);
          plates.push({ x: centre.x, y: centre.y, w: plate.width, h: plate.height });
        }
      }
      frame.areas = areas;
      dirtyRef.current = false;
    };

    const render = (now: number): void => {
      const overlay = sized();
      if (overlay == null) return;
      const ctx = overlay.getContext('2d');
      if (ctx == null) return;
      if (!Object.prototype.hasOwnProperty.call(overlay, 'windroseSky')) {
        Object.defineProperty(overlay, 'windroseSky', { value: stats, configurable: true });
      }
      if (dirtyRef.current || overlay.width !== frame.width || overlay.height !== frame.height) project(overlay);
      const dt = lastTime === 0 ? 16 : now - lastTime;
      lastTime = now;
      const t0 = performance.now();
      engine.step(dt, frame);
      engine.draw(ctx, frame);
      if (plates.length > 0) clearPlates(ctx);
      const cost = performance.now() - t0;
      stats.frames++;
      stats.lastMs = cost;
      stats.avgMs = stats.frames === 1 ? cost : stats.avgMs * 0.95 + cost * 0.05;
      stats.particles = engine.stats.particles;
      stats.drawCalls = engine.stats.drawCalls;
      stats.areas = engine.stats.areas;
    };

    // Region names sit on the map canvas under this one: keep them clear.
    // The canvas is rotated by north about its centre, the plates with it.
    const clearPlates = (ctx: CanvasRenderingContext2D): void => {
      const angle = (frame.mapRotationDeg * Math.PI) / 180;
      ctx.save();
      for (const plate of plates) {
        ctx.setTransform(1, 0, 0, 1, plate.x, plate.y);
        if (angle !== 0) ctx.rotate(angle);
        ctx.clearRect(-plate.w / 2, -plate.h / 2, plate.w, plate.h);
      }
      ctx.restore();
    };

    const running = (): boolean => !reduced && docVisible && onScreen;

    const tick = (now: number): void => {
      rafId = null;
      render(now);
      if (running()) rafId = win.requestAnimationFrame(tick);
    };

    const stop = (): void => {
      if (rafId != null) win.cancelAnimationFrame(rafId);
      rafId = null;
    };

    // Start the loop, or (reduced motion) draw one still frame next frame
    const kick = (): void => {
      if (rafId != null || !docVisible) return;
      if (running()) lastTime = 0;
      else if (!reduced) return;
      rafId = win.requestAnimationFrame(tick);
    };
    kickRef.current = kick;

    const onVisibility = (): void => {
      docVisible = doc.visibilityState !== 'hidden';
      if (docVisible) kick();
      else stop();
    };
    const onMotion = (e: MediaQueryListEvent): void => {
      reduced = e.matches;
      engine.setReducedMotion(reduced);
      stop();
      kick();
    };
    doc.addEventListener('visibilitychange', onVisibility);
    motionQuery.addEventListener('change', onMotion);

    let observer: IntersectionObserver | null = null;
    if (typeof win.IntersectionObserver === 'function') {
      observer = new win.IntersectionObserver(entries => {
        const entry = entries[entries.length - 1];
        onScreen = entry.isIntersecting;
        if (onScreen) kick();
        else if (!reduced) stop();
      });
      observer.observe(main);
    }

    const unsubscribeLive = viewController?.subscribeLive(() => {
      dirtyRef.current = true;
      kick();
    });

    dirtyRef.current = true;
    kick();

    return () => {
      stop();
      kickRef.current = () => undefined;
      doc.removeEventListener('visibilitychange', onVisibility);
      motionQuery.removeEventListener('change', onMotion);
      observer?.disconnect();
      unsubscribeLive?.();
      engine.clear();
    };
  }, [active, canvasRef, viewController, sized]);

  // Drop the engine (sprites, pools) with the layer
  useEffect(() => () => {
    engineRef.current?.clear();
    engineRef.current = null;
  }, []);

  return null;
};

export { WeatherSkyLayer };
