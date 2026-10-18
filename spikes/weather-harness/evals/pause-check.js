// The note embed animates; once a full-pane tab covers it, its Sky loop stops (IntersectionObserver).
(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const skyOf = root => [...root.querySelectorAll("canvas.windrose-overlay-layer")].find(c => c.windroseSky);
  await wait(1500);
  const noteRoot = app.workspace.getActiveViewOfType(app.workspace.activeLeaf.view.constructor)?.containerEl ?? document.body;
  const embed = skyOf(noteRoot);
  if (!embed) return { error: "no sky canvas in the note embed" };
  const a0 = embed.windroseSky.frames; await wait(1000); const a1 = embed.windroseSky.frames;
  const leaf = app.workspace.getLeaf("tab");
  await leaf.setViewState({ type: "windrose-map-view", active: true, state: { mapId: "weather-demo-001" } });
  await app.workspace.revealLeaf(leaf);
  await wait(2500);
  const b0 = embed.windroseSky.frames; await wait(1500); const b1 = embed.windroseSky.frames;
  const full = skyOf(leaf.view.containerEl);
  const c0 = full?.windroseSky.frames; await wait(1000); const c1 = full?.windroseSky.frames;
  return {
    embedVisibleFramesPerSec: a1 - a0,
    embedHiddenFramesIn1500ms: b1 - b0,
    fullPaneFramesPerSec: c1 - c0,
    embedConnected: embed.isConnected,
    fullPaneCost: full ? { avgMs: +full.windroseSky.avgMs.toFixed(3), lastMs: +full.windroseSky.lastMs.toFixed(3), particles: full.windroseSky.particles, drawCalls: full.windroseSky.drawCalls } : null,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
})()
