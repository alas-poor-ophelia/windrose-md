(async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const R = (el) => { const r = el.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) }; };
  const over = (root) => [...root.querySelectorAll('*')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1); }).slice(0, 12).map(e => ({ el: e.tagName.toLowerCase() + '.' + [...e.classList].slice(0, 3).join('.'), rect: R(e) }));
  const btn = [...document.querySelectorAll('.windrose-edge-rail-btn')].find(b => b.getAttribute('aria-label') === 'Map settings');
  btn?.click(); await wait(800);
  const modal = document.querySelector('.modal.windrose-settings-native-modal') || document.querySelector('.modal');
  if (!modal) return 'no settings modal';
  const out = { modal: R(modal), tabs: [] };
  const tabs = [...modal.querySelectorAll('button, [role=tab], .windrose-settings-tab')].filter(t => /appearance|grid|hex|size|tab/i.test(t.className + ' ' + t.textContent)).slice(0, 8);
  for (const t of tabs) {
    t.click(); await wait(300);
    const body = modal.querySelector('.windrose-modal-body') || modal;
    out.tabs.push({ tab: t.textContent.trim().slice(0, 20), bodyScroll: [body.scrollHeight, body.clientHeight], overflow: over(modal) });
  }
  // open first color picker in appearance
  const app = tabs.find(t => /appearance/i.test(t.textContent)); app?.click(); await wait(300);
  const mc = modal.querySelector('.modal-content'); out.chain = [...(mc?.children ?? [])].map(c => ({ el: c.className, h: Math.round(c.getBoundingClientRect().height) }));
  const sm = modal.querySelector('.windrose-settings-modal'); out.inner = sm ? [...sm.children].map(c => ({ el: c.className, h: Math.round(c.getBoundingClientRect().height) })) : null;
  return out;
  const trig = modal.querySelector('.windrose-color-btn, .windrose-color-display, [class*="color-button"], [class*="color-swatch-btn"], .windrose-color-preview');
  if (trig) { trig.click(); await wait(400); out.picker = [...document.querySelectorAll('.windrose-color-picker')].map(p => ({ pos: getComputedStyle(p).position, minW: getComputedStyle(p).minWidth, rect: R(p) })); out.trig = trig.className; }
  return out;
})()
