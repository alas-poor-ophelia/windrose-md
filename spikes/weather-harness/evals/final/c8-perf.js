(async () => {
  const run = async (label, root) => {
    const sky = skyOf(root);
    if (!sky) return { label, error: 'no sky' };
    const longTasks = [];
    const po = new PerformanceObserver(list => { for (const e of list.getEntries()) longTasks.push(+e.duration.toFixed(1)); });
    po.observe({ type: 'longtask' });
    const costs = []; let lastFrame = sky.windroseSky.frames; const f0 = lastFrame;
    const rafTimes = [];
    const t0 = performance.now();
    await new Promise(res => {
      const tick = (t) => {
        rafTimes.push(t);
        const s = sky.windroseSky;
        if (s.frames !== lastFrame) { costs.push(s.lastMs); lastFrame = s.frames; }
        if (performance.now() - t0 < 5000) requestAnimationFrame(tick); else res();
      };
      requestAnimationFrame(tick);
    });
    po.disconnect();
    const dur = (performance.now() - t0) / 1000;
    costs.sort((a, b) => a - b);
    const gaps = rafTimes.slice(1).map((t, i) => t - rafTimes[i]).sort((a, b) => a - b);
    const avg = costs.reduce((a, b) => a + b, 0) / Math.max(1, costs.length);
    return {
      label, seconds: +dur.toFixed(2), skyFrames: sky.windroseSky.frames - f0, sampledFrames: costs.length,
      avgStepDrawMs: +avg.toFixed(3), p95StepDrawMs: +(costs[Math.floor(costs.length * 0.95)] ?? 0).toFixed(3), maxStepDrawMs: +(costs.at(-1) ?? 0).toFixed(3),
      particles: sky.windroseSky.particles, drawCalls: sky.windroseSky.drawCalls, areas: sky.windroseSky.areas,
      rafFps: +(rafTimes.length / dur).toFixed(1), rafGapP95Ms: +(gaps[Math.floor(gaps.length * 0.95)] ?? 0).toFixed(1),
      longTasks: { count: longTasks.length, totalMs: +longTasks.reduce((a, b) => a + b, 0).toFixed(1), max: Math.max(0, ...longTasks) },
    };
  };
  const leaf = await openFullPane('weather-demo-001');
  await wait(1000);
  const full = await run('full-pane hex, snow both regions', leaf.view.containerEl);
  return { full, canvas: (() => { const s = skyOf(leaf.view.containerEl); return s ? [s.width, s.height] : null; })(), dpr: devicePixelRatio, errors: __errs };
})()
