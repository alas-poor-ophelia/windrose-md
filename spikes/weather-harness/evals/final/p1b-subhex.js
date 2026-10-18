(async () => {
  const out = {};
  // Quiet launch keeps Obsidian's activeWindow on another window; modals mount into activeDocument
  out.activeDocWasDoc = activeDocument === document;
  try { window.activeWindow = window; window.activeDocument = document; } catch (e) { out.activeSetErr = String(e); }
  out.activeDocIsDoc = activeDocument === document;
  const sky = () => { const s = skyOf(document.body); return s ? { frames: s.windroseSky.frames, areas: s.windroseSky.areas } : null; };
  const readStore = async () => JSON.parse(await app.vault.adapter.read('windrose-md-data.json')).maps['weather-demo-001'];
  out.rootStored = (await readStore()).weatherAnimate;
  const s1 = sky(); await wait(1000); const s2 = sky();
  out.rootSky = { s1, s2 };
  // drill into sub-hex 17,5 through the deep-link navigation event
  window.dispatchEvent(new CustomEvent('windrose-navigate-to', { detail: { notePath: 'Weather Demo.md', mapId: 'weather-demo-001', x: 0, y: 0, zoom: 1, layerId: 'hex-layer-1', subHexPath: '17,5', timestamp: Date.now() } }));
  await wait(3500);
  out.railLabels = [...document.querySelectorAll('.windrose-edge-rail-btn')].map(b => b.getAttribute('aria-label'));
  out.breadcrumb = document.querySelector('[class*="breadcrumb"]')?.innerText ?? null;
  const t1 = sky(); await wait(1000); const t2 = sky();
  out.subSkyInherited = { t1, t2 };
  await shot('p1b-subhex-inherited');
  const openWeatherTab = async () => {
    await window.__harnessClick('.windrose-edge-rail-btn[aria-label="Map settings"]');
    const tOpen = performance.now();
    while (!document.querySelector('.windrose-settings-native-modal') && performance.now() - tOpen < 8000) await wait(100);
    out.modalOpenMs = (out.modalOpenMs ?? []).concat([Math.round(performance.now() - tOpen)]);
    await wait(400);
    out.modalDebug = (out.modalDebug ?? []).concat([{ modals: document.querySelectorAll('.modal').length, tabs: [...document.querySelectorAll('.windrose-settings-tab')].map(t => t.textContent.trim()) }]);
    [...document.querySelectorAll('.windrose-settings-tab')].find(b => b.textContent.trim() === 'Weather')?.click(); await wait(600);
    const items = [...document.querySelectorAll('.modal .setting-item')];
    const animItem = items.find(i => /Animate weather/.test(i.textContent));
    return { animItem, select: animItem?.querySelector('select'), toggle: animItem?.querySelector('.checkbox-container') };
  };
  let w = await openWeatherTab();
  out.subTab = { hasSelect: !!w.select, hasToggle: !!w.toggle, options: w.select ? [...w.select.options].map(o => `${o.value}=${o.text}`) : null, value: w.select?.value };
  await shot('p1b-subhex-weather-tab');
  if (w.select) { w.select.value = 'on'; w.select.dispatchEvent(new Event('change', { bubbles: true })); await wait(300); }
  document.querySelector('.modal button.mod-cta')?.click(); await wait(1500);
  Object.values(window.__windrose.mcpInstances)[0].ops.forceSave(); await wait(2500);
  const root = await readStore();
  out.afterOn = { rootStored: root.weatherAnimate, childStored: root.subHexMaps?.['17,5']?.mapData?.weatherAnimate, subHexKeys: Object.keys(root.subHexMaps ?? {}) };
  const u1 = sky(); await wait(1000); const u2 = sky();
  out.subSkyOn = { u1, u2 };
  await shot('p1b-subhex-on');
  w = await openWeatherTab();
  out.reopenValue = w.select?.value;
  if (w.select) { w.select.value = ''; w.select.dispatchEvent(new Event('change', { bubbles: true })); await wait(300); }
  document.querySelector('.modal button.mod-cta')?.click(); await wait(1500);
  Object.values(window.__windrose.mcpInstances)[0].ops.forceSave(); await wait(2500);
  const root2 = await readStore();
  out.afterInherit = { childHasKey: 'weatherAnimate' in (root2.subHexMaps?.['17,5']?.mapData ?? {}) };
  const v1 = sky(); await wait(1000); const v2 = sky();
  out.subSkyInheritAgain = { v1, v2 };
  out.errors = __errs;
  return out;
})()
