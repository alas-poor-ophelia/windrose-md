// Open each palette sub-tool flyout via its contextmenu trigger and measure it against the viewport.
(async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const res = [];
  const btns = [...document.querySelectorAll('.windrose-tool-palette .windrose-tool-btn-container > button.windrose-tool-btn')];
  for (const b of btns) {
    b.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await wait(150);
    const m = document.querySelector('.windrose-subtool-menu');
    const br = b.getBoundingClientRect();
    if (m) {
      const r = m.getBoundingClientRect();
      res.push({ btnLeft: Math.round(br.left), btnTop: Math.round(br.top), menu: { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) }, offRight: Math.max(0, Math.round(r.right - innerWidth)), offLeft: Math.max(0, Math.round(-r.left)) });
    } else res.push({ btnLeft: Math.round(br.left), menu: null });
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await wait(100);
  }
  return { vw: innerWidth, res };
})()
