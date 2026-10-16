(async () => {
  const api = app.plugins.plugins.wadjet.api;
  const out = { apiVersion: api.apiVersion ?? null, version: api.version, hasAdvance: typeof api.advance, hasGlyph: typeof api.glyph, hasInterpreters: typeof api.registerInterpreter };
  const plugin = app.plugins.plugins['windrose-md'];
  plugin.settings.travelPacks = [{
    id: 'harness-pack', name: 'Harness travel', enabled: true, units: [], terrains: [],
    modes: [{ id: 'foot', name: 'On foot', distance: 24, unit: { type: 'standard', unit: 'mi' }, timeValue: 8, timeUnit: 'hours' }],
    allowances: [{ id: 'day8', name: '8 hours', timeValue: 8, timeUnit: 'hours' }],
  }];
  plugin.settings.defaultTravelSettings = { modeIds: ['foot'], allowanceId: 'day8' };
  await plugin.saveSettings();
  window.dispatchEvent(new Event('windrose-settings-changed'));
  await wait(800);
  out.ui = {
    skyCanvas: !!skyOf(document.body),
    skyStats: skyOf(document.body) ? { ...skyOf(document.body).windroseSky } : null,
    weatherOverlay: document.querySelectorAll('.windrose-weather-overlay').length,
    badges: [...document.querySelectorAll('.windrose-weather-overlay text')].map(t => t.textContent).filter(Boolean),
    badgeGlyphSvgs: document.querySelectorAll('.windrose-weather-overlay svg svg, .windrose-weather-badge-glyph svg').length,
    compassWind: !!document.querySelector('.windrose-compass-wind'),
  };
  const almBtn = [...document.querySelectorAll('.windrose-edge-rail-btn')].find(b => b.getAttribute('aria-label') === 'Almanac');
  out.almanacRail = !!almBtn;
  almBtn?.click(); await wait(800);
  out.almanac = {
    open: !!document.querySelector('.windrose-almanac'),
    advanceButton: !!document.querySelector('.windrose-almanac-advance'),
    glyphs: document.querySelectorAll('.windrose-almanac-glyph-svg svg').length,
    day: document.querySelector('.windrose-almanac-day')?.textContent,
    describe: document.querySelector('.windrose-almanac-describe')?.textContent,
  };
  await shot('c7-almanac');
  almBtn?.click(); await wait(300);
  const inst = () => Object.values(window.__windrose.mcpInstances)[0];
  inst().ops.openDrawer(null); await wait(300);
  inst().ops.setTool('measure'); await wait(500);
  inst().ops.setViewport(300, 230, 0.95); await wait(1800);
  const card = document.querySelector('.windrose-measure-controls');
  out.route = {
    cardText: card ? card.innerText.slice(0, 400) : null,
    itineraryGlyphs: document.querySelectorAll('.windrose-measure-itinerary-glyph svg').length,
    departureChips: document.querySelectorAll('.windrose-measure-departure').length,
    ribbonStretches: document.querySelector('.windrose-measure-day-ribbon')?.querySelectorAll('polyline').length ?? 0,
  };
  await shot('c7-route');
  out.errors = __errs;
  return out;
})()
