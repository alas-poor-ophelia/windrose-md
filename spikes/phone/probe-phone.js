// Phone probe: palette fit, canvas width, and the dungeon modal with Advanced expanded.
(async () => {
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
  const out = { body: document.body.className, vw: innerWidth, vh: innerHeight };
  const pal = document.querySelector('.windrose-tool-palette');
  if (pal) {
    const btns = [...pal.querySelectorAll('button')];
    out.palette = { rect: rect(pal), scrollW: pal.scrollWidth, clientW: pal.clientWidth, wrap: getComputedStyle(pal).flexWrap, buttons: btns.length, offRight: btns.filter(b => b.getBoundingClientRect().right > pal.getBoundingClientRect().right + 1).length };
    out.canvas = rect(document.querySelector('.windrose-canvas-container'));
    out.layout = ['.windrose-stage', '.windrose-edge-rail', '.windrose-tile-drawer', '.windrose-cd', '.windrose-container-block'].map(s => { const e = document.querySelector(s); if (!e) return [s, null]; const cs = getComputedStyle(e); return [s, rect(e), cs.position, cs.width, cs.flexShrink]; });
  }
  const modal = document.querySelector('.modal.windrose-insert-dungeon-host');
  if (modal) {
    const hdr = modal.querySelector('.windrose-dungeon-advanced-header');
    hdr?.click();
    await new Promise(r => setTimeout(r, 400));
    const mc = modal.querySelector('.modal-content');
    const before = { scrollH: mc.scrollHeight, clientH: mc.clientHeight, scrollW: mc.scrollWidth, clientW: mc.clientWidth, modalScrollW: modal.scrollWidth, modalClientW: modal.clientWidth };
    mc.scrollTop = mc.scrollHeight;
    await new Promise(r => setTimeout(r, 200));
    const kids = [...mc.querySelectorAll('.windrose-dungeon-advanced-content > *')];
    const last = kids[kids.length - 1];
    const btnBar = modal.querySelector('.modal-button-container');
    out.dungeon = { modal: rect(modal), content: rect(mc), before, scrollTop: mc.scrollTop, lastAdvanced: rect(last), buttonBar: rect(btnBar), lastVisible: last ? last.getBoundingClientRect().bottom <= mc.getBoundingClientRect().bottom + 1 : null };
  }
  return out;
})()
