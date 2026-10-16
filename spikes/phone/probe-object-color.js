// Object color picker on a phone: fold the drawer, place an object right of
// centre, select it, open the selection overlay's color picker, measure it.
(async () => {
  const inst = () => { const m = window.__windrose.mcpInstances; return m[Object.keys(m)[0]]; };
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const R = (el) => { if(!el) return null; const r = el.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width) }; };
  const out = { iw: innerWidth };
  { const b=document.querySelector('[aria-label="Collapse to edge"]'); out.collBtn=!!b; if(b){ for(const t of ['pointerdown','mousedown','pointerup','mouseup','click']){ b.dispatchEvent(new (t.startsWith('pointer')?PointerEvent:MouseEvent)(t,{bubbles:true,cancelable:true,pointerId:1,pointerType:'touch',isPrimary:true})); await wait(80);} } await wait(600); }
  document.querySelector('.windrose-canvas-container').scrollIntoView({block:'start'}); await wait(400);
  out.cc = R(document.querySelector('.windrose-canvas-container')); out.cvr = R(document.querySelector('canvas.windrose-canvas-select'));
  inst().ops.setTool('select');
  await wait(200);
  const p = inst().ops.placeObject('entrance', 153, 150);
  out.place = p; await wait(500);
  out.objs = inst().ops.listObjects();
  const cv = document.querySelector('canvas.windrose-canvas-select');
  const fire = async (x, y) => {
    const o = { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1 };
    cv.dispatchEvent(new PointerEvent('pointerdown', o)); cv.dispatchEvent(new MouseEvent('mousedown', o));
    await wait(100);
    const u = { ...o, buttons: 0 };
    cv.dispatchEvent(new PointerEvent('pointerup', u)); cv.dispatchEvent(new MouseEvent('mouseup', u)); cv.dispatchEvent(new MouseEvent('click', u));
    await wait(500);
  };
  const hit = document.elementFromPoint(251,150); out.hit = hit && hit.className; const td=document.querySelector('.windrose-tile-drawer'); out.td = td && [td.className, R(td)];
  out.scan=null; outer: for (let y=184;y<=232;y+=12) for (let x=212;x<=266;x+=12) { await fire(x,y); if (document.querySelector('.windrose-selection-card')) { out.scan=[x,y]; break outer; } }
  out.tool = inst().currentTool;
  out.selCard = R(document.querySelector('.windrose-selection-card'));
  const btn = document.querySelector('.windrose-sel-color-btn');
  out.btn = R(btn);
  if (btn) { btn.click(); await wait(500); }
  const pk = document.querySelector('.windrose-color-picker');
  out.picker = R(pk); out.pickerPos = pk && getComputedStyle(pk).position;
  out.pickerStyleLeft = pk && pk.style.left;
  return out;
})()
