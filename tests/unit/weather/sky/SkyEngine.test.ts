import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { SkyEngine } from "../../../../src/weather/sky/SkyEngine";
import { clampDt, MAX_STEP_MS, mulberry32, screenWindVector } from "../../../../src/weather/sky/skyMath";
import type { SkyArea, SkyFrame, SkyWeather } from "../../../../src/weather/sky/skyTypes";

// ---------------------------------------------------------------- doubles

type Log = string[];

/** A 2D context that records every method call and property write. */
function recordingContext(log: Log): CanvasRenderingContext2D {
  const state: Record<string, unknown> = {};
  return new Proxy(state, {
    get(target, prop) {
      if (typeof prop !== "string") return undefined;
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        log.push(`${prop}(${args.length})`);
        if (prop.startsWith("create")) return { addColorStop: () => undefined };
        return undefined;
      };
    },
    set(target, prop, value) {
      if (typeof prop === "string") {
        log.push(`${prop}=${String(value)}`);
        target[prop] = value;
      }
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

/** Path2D stand-in (node has none). */
class FakePath2D {
  moveTo(): void { /* noop */ }
  lineTo(): void { /* noop */ }
  closePath(): void { /* noop */ }
}

// --------------------------------------------------------------- fixtures

function weather(over: Partial<SkyWeather> = {}): SkyWeather {
  return {
    precipType: "rain",
    intensity: 1,
    precipActive: true,
    windSpeedKph: 20,
    windFromDeg: 270,
    cloudCover: 0.5,
    fog: false,
    visibilityKm: 10,
    beaufort: 4,
    temperatureC: 10,
    ...over,
  };
}

function area(id: string, w: SkyWeather, x = 0, y = 0, bw = 400, bh = 300): SkyArea {
  return { id, weather: w, clip: new FakePath2D() as unknown as Path2D, bounds: { x, y, w: bw, h: bh } };
}

function frame(areas: SkyArea[], mapRotationDeg = 0): SkyFrame {
  return { width: 1600, height: 1000, areas, mapRotationDeg };
}

function run(engine: SkyEngine, f: SkyFrame, ms: number, dt = 16): void {
  for (let t = 0; t < ms; t += dt) engine.step(dt, f);
}

function median(a: number[]): number {
  const s = [...a].sort((p, q) => p - q);
  return s[Math.floor(s.length / 2)];
}

/** Per-particle displacement over one small step (index-aligned; swap-removes are outliers). */
function displacement(engine: SkyEngine, f: SkyFrame, id: string, dt: number): { dx: number[]; dy: number[] } {
  const before = engine.inspect(id)!;
  engine.step(dt, f);
  const after = engine.inspect(id)!;
  const n = Math.min(before.n, after.n);
  const dx: number[] = [];
  const dy: number[] = [];
  for (let i = 0; i < n; i++) {
    dx.push(after.x[i] - before.x[i]);
    dy.push(after.y[i] - before.y[i]);
  }
  return { dx, dy };
}

beforeEach(() => {
  vi.stubGlobal("Path2D", FakePath2D);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// ------------------------------------------------------------------ tests

describe("skyMath", () => {
  it("screen wind: from west blows toward +x at rotation 0", () => {
    const v = screenWindVector(270, 0);
    expect(v.x).toBeCloseTo(1, 6);
    expect(v.y).toBeCloseTo(0, 6);
  });

  it("screen wind: from north blows down the screen (+y)", () => {
    const v = screenWindVector(0, 0);
    expect(v.x).toBeCloseTo(0, 6);
    expect(v.y).toBeCloseTo(1, 6);
  });

  it("screen wind: map rotation 90 turns a westerly to +y", () => {
    const v = screenWindVector(270, 90);
    expect(v.x).toBeCloseTo(0, 6);
    expect(v.y).toBeCloseTo(1, 6);
  });

  it("clampDt caps hitches and rejects junk", () => {
    expect(clampDt(5000)).toBe(MAX_STEP_MS);
    expect(clampDt(16)).toBe(16);
    expect(clampDt(-3)).toBe(0);
    expect(clampDt(Number.NaN)).toBe(0);
  });

  it("mulberry32 is deterministic and in [0,1)", () => {
    const a = mulberry32(9);
    const b = mulberry32(9);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("SkyEngine budget", () => {
  it("never exceeds maxParticles across many areas", () => {
    const engine = new SkyEngine({ seed: 1 });
    const areas: SkyArea[] = [];
    for (let i = 0; i < 40; i++) {
      const type = (["rain", "snow", "drizzle", "sleet"] as const)[i % 4];
      areas.push(area(`a${i}`, weather({ precipType: type }), (i % 8) * 200, Math.floor(i / 8) * 200, 200 + (i % 3) * 120, 200));
    }
    const f = frame(areas);
    for (let k = 0; k < 60; k++) {
      engine.step(16, f);
      expect(engine.stats.particles).toBeLessThanOrEqual(1800);
    }
    let sum = 0;
    for (const a of areas) sum += engine.inspect(a.id)!.n;
    expect(sum).toBe(engine.stats.particles);
    expect(engine.stats.particles).toBeGreaterThan(1500); // the budget is actually used
  });

  it("an area that wants nothing does not take a share", () => {
    const engine = new SkyEngine({ seed: 1, maxParticles: 500 });
    const f = frame([area("rain", weather()), area("clear", weather({ precipType: "none" }))]);
    run(engine, f, 200);
    expect(engine.inspect("clear")!.n).toBe(0);
    expect(engine.inspect("rain")!.n).toBeGreaterThan(450);
  });

  it("truncates immediately when new areas shrink an area's share", () => {
    const engine = new SkyEngine({ seed: 3, maxParticles: 600 });
    const a = area("a", weather(), 0, 0, 800, 600);
    run(engine, frame([a]), 200);
    expect(engine.stats.particles).toBeGreaterThan(550);
    const crowd = [a];
    for (let i = 0; i < 5; i++) crowd.push(area(`b${i}`, weather(), 800, i * 150, 800, 600));
    engine.step(16, frame(crowd));
    expect(engine.stats.particles).toBeLessThanOrEqual(600);
    expect(engine.inspect("a")!.n).toBeLessThan(200);
  });
});

describe("SkyEngine lifecycle", () => {
  it("precipActive=false stops spawning and drains to zero", () => {
    for (const type of ["rain", "snow", "sleet", "drizzle"] as const) {
      const engine = new SkyEngine({ seed: 5 });
      const on = area("x", weather({ precipType: type }));
      run(engine, frame([on]), 500);
      expect(engine.stats.particles).toBeGreaterThan(0);
      const off = { ...on, weather: weather({ precipType: type, precipActive: false }) };
      const f = frame([off]);
      engine.step(16, f);
      const right = engine.stats.particles;
      expect(right).toBeGreaterThan(0); // existing particles fall out, no instant cut
      run(engine, f, 12000, 50);
      expect(engine.stats.particles).toBe(0);
    }
  });

  it("removing an area frees its particles", () => {
    const engine = new SkyEngine({ seed: 2 });
    const a = area("a", weather());
    const b = area("b", weather({ precipType: "snow" }), 500, 0);
    run(engine, frame([a, b]), 300);
    expect(engine.stats.areas).toBe(2);
    engine.step(16, frame([b]));
    expect(engine.stats.areas).toBe(1);
    expect(engine.inspect("a")).toBeNull();
    expect(engine.stats.particles).toBe(engine.inspect("b")!.n);
  });

  it("offscreen areas hold no particles", () => {
    const engine = new SkyEngine({ seed: 2 });
    run(engine, frame([area("far", weather(), 5000, 5000)]), 200);
    expect(engine.stats.particles).toBe(0);
  });

  it("rescales particles when bounds change size (zoom)", () => {
    const engine = new SkyEngine({ seed: 4, reducedMotion: true });
    const w = weather({ precipType: "snow" });
    engine.step(16, frame([area("z", w, 0, 0, 400, 300)]));
    const before = engine.inspect("z")!;
    engine.step(16, frame([area("z", w, 0, 0, 800, 600)]));
    const after = engine.inspect("z")!;
    expect(after.n).toBeGreaterThanOrEqual(before.n); // bigger on screen, more wanted
    for (let i = 0; i < before.n; i++) {
      expect(after.x[i]).toBeCloseTo(before.x[i] * 2, 3);
      expect(after.y[i]).toBeCloseTo(before.y[i] * 2, 3);
    }
  });
});

describe("SkyEngine wind", () => {
  it("wind from 270 carries snow toward +x at map rotation 0", () => {
    const engine = new SkyEngine({ seed: 8 });
    const f = frame([area("s", weather({ precipType: "snow", windSpeedKph: 60 }), 0, 0, 900, 900)]);
    run(engine, f, 100);
    const { dx, dy } = displacement(engine, f, "s", 16);
    expect(median(dx)).toBeGreaterThan(1);
    expect(Math.abs(median(dx))).toBeGreaterThan(Math.abs(median(dy)));
  });

  it("map rotation 90 turns the same wind down the screen", () => {
    const engine = new SkyEngine({ seed: 8 });
    const f = frame([area("s", weather({ precipType: "snow", windSpeedKph: 60 }), 0, 0, 900, 900)], 90);
    run(engine, f, 100);
    const { dx, dy } = displacement(engine, f, "s", 16);
    expect(median(dy)).toBeGreaterThan(1);
    expect(Math.abs(median(dx))).toBeLessThan(median(dy) / 3);
  });

  it("rain moves downwind too", () => {
    const engine = new SkyEngine({ seed: 8 });
    const f = frame([area("r", weather({ windSpeedKph: 60 }), 0, 0, 900, 900)]);
    run(engine, f, 100);
    const { dx } = displacement(engine, f, "r", 8);
    expect(median(dx)).toBeGreaterThan(1);
  });
});

describe("SkyEngine time", () => {
  it("reducedMotion lays out a static scatter that never moves", () => {
    const engine = new SkyEngine({ seed: 6, reducedMotion: true });
    const f = frame([area("r", weather()), area("s", weather({ precipType: "snow" }), 500, 0)]);
    engine.step(16, f);
    const a = engine.inspect("s")!;
    expect(a.n).toBeGreaterThan(0);
    engine.step(16, f);
    engine.step(1000, f);
    const b = engine.inspect("s")!;
    expect(Array.from(b.x)).toEqual(Array.from(a.x));
    expect(Array.from(b.y)).toEqual(Array.from(a.y));
    expect(engine.inspect("r")!.n).toBeGreaterThan(0);
  });

  it("is deterministic for a seed", () => {
    const mk = (seed: number): SkyEngine => new SkyEngine({ seed });
    const f = frame([area("r", weather()), area("s", weather({ precipType: "sleet" }), 500, 100)]);
    const a = mk(42), b = mk(42), c = mk(43);
    for (const e of [a, b, c]) run(e, f, 800);
    for (const id of ["r", "s"]) {
      expect(Array.from(a.inspect(id)!.x)).toEqual(Array.from(b.inspect(id)!.x));
      expect(Array.from(a.inspect(id)!.kind)).toEqual(Array.from(b.inspect(id)!.kind));
    }
    expect(Array.from(a.inspect("r")!.x)).not.toEqual(Array.from(c.inspect("r")!.x));
  });

  it("area order does not change an area's stream", () => {
    const r = area("r", weather());
    const s = area("s", weather({ precipType: "snow" }), 500, 0);
    const a = new SkyEngine({ seed: 11 });
    const b = new SkyEngine({ seed: 11 });
    run(a, frame([r, s]), 300);
    run(b, frame([s, r]), 300);
    expect(Array.from(a.inspect("s")!.y)).toEqual(Array.from(b.inspect("s")!.y));
  });

  it("clamps a 5 s hitch to one max step", () => {
    const f = frame([area("s", weather({ precipType: "snow", windSpeedKph: 80 }), 0, 0, 900, 900)]);
    const a = new SkyEngine({ seed: 21 });
    const b = new SkyEngine({ seed: 21 });
    run(a, f, 200);
    run(b, f, 200);
    a.step(5000, f);
    b.step(MAX_STEP_MS, f);
    expect(Array.from(a.inspect("s")!.x)).toEqual(Array.from(b.inspect("s")!.x));
    expect(Array.from(a.inspect("s")!.y)).toEqual(Array.from(b.inspect("s")!.y));
  });
});

describe("SkyEngine draw", () => {
  it("clears, clips per area and batches rain into a few strokes", () => {
    const engine = new SkyEngine({ seed: 7, createCanvas: () => null });
    const f = frame([area("r", weather({ cloudCover: 0 })), area("s", weather({ precipType: "none", fog: true, visibilityKm: 0.2 }), 500, 0)]);
    run(engine, f, 300);
    const log: Log = [];
    engine.draw(recordingContext(log), f);
    expect(log[0]).toBe("save(0)");
    expect(log).toContain("clearRect(4)");
    expect(log.filter((l) => l === "clip(1)")).toHaveLength(2);
    const rainN = engine.inspect("r")!.n;
    expect(rainN).toBeGreaterThan(300);
    const strokes = log.filter((l) => l === "stroke(0)").length;
    expect(strokes).toBeLessThanOrEqual(4); // 3 depth buckets + splashes
    expect(log.filter((l) => l === "moveTo(2)").length).toBeGreaterThan(rainN * 0.5);
    expect(engine.stats.drawCalls).toBeGreaterThan(0);
    // save/restore balanced
    expect(log.filter((l) => l === "save(0)").length).toBe(log.filter((l) => l === "restore(0)").length);
  });

  it("accepts a function clip", () => {
    const engine = new SkyEngine({ seed: 7, createCanvas: () => null });
    const clip = vi.fn();
    const a: SkyArea = { id: "f", weather: weather(), clip, bounds: { x: 0, y: 0, w: 300, h: 300 } };
    const f = frame([a]);
    engine.step(16, f);
    const log: Log = [];
    engine.draw(recordingContext(log), f);
    expect(clip).toHaveBeenCalledTimes(1);
    expect(log).toContain("clip(0)");
  });

  it("flashes lightning in a storm, never in calm rain", () => {
    const flashes = (w: SkyWeather): number => {
      const engine = new SkyEngine({ seed: 13, createCanvas: () => null });
      const f = frame([area("st", w)]);
      let n = 0;
      for (let t = 0; t < 30000; t += 50) {
        engine.step(50, f);
        const log: Log = [];
        engine.draw(recordingContext(log), f);
        if (log.includes("fillStyle=rgb(226,232,255)")) n++;
      }
      return n;
    };
    expect(flashes(weather({ beaufort: 9, windSpeedKph: 80 }))).toBeGreaterThan(0);
    expect(flashes(weather({ beaufort: 5 }))).toBe(0);
    expect(flashes(weather({ beaufort: 10, precipType: "snow" }))).toBe(0);
  });
});
