(async () => {
  const P = app.plugins;
  const out = {};
  const weatherUi = () => ({
    skyCanvas: !!skyOf(document.body),
    skyFrames: skyOf(document.body)?.windroseSky.frames ?? null,
    weatherOverlay: document.querySelectorAll('.windrose-weather-overlay').length,
    badges: [...document.querySelectorAll('.windrose-weather-overlay text')].map(t => t.textContent).filter(Boolean).length,
    almanacRail: [...document.querySelectorAll('.windrose-edge-rail-btn')].some(b => b.getAttribute('aria-label') === 'Almanac'),
    compassWind: !!document.querySelector('.windrose-compass-wind'),
    mapMounted: !!document.querySelector('.windrose-container'),
  });
  const travel = () => P.plugins.wadjet?.api?.listInterpreters?.('travel').map(i => i.id) ?? 'no wadjet';
  out.s0 = { ui: weatherUi(), travel: travel() };
  await P.disablePlugin('wadjet'); await wait(2500);
  out.wadjetOff = { ui: weatherUi(), errorsSoFar: __errs.length };
  await shot('c6-wadjet-disabled');
  await P.enablePlugin('wadjet');
  for (let i = 0; i < 40 && !(P.plugins.wadjet?.api?.ready); i++) await wait(250);
  await wait(2500);
  out.wadjetOn = { ui: weatherUi(), travel: travel() };
  await shot('c6-wadjet-reenabled');
  await P.disablePlugin('windrose-md'); await wait(2000);
  out.windroseOff = { travel: travel(), mapMounted: !!document.querySelector('.windrose-container') };
  await P.enablePlugin('windrose-md'); await wait(1000);
  for (let i = 0; i < 40 && !P.plugins['windrose-md']?._loaded; i++) await wait(250);
  await wait(1500);
  // re-render the note so the map block mounts again
  const leaf = app.workspace.getLeaf(false);
  await leaf.openFile(app.vault.getAbstractFileByPath('Weather Grid Demo.md')); await wait(800);
  await leaf.openFile(app.vault.getAbstractFileByPath('Weather Demo.md')); await wait(3500);
  out.windroseOn = { travel: travel(), ui: weatherUi() };
  await shot('c6-windrose-reenabled');
  out.errors = __errs;
  return out;
})()
