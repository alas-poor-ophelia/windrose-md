globalThis.__HARNESS_MAP_ID = "weather-grid-001";
// Open the map named by MAP_ID in a full-pane Windrose view, wait for the Sky, return its stats.
(async () => {
  const MAP_ID = globalThis.__HARNESS_MAP_ID ?? "weather-demo-001";
  const leaf = app.workspace.getLeaf("tab");
  await leaf.setViewState({ type: "windrose-map-view", active: true, state: { mapId: MAP_ID } });
  await app.workspace.revealLeaf(leaf);
  await new Promise(r => setTimeout(r, 2500));
  // Fold the side panels so the map fills the pane
  for (const b of leaf.view.containerEl.querySelectorAll('button[aria-label*="Collapse"], button[aria-label="Objects — open"]')) b.click();
  await new Promise(r => setTimeout(r, 2500));
  const view = leaf.view.containerEl;
  const sky = [...view.querySelectorAll("canvas.windrose-overlay-layer")].map(c => ({ w: c.width, h: c.height, stats: c.windroseSky ? { ...c.windroseSky } : null }));
  const main = view.querySelector(".windrose-canvas-wrapper canvas");
  const compass = view.querySelector(".windrose-compass-wind");
  const tip = view.querySelector(".windrose-compass-standalone, .windrose-compass-animated")?.getAttribute("aria-label");
  return { sky, main: main ? [main.width, main.height, main.getBoundingClientRect().width] : null, compass: !!compass, tip, svg: !!view.querySelector(".windrose-weather-overlay") };
})()
