(async () => {
  const out = {};
  window.activeWindow = window; window.activeDocument = document;
  const readStore = async () => JSON.parse(await app.vault.adapter.read('windrose-md-data.json')).maps['weather-demo-001'];
  out.rootStoredBefore = (await readStore()).weatherAnimate;
  out.skyBefore = !!skyOf(document.body);
  await window.__harnessClick('.windrose-edge-rail-btn[aria-label="Map settings"]'); await wait(1000);
  [...document.querySelectorAll('.windrose-settings-tab')].find(b => b.textContent.trim() === 'Weather')?.click(); await wait(600);
  const item = [...document.querySelectorAll('.modal .setting-item')].find(i => /Animate weather/.test(i.textContent));
  const toggle = item?.querySelector('.checkbox-container');
  out.root = { hasToggle: !!toggle, hasSelect: !!item?.querySelector('select'), toggleOn: toggle?.classList.contains('is-enabled') };
  await shot('p1b-root-weather-tab');
  toggle?.click(); await wait(300);
  out.toggleOnAfterClick = toggle?.classList.contains('is-enabled');
  document.querySelector('.modal button.mod-cta')?.click(); await wait(1500);
  Object.values(window.__windrose.mcpInstances)[0].ops.forceSave(); await wait(2500);
  out.rootHasKeyAfterOn = 'weatherAnimate' in (await readStore());
  const s = skyOf(document.body); const f0 = s?.windroseSky.frames; await wait(1000);
  out.skyAfter = s ? { framesPerSec: s.windroseSky.frames - f0, areas: s.windroseSky.areas } : null;
  out.errors = __errs;
  return out;
})()
