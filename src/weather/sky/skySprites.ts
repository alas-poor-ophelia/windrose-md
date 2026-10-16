/**
 * skySprites.ts
 *
 * Pre-rendered soft sprites for the sky engine, built once per engine:
 * lumpy fog banks, lumpy cloud shadows and a snowflake. Each is a stack of
 * seeded radial gradients so the blobs read as vapour rather than discs.
 * Drawing them is a single drawImage with globalAlpha.
 */

import type { SkySpriteCanvas } from './skyTypes';
import { mulberry32 } from './skyMath';

type SpriteCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface SkySprites {
  fog: SkySpriteCanvas[];
  cloud: SkySpriteCanvas[];
  flake: SkySpriteCanvas;
}

export const BLOB_SPRITE_SIZE = 256;
export const FLAKE_SPRITE_SIZE = 32;
export const SPRITE_VARIANTS = 3;

export function defaultCreateCanvas(w: number, h: number): SkySpriteCanvas | null {
  if (typeof OffscreenCanvas === 'undefined') return null;
  return new OffscreenCanvas(w, h);
}

function ctxOf(c: SkySpriteCanvas): SpriteCtx | null {
  return c.getContext('2d');
}

/**
 * A soft lumpy blob: a dim wide base plus several offset puffs, all radial
 * gradients fading to transparent well inside the sprite edge.
 */
function paintBlob(ctx: SpriteCtx, size: number, rgb: string, seed: number, puffs: number, peak: number): void {
  const rng = mulberry32(seed);
  const c = size / 2;
  ctx.clearRect(0, 0, size, size);
  const base = ctx.createRadialGradient(c, c, 0, c, c, c * 0.95);
  base.addColorStop(0, `rgba(${rgb},${peak * 0.5})`);
  base.addColorStop(0.5, `rgba(${rgb},${peak * 0.38})`);
  base.addColorStop(0.8, `rgba(${rgb},${peak * 0.12})`);
  base.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < puffs; i++) {
    const a = rng() * Math.PI * 2;
    const d = rng() * c * 0.42;
    const r = c * (0.28 + rng() * 0.3);
    const x = c + Math.cos(a) * d;
    const y = c + Math.sin(a) * d * 0.8;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const p = peak * (0.15 + rng() * 0.2);
    g.addColorStop(0, `rgba(${rgb},${p})`);
    g.addColorStop(0.6, `rgba(${rgb},${p * 0.4})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
}

/** Snowflake: faint cool shadow offset down-right, then a near-white soft core. */
function paintFlake(ctx: SpriteCtx, size: number): void {
  const c = size / 2;
  ctx.clearRect(0, 0, size, size);
  const sh = ctx.createRadialGradient(c + 1.5, c + 2, 0, c + 1.5, c + 2, c * 0.85);
  sh.addColorStop(0, 'rgba(40,52,70,0.18)');
  sh.addColorStop(1, 'rgba(40,52,70,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(0, 0, size, size);
  const g = ctx.createRadialGradient(c, c, 0, c, c, c * 0.8);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.3, 'rgba(250,252,255,0.8)');
  g.addColorStop(0.6, 'rgba(238,244,252,0.3)');
  g.addColorStop(1, 'rgba(238,244,252,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

/** Build the sprite set, or null when no canvas can be created (node, old hosts). */
export function buildSkySprites(
  create: (w: number, h: number) => SkySpriteCanvas | null,
  seed: number
): SkySprites | null {
  const fog: SkySpriteCanvas[] = [];
  const cloud: SkySpriteCanvas[] = [];
  for (let v = 0; v < SPRITE_VARIANTS; v++) {
    const f = create(BLOB_SPRITE_SIZE, BLOB_SPRITE_SIZE);
    const k = create(BLOB_SPRITE_SIZE, BLOB_SPRITE_SIZE);
    const fc = f ? ctxOf(f) : null;
    const kc = k ? ctxOf(k) : null;
    if (!f || !k || !fc || !kc) return null;
    paintBlob(fc, BLOB_SPRITE_SIZE, '214,209,198', seed + 101 * (v + 1), 7, 1);
    paintBlob(kc, BLOB_SPRITE_SIZE, '14,20,32', seed + 211 * (v + 1), 6, 1);
    fog.push(f);
    cloud.push(k);
  }
  const flake = create(FLAKE_SPRITE_SIZE, FLAKE_SPRITE_SIZE);
  const flc = flake ? ctxOf(flake) : null;
  if (!flake || !flc) return null;
  paintFlake(flc, FLAKE_SPRITE_SIZE);
  return { fog, cloud, flake };
}
