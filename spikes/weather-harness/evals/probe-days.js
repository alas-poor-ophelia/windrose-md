(() => {
  const api = app.plugins.plugins.wadjet.api;
  const out = [];
  for (const zone of ["greywold-highlands", "ashfall-coast"]) {
    for (let d = 1; d <= 120; d++) {
      const r = api.getReport(zone, { dayOrdinal: d, hour: 12 });
      if (!r) continue;
      out.push([zone.slice(0, 4), d, r.precipitation.type, +r.precipitation.intensity.toFixed(2), r.precipitation.active, Math.round(r.wind.speedKph), Math.round(r.wind.directionDeg), +r.cloudCover.toFixed(2), r.visibilityKm, r.conditions.join("/")].join(" "));
    }
  }
  return { keys: Object.keys(api), now: api.now?.(), rows: out.filter(r => !/ none /.test(r)).slice(0, 120) };
})()
