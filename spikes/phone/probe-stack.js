(() => {
  const c = document.querySelector('.windrose-compass'); const out = [];
  for (let e = c; e && !e.classList.contains('windrose-canvas-wrapper'); e = e.parentElement) {
    const s = getComputedStyle(e);
    out.push([e.className.split(' ')[0], s.position, s.zIndex, s.transform !== 'none' ? 'T' : '', s.filter !== 'none' ? 'F' : '', s.isolation, s.willChange, s.contain, s.opacity]);
  }
  const r = c.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { chain: out, topAtCompass: top?.className };
})()
