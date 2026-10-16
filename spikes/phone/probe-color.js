(async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const rect = (el) => { const r = el.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) }; };
  const out = { vw: innerWidth, vh: innerHeight, tries: [] };
  const btns = [...document.querySelectorAll('.windrose-edge-rail-btn')];
  for (const [i, b] of btns.entries()) {
    b.click(); await wait(400);
    const pickers = [...document.querySelectorAll('.windrose-color-picker, .windrose-icon-picker')].map(p => ({ cls: p.className, pos: getComputedStyle(p).position, rect: rect(p), minW: getComputedStyle(p).minWidth }));
    const drawer = document.querySelector('.windrose-edge-rail-drawer:not(.is-collapsed)');
    out.tries.push({ i, label: b.getAttribute('aria-label'), pickers, drawer: drawer ? rect(drawer) : null });
    if (pickers.length || drawer) {
      // try clicking a color swatch/button inside the opened drawer to reach a picker
      const sw = drawer?.querySelector('.windrose-color-tool-btn, .windrose-color-btn, [class*="color"] button, button[class*="color"]');
      if (sw) { sw.click(); await wait(400); out.tries.push({ i, inner: sw.className, pickers: [...document.querySelectorAll('.windrose-color-picker')].map(p => ({ pos: getComputedStyle(p).position, rect: rect(p) })) }); }
    }
    b.click(); await wait(300);
  }
  return out;
})()
