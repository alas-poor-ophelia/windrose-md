/**
 * spikes/lod/_shared/fixtureDemo.ts
 *
 * The simplest possible proof that `fixture.ts` is geometrically correct:
 * draw the root rosette, then every child doc composited OVER it at its own
 * affine. No LOD, no caching, no culling cleverness — if the children land
 * inside their parent hexes and the ring-7 hull shows its 30-degree rotation
 * against the parent hex outline, the fixture is right.
 *
 * Reached from `_template` via `?fixture=1`.
 */
import {
  buildFixture, docToWorld, FIDUCIAL_COLOR, HEX_SIZE,
  type Doc, type Fixture,
} from './fixture';
import { startFrameClock } from './instrument';

interface DrawCell { wx: number; wy: number; color: string }
interface DocDraw {
  doc: Doc;
  worldHexSize: number;     // HEX_SIZE * transform.scale
  cells: DrawCell[];
  parentHexOutline: Array<{ x: number; y: number }> | null; // ROOT world px
}

function flatCorners(radius: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * 60 * i;
    out.push({ x: radius * Math.cos(a), y: radius * Math.sin(a) });
  }
  return out;
}

function prepare(fx: Fixture): DocDraw[] {
  return fx.docs
    .slice()
    .sort((a, b) => a.depth - b.depth)
    .map((doc) => {
      const cells: DrawCell[] = [];
      for (const c of doc.cells.values()) {
        const local = doc.geometry.hexToWorld(c.q, c.r);
        const w = docToWorld(doc, local.worldX, local.worldY);
        cells.push({ wx: w.x, wy: w.y, color: c.color });
      }
      let parentHexOutline: Array<{ x: number; y: number }> | null = null;
      if (doc.parentId && doc.parentHex) {
        const parent = fx.byId.get(doc.parentId) as Doc;
        const verts = parent.geometry.getHexVertices(doc.parentHex.q, doc.parentHex.r);
        parentHexOutline = verts.map((v) => docToWorld(parent, v.worldX, v.worldY));
      }
      return { doc, worldHexSize: HEX_SIZE * doc.transformToWorld.scale, cells, parentHexOutline };
    });
}

