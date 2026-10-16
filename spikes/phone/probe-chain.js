(async () => {
  const modal = document.querySelector('.modal.windrose-insert-dungeon-host');
  if (!modal) return 'no modal';
  modal.querySelector('.windrose-dungeon-advanced-header')?.click();
  await new Promise(r => setTimeout(r, 400));
  const mc = modal.querySelector('.modal-content');
  const cs = getComputedStyle(mc);
  const chain = [];
  for (let e = modal.querySelector('.windrose-dungeon-advanced-content'); e && e !== document.body; e = e.parentElement) {
    const s = getComputedStyle(e); const r = e.getBoundingClientRect();
    chain.push({ el: e.tagName + '.' + [...e.classList].join('.'), h: Math.round(r.height), sh: e.scrollHeight, ch: e.clientHeight, ov: s.overflowX + '/' + s.overflowY, disp: s.display, dir: s.flexDirection, shrink: s.flexShrink, minH: s.minHeight, maxH: s.maxHeight });
  }
  const kids = [...mc.children].map(k => { const s = getComputedStyle(k); return { el: k.className, h: Math.round(k.getBoundingClientRect().height), sh: k.scrollHeight, ov: s.overflowY, shrink: s.flexShrink }; });
  return { mcDisplay: cs.display, mcDir: cs.flexDirection, chain, kids };
})()
