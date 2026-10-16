// Tile drawer on a phone: measure open, then fold it and measure again (after-eval screenshot shows folded).
(async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const R = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), z: getComputedStyle(e).zIndex }; };
  const snap = () => ({ drawer: R('.windrose-tile-drawer'), canvas: R('.windrose-canvas-container'), controls: R('.windrose-controls'), compass: R('.windrose-compass'), cls: document.querySelector('.windrose-tile-drawer')?.className });
  const open = snap();
  const head = document.querySelector('.windrose-cd-head');
  const btns = head ? [...head.querySelectorAll('button')].map(b => b.getAttribute('aria-label') || b.className) : [];
  const fold = head && [...head.querySelectorAll('button')].find(b => /collapse|fold|close|hide/i.test((b.getAttribute('aria-label') || '') + b.className));
  fold?.click(); await wait(700);
  return { open, headButtons: btns, clicked: fold ? (fold.getAttribute('aria-label') || fold.className) : null, folded: snap() };
})()
