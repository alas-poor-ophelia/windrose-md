import fs from 'node:fs';
import path from 'node:path';
const OUT = path.resolve('spikes/lod/h12-ladder-math/out');
const med = (a) => { const s=[...a].sort((x,y)=>x-y); return s.length? s[Math.floor(s.length/2)] : null; };
const rows = [];
for (const d of fs.readdirSync(OUT).sort()) {
  const p = path.join(OUT, d, 'report.json');
  if (!fs.existsSync(p)) continue;
  const r = JSON.parse(fs.readFileSync(p, 'utf8'));
  const cm = r.customMetrics || {};
  const steps = r.steps || [];
  // pop.series[i] is the delta INTO captured frame i; frames are stride-1 so index ~ step+1
  const ser = (r.pop && r.pop.series) || [];
  const cross = [];
  const flat = [];
  for (let i = 0; i < steps.length; i++) {
    const a = steps[i].metrics && steps[i].metrics.childAlpha;
    const v = ser[i + 1];
    if (!Number.isFinite(v) || v === 0) continue;
    if (a > 0.02 && a < 0.98) cross.push(v); else flat.push(v);
  }
  rows.push({
    run: d, ladder: cm.ladder,
    zmax: +Math.max(...steps.map(s => s.zoom || 0)).toFixed(2),
    alphaMax: Math.max(...steps.map(s => (s.metrics && s.metrics.childAlpha) || 0)),
    popMed: r.pop && r.pop.median, popMax: r.pop && r.pop.max, popRatio: r.pop && r.pop.maxOverMedian,
    crossN: cross.length,
    crossMax: cross.length ? +Math.max(...cross).toFixed(3) : null,
    crossMed: cross.length ? +med(cross).toFixed(3) : null,
    crossOverMed: cross.length && r.pop.median ? +(Math.max(...cross) / r.pop.median).toFixed(2) : null,
    pathMean: r.pathDiff && r.pathDiff.mean, pathMax: r.pathDiff && r.pathDiff.max,
    anchorCum: r.anchorDrift && r.anchorDrift.cumulativeMax,
    fidMax: r.fiducialDrift && (r.fiducialDrift.maxPx ?? null),
    holeFail: r.holes && r.holes.failFrames, holeA: r.holes && r.holes.largestArea,
    blank: r.frames && r.frames.blankCount, frozen: r.frames && r.frames.frozenCount,
    p95: r.timing && r.timing.p95, tmax: r.timing && r.timing.max, o50: r.timing && r.timing.over50,
  });
}
console.table(rows);
