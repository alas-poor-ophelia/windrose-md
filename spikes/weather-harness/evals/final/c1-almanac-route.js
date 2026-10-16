(async () => {
  const plugin = app.plugins.plugins['windrose-md'];
  plugin.settings.travelPacks = [{
    id: 'harness-pack', name: 'Harness travel', enabled: true, units: [], terrains: [],
    modes: [{ id: 'foot', name: 'On foot', distance: 24, unit: { type: 'standard', unit: 'mi' }, timeValue: 8, timeUnit: 'hours' }],
    allowances: [{ id: 'day8', name: '8 hours', timeValue: 8, timeUnit: 'hours' }],
  }];
  plugin.settings.defaultTravelSettings = { modeIds: ['foot'], allowanceId: 'day8' };
  await plugin.saveSettings();
  window.dispatchEvent(new Event('windrose-settings-changed'));
  app.vault.setConfig('readableLineLength', false);
  await wait(800);
  const out = {};
  // --- Almanac (block rail flyout)
  const railBtns = [...document.querySelectorAll('.windrose-edge-rail-btn')];
  const almBtn = railBtns.find(b => b.getAttribute('aria-label') === 'Almanac' || b.querySelector('.lucide-cloud-sun, [class*="cloud-sun"]'));
  out.almanacRailButton = !!almBtn;
  almBtn?.click();
  await wait(800);
  const alm = document.querySelector('.windrose-almanac');
  out.almanacOpen = !!alm && !alm.classList.contains('windrose-almanac-empty');
  const val = () => [...document.querySelectorAll('.windrose-almanac-slider-value')].map(e => e.textContent);
  const day0 = document.querySelector('.windrose-almanac-day')?.textContent;
  out.before = { day: day0, sliders: val() };
  await shot('c1-almanac-open');
  const [daySlider, hourSlider] = document.querySelectorAll('.windrose-almanac-slider input[type=range]');
  const setRange = (el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  setRange(daySlider, 3); await wait(500);
  setRange(document.querySelectorAll('.windrose-almanac-slider input[type=range]')[1], 15); await wait(700);
  out.afterScrub = { day: document.querySelector('.windrose-almanac-day')?.textContent, sliders: val(), sub: document.querySelector('.windrose-almanac-when-sub')?.textContent };
  await shot('c1-almanac-scrubbed');
  const playBtn = () => [...document.querySelectorAll('.windrose-almanac-btn')].find(b => /Play|Stop/.test(b.textContent));
  playBtn().click(); await wait(200);
  const h1 = val()[1]; await wait(2000); const h2 = val()[1];
  out.play = { pressed: playBtn().getAttribute('aria-pressed'), hourAt200ms: h1, hourAt2200ms: h2, label: playBtn().textContent };
  playBtn().click(); await wait(300);
  const s1 = val()[1]; await wait(1500); const s2 = val()[1];
  out.stop = { pressed: playBtn().getAttribute('aria-pressed'), hourAfterStop: s1, hour1500msLater: s2, label: playBtn().textContent };
  // back to today, close almanac
  [...document.querySelectorAll('.windrose-almanac-btn')].find(b => /Today/.test(b.textContent))?.click();
  await wait(300);
  almBtn?.click(); await wait(400);
  // --- Route (measure tool, seeded measurementRoute via --map-patch)
  const inst = () => Object.values(window.__windrose.mcpInstances)[0];
  inst().ops.openDrawer(null); await wait(300);
  inst().ops.setTool('measure'); await wait(500);
  inst().ops.setViewport(300, 230, 0.95); await wait(1800);
  const card = document.querySelector('.windrose-measure-controls');
  const ribbon = document.querySelector('.windrose-measure-day-ribbon');
  out.route = {
    tool: inst().currentTool,
    cardText: card ? card.innerText.slice(0, 600) : null,
    ribbonStretches: ribbon ? ribbon.querySelectorAll('polyline').length : 0,
    ribbonMarkers: ribbon ? [...ribbon.querySelectorAll('text')].map(t => t.textContent) : [],
    itineraryGlyphs: document.querySelectorAll('.windrose-measure-itinerary-glyph svg').length,
    departureChips: document.querySelectorAll('.windrose-measure-departure').length,
  };
  await shot('c1-route');
  out.errors = __errs;
  return out;
})()
