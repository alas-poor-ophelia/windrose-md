(async () => {
  const api = app.plugins.plugins.wadjet.api;
  const out = {};
  const hexIn = { kind: 'hex', mapId: 'weather-demo-001', q: 17, r: 5 };
  const regionLoc = { kind: 'custom', namespace: 'windrose.region', data: { mapId: 'weather-demo-001', regionId: 'region-coast' } };
  const anyMapOpen = () => Object.keys(window.__windrose?.mcpInstances ?? {}).length;
  // ---- 4: map CLOSED
  out.closed = {
    mapsMounted: anyMapOpen(),
    resolveZoneSync: api.resolveZone(hexIn),
    resolveZoneAsync: await api.resolveZoneAsync(hexIn),
    customAsync: await api.resolveZoneAsync(regionLoc),
    unboundAsync: await api.resolveZoneAsync({ kind: 'hex', mapId: 'weather-demo-001', q: 11, r: 6 }),
    highlandsAsync: await api.resolveZoneAsync({ kind: 'hex', mapId: 'weather-demo-001', q: 3, r: 10 }),
  };
  // ---- 3: two-way showcase
  const openNote = async (p) => { const leaf = app.workspace.getLeaf(false); await leaf.openFile(app.vault.getAbstractFileByPath(p)); await wait(1800); return leaf; };
  let leaf = await openNote('Weather Ruling.md');
  let el = leaf.view.containerEl;
  const block = el.querySelector('.block-language-wadjet');
  out.ruling = {
    interpreters: api.listInterpreters('travel'),
    blockText: block ? block.innerText.slice(0, 700) : null,
    directInterpret: (() => { try { return api.interpret('windrose.travel', api.getReport('ashfall-coast', { dayOrdinal: api.now().dayOrdinal })); } catch (e) { return 'ERR ' + e; } })(),
  };
  await shot('c3-ruling-note');
  leaf = await openNote('Weather Frontmatter.md');
  el = leaf.view.containerEl;
  const fb = el.querySelector('.block-language-wadjet');
  out.frontmatter = {
    resolveNote: api.resolveZone({ kind: 'note', path: 'Weather Frontmatter.md' }),
    zones: api.listZones(),
    blockText: fb ? fb.innerText.slice(0, 400) : null,
    blockHtmlHint: fb ? (fb.querySelector('[data-zone], [aria-label]')?.outerHTML ?? '').slice(0, 300) : null,
    sameAsCoastLine: fb ? fb.innerText.trim() === '' ? null : undefined : null,
  };
  await shot('c3-frontmatter-note');
  // ---- 4: map OPEN
  leaf = await openNote('Weather Demo.md');
  await wait(1500);
  out.open = {
    mapsMounted: anyMapOpen(),
    resolveZoneSync: api.resolveZone(hexIn),
    customSync: api.resolveZone(regionLoc),
    resolveZoneAsync: await api.resolveZoneAsync(hexIn),
  };
  out.errors = __errs;
  return out;
})()
