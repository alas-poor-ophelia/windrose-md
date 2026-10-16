(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const plugin = app.plugins.plugins['windrose-md'];
  plugin.settings.travelPacks = [{
    id: 'harness-pack', name: 'Harness travel', enabled: true, units: [], terrains: [],
    modes: [
      { id: 'foot', name: 'On foot', distance: 24, unit: { type: 'standard', unit: 'mi' }, timeValue: 8, timeUnit: 'hours' },
      { id: 'horse', name: 'Horse', distance: 40, unit: { type: 'standard', unit: 'mi' }, timeValue: 8, timeUnit: 'hours' },
    ],
    allowances: [{ id: 'day8', name: '8 hours', timeValue: 8, timeUnit: 'hours' }],
  }];
  plugin.settings.defaultTravelSettings = { modeIds: ['foot', 'horse'], allowanceId: 'day8' };
  await plugin.saveSettings();
  window.dispatchEvent(new Event('windrose-settings-changed'));
  await sleep(500);
  app.vault.setConfig('readableLineLength', false);
  await sleep(500);
  const inst = Object.values(window.__windrose.mcpInstances)[0];
  inst.ops.openDrawer(null);
  await sleep(300);
  inst.ops.setTool('measure');
  await sleep(500);
  inst.ops.setViewport(300, 240, 1.35);
  await sleep(1500);
  if (true) { await sleep(10);
    const chips = document.querySelectorAll('.windrose-measure-departure');
    if (chips[3]) chips[3].click();
    await sleep(800);
  }
  const card = document.querySelector('.windrose-measure-controls'); if (card) card.style.display = 'none';
  const ribbon = document.querySelector('.windrose-measure-day-ribbon');
  return {
    tool: inst.currentTool,
    card: card ? card.innerText : null,
    stretches: ribbon ? ribbon.querySelectorAll('polyline').length : 0,
    markers: ribbon ? Array.from(ribbon.querySelectorAll('text')).map(t => t.textContent) : [],
    glyphs: document.querySelectorAll('.windrose-measure-itinerary-glyph svg').length,
    weather: { today: app.plugins.plugins.wadjet.api.now?.()?.dayOrdinal },
  };
})()
