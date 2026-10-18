/**
 * skyTypes.ts
 *
 * Input contract for the animated weather sky engine. Deliberately free of
 * plugin types: the integrating layer maps its weather reports and region
 * geometry onto these shapes, so the engine stays pure and testable.
 *
 * All coordinates are SCREEN space in canvas backing-store pixels (i.e. CSS
 * pixels multiplied by devicePixelRatio), with no transform applied.
 */

export type SkyPrecipType = 'none' | 'drizzle' | 'rain' | 'sleet' | 'snow';

export interface SkyWeather {
  precipType: SkyPrecipType;
  /** 0..1 */
  intensity: number;
  /** Hourly window; false = no precipitation right now (existing particles fall out). */
  precipActive: boolean;
  windSpeedKph: number;
  /** Meteorological FROM direction in degrees, 0 = from north, clockwise. */
  windFromDeg: number;
  /** 0..1 */
  cloudCover: number;
  fog: boolean;
  visibilityKm: number;
  /** 0..12 */
  beaufort: number;
  temperatureC: number;
}

export interface SkyRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SkyArea {
  /** Stable key: particle state is kept per id across frames. */
  id: string;
  weather: SkyWeather;
  /** Clip shape in screen backing px. A function is called between beginPath() and clip(). */
  clip: Path2D | ((ctx: CanvasRenderingContext2D) => void);
  /** Screen-space bounding box of the clip shape (backing px). */
  bounds: SkyRect;
}

export interface SkyFrame {
  /** Canvas backing-store size. */
  width: number;
  height: number;
  areas: SkyArea[];
  /**
   * Clockwise screen rotation of map north, in degrees (Windrose's
   * `mapData.northDirection`; the renderer applies ctx.rotate(+north)).
   */
  mapRotationDeg: number;
  /** Map scale; used to size cloud shadows (a cloud is a few km across). */
  pixelsPerKm?: number;
  /** devicePixelRatio of the backing store; scales streak widths, sprite sizes and speeds. Default 1. */
  pixelRatio?: number;
}

export interface SkyEngineOptions {
  /** Global precipitation particle budget shared by all areas. Default 1800. */
  maxParticles?: number;
  /** PRNG seed (mulberry32). Default 0x5eed. */
  seed?: number;
  /** Lay out a static scatter instead of animating. */
  reducedMotion?: boolean;
  /**
   * Factory for the sprite cache canvases. Defaults to OffscreenCanvas when
   * available; when it returns null the engine falls back to plain shapes.
   */
  createCanvas?: (w: number, h: number) => SkySpriteCanvas | null;
}

export type SkySpriteCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface SkyStats {
  /** Live precipitation particles (rain, drizzle, snow, sleet, splashes). */
  particles: number;
  /** Areas holding state. */
  areas: number;
  /** Draw calls issued by the last draw() (stroke/fill/drawImage/fillRect). */
  drawCalls: number;
}
