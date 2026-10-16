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
 * Clip caching: world-space outlines are rebuilt only when the areas, the
 * fog, the geometry or which areas animate change; their screen projection
 * (a few boundary vertices per area) only when the live viewport, the
 * canvas size or north changes. A frame is step + draw, nothing else.
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

import { useEffect, useMemo, useRef } from 'preact/hooks';
import { useMapState } from '../../context/MapContext';
import { useWeatherStore } from '../../context/WeatherContext';
import { getActiveLayer } from '../../persistence/layerAccessor';
import { useOverlayCanvas } from '../../hooks/canvas/useOverlayCanvas';
import { createViewportTransform } from './viewportTransform';
import { SkyEngine } from '../../weather/sky/SkyEngine';
import { buildSkyShapes, cellWinding, projectSkyShape } from '../../weather/skyClip';
import { collectFoggedKeys, skyCellSource } from '../../weather/skyCells';
import { SKY_DEFAULT_HOUR, isQuietSky, toSkyWeather } from '../../weather/skyWeather';

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

const WeatherSkyLayer = ({ visible }: WeatherSkyLayerProps): VNode | null => {
  const { mapData, geometry, canvasRef, viewController } = useMapState();
  const weather = useWeatherStore();

  const animate = visible && mapData?.weatherAnimate !== false;
  const mapType = geometry?.type ?? 'grid';
  const orientation = mapData?.orientation ?? 'flat';
  const hexBounds = mapData?.hexBounds;
  const north = mapData?.northDirection ?? 0;
  const activeLayer = mapData != null ? getActiveLayer(mapData) : null;
  const fogOfWar = activeLayer?.fogOfWar;
  const paintedCells = activeLayer?.cells;

  // Each area's Sky weather for the view day and hour; quiet areas left out
  const skyByArea = useMemo((): Map<string, SkyWeather> => {
    const result = new Map<string, SkyWeather>();
    const day = weather.viewDay;
    if (!animate || !weather.available || day == null) return result;
    const hour = weather.viewTime.hour ?? SKY_DEFAULT_HOUR;
    for (const area of weather.areas) {
      let report = weather.report(area.zoneId, day, hour);
      let hourly = true;
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

  // Which areas animate, as a memo key: a store version bump that leaves
  // the set alone must not retrace outlines
  const animatedKey = [...skyByArea.keys()].join('|');

  const fogged = useMemo(
    () => collectFoggedKeys(fogOfWar, mapType, orientation),
    [fogOfWar, mapType, orientation]
  );

  // World-space outlines: areas, fog, geometry and the animated set only
  const shapeData = useMemo((): { shapes: SkyShape[]; winding: 1 | -1 } => {
    if (geometry == null || animatedKey === '') return { shapes: [], winding: 1 };
    const animated = new Set(animatedKey.split('|'));
    const source = skyCellSource(geometry, hexBounds, paintedCells);
    return {
      shapes: buildSkyShapes({
        areas: weather.areas,
        fogged,
        cellVertices: source.cellVertices,
        mapCells: source.mapCells,
        include: area => animated.has(area.id),
      }),
      winding: cellWinding(source.cellVertices),
    };
  }, [geometry, hexBounds, paintedCells, weather.areas, fogged, animatedKey]);

  const active = animate && shapeData.shapes.length > 0;

  // Latest inputs for the loop, which is not restarted by input changes
  const inputsRef = useRef({ shapeData, skyByArea, north, geometry, mapData });
  inputsRef.current = { shapeData, skyByArea, north, geometry, mapData };
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
  }, [shapeData, skyByArea, north, geometry]);

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
      const cost = performance.now() - t0;
      stats.frames++;
      stats.lastMs = cost;
      stats.avgMs = stats.frames === 1 ? cost : stats.avgMs * 0.95 + cost * 0.05;
      stats.particles = engine.stats.particles;
      stats.drawCalls = engine.stats.drawCalls;
      stats.areas = engine.stats.areas;
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
