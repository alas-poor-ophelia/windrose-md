(async () => {
  const leaf = app.workspace.getLeaf("tab");
  await leaf.setViewState({ type: "windrose-map-view", active: true, state: { mapId: "weather-demo-001" } });
  await new Promise(r => setTimeout(r, 3000));
  return [...leaf.view.containerEl.querySelectorAll("[aria-label]")].map(e => e.tagName + ":" + e.getAttribute("aria-label")).slice(0, 200);
})()