export function runFixtureDemo(): void {
  const params = new URLSearchParams(location.search);
  const SEED = Number(params.get('seed') ?? 1) || 1;
  const fx = buildFixture(SEED);
  const draws = prepare(fx);

  // Zoom range: min fills the frame while centred on the fiducial; max resolves
  // the depth-2 rosette (its cells are HEX_SIZE/225 = 0.356 world px across).
  const MIN_ZOOM = 0.62;
  const MAX_ZOOM = 400;
  const WHEEL_K = 0.0015;

  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

  let cssW = 0;
  let cssH = 0;
  let zoom = MIN_ZOOM;
  let offX = 0;
  let offY = 0;

  let cellsDrawn = 0;
  let docsLive = 0;
  let deepestDrawn = 0;
  let framesDrawn = 0;
  const cellsTotal = draws.reduce((n, d) => n + d.cells.length, 0);

  function resize(): void {
    const dpr = window.devicePixelRatio || 1;
    cssW = window.innerWidth;
    cssH = window.innerHeight;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function home(): void {
    // Park the fiducial under capture.mjs's cursor home (0.32w, 0.38h) so a
    // plain `zoom-in` dives straight through root -> range -> grand (depth 2).
    zoom = MIN_ZOOM;
    offX = cssW * 0.32 - fx.fiducial.x * zoom;
    offY = cssH * 0.38 - fx.fiducial.y * zoom;
  }

  function worldAt(x: number, y: number): { x: number; y: number } {
    return { x: (x - offX) / zoom, y: (y - offY) / zoom };
  }
  function screenOf(wx: number, wy: number): { x: number; y: number } {
    return { x: offX + wx * zoom, y: offY + wy * zoom };
  }
  function zoomAbout(next: number, ax: number, ay: number): void {
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
    const w = worldAt(ax, ay);
    zoom = clamped;
    offX = ax - w.x * zoom;
    offY = ay - w.y * zoom;
  }

  const clock = startFrameClock();

  function strokeWorldPoly(pts: Array<{ x: number; y: number }>, close: boolean): void {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const s = screenOf(pts[i].x, pts[i].y);
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
    }
    if (close) ctx.closePath();
    ctx.stroke();
  }

  function draw(): void {
    clock.beginDraw();
    ctx.fillStyle = '#0b0e13';
    ctx.fillRect(0, 0, cssW, cssH);

    cellsDrawn = 0;
    docsLive = 0;
    deepestDrawn = 0;

    for (const d of draws) {
      const scaled = d.worldHexSize * zoom;      // hex radius in CSS px
      if (scaled < 0.55) continue;               // sub-pixel: parent already covers it
      const corners = flatCorners(d.worldHexSize);
      const margin = scaled * 2;
      let any = 0;

      ctx.lineWidth = Math.max(0.4, Math.min(1.4, scaled * 0.04));
      ctx.strokeStyle = 'rgba(0,0,0,0.42)';
      const stroke = scaled >= 5;

      for (const c of d.cells) {
        const sx = offX + c.wx * zoom;
        const sy = offY + c.wy * zoom;
        if (sx < -margin || sy < -margin || sx > cssW + margin || sy > cssH + margin) continue;
        ctx.beginPath();
        ctx.moveTo(sx + corners[0].x * zoom, sy + corners[0].y * zoom);
        for (let k = 1; k < 6; k++) ctx.lineTo(sx + corners[k].x * zoom, sy + corners[k].y * zoom);
        ctx.closePath();
        ctx.fillStyle = c.color;
        ctx.fill();
        if (stroke) ctx.stroke();
        any++;
      }

      cellsDrawn += any;
      if (any) {
        docsLive++;
        deepestDrawn = Math.max(deepestDrawn, d.doc.depth);
        // the parent hex this doc fills: the ring-7 hull is rotated 30 degrees
        // against it and UNDER-fills it at the parent's corners.
        if (d.parentHexOutline) {
          ctx.lineWidth = Math.max(1, Math.min(3, scaled * 0.3));
          ctx.strokeStyle = 'rgba(255,214,64,0.95)';
          strokeWorldPoly(d.parentHexOutline, true);
        }
      }
    }

    // road (crosses the forestA/forestB boundary)
    for (const road of fx.roads) {
      ctx.lineWidth = Math.max(1, road.width * zoom);
      ctx.strokeStyle = road.color;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      strokeWorldPoly(road.points, false);
    }

    // secret landmark marker
    if (fx.secret) {
      const s = screenOf(fx.secret.x, fx.secret.y);
      if (s.x > -40 && s.y > -40 && s.x < cssW + 40 && s.y < cssH + 40) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 8, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // fiducial (pixel-domain anchor target)
    {
      const s = screenOf(fx.fiducial.x, fx.fiducial.y);
      ctx.fillStyle = FIDUCIAL_COLOR;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // labels, one per depth, drawn only while legible
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const l of fx.labels) {
      const px = l.fontSize * zoom;
      if (px < 9 || px > 260) continue;
      const s = screenOf(l.x, l.y);
      ctx.font = `${px.toFixed(1)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.lineWidth = Math.max(2, px * 0.14);
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(l.text, s.x, s.y);
      ctx.fillStyle = '#f2ead8';
      ctx.fillText(l.text, s.x, s.y);
    }
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';

    // HUD
    ctx.fillStyle = 'rgba(8,11,16,0.80)';
    ctx.fillRect(8, 8, 300, 64);
    ctx.fillStyle = '#dfe7f2';
    ctx.font = '13px ui-monospace, Consolas, monospace';
    ctx.fillText(`fixture  zoom ${zoom.toFixed(3)}`, 16, 26);
    ctx.fillText(`docs ${docsLive}/${draws.length}  deepest d${deepestDrawn}`, 16, 44);
    ctx.fillText(`cells ${cellsDrawn}/${cellsTotal}`, 16, 62);

    framesDrawn++;
    clock.endDraw();
  }

  function loop(): void {
    draw();
    requestAnimationFrame(loop);
  }

  canvas.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault();
    zoomAbout(zoom * Math.exp(-e.deltaY * WHEEL_K), e.clientX, e.clientY);
  }, { passive: false });

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener('pointerdown', (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e: PointerEvent) => {
    if (!dragging) return;
    offX += e.clientX - lastX;
    offY += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  const endDrag = (e: PointerEvent): void => {
    dragging = false;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  window.addEventListener('resize', () => { resize(); });

  resize();
  home();

  const ready = new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      draw();
      requestAnimationFrame(() => { loop(); resolve(); });
    });
  });

  (window as unknown as { __lod: unknown }).__lod = {
    ready,
    worldAt,
    screenOf,
    getZoom: () => zoom,
    setZoom: (z: number, ax?: number, ay?: number) => zoomAbout(z, ax ?? cssW / 2, ay ?? cssH / 2),
    zoomRange: () => ({ min: MIN_ZOOM, max: MAX_ZOOM }),
    metrics: () => ({
      levelsLive: docsLive,
      docsTotal: draws.length,
      deepestDrawn,
      cellsTotal,
      cellsDrawn,
      framesDrawn,
    }),
    reset: () => { resize(); home(); clock.clear(); },
  };
}
