import { chromium } from 'playwright';
const INDEX='C:/Dev/windrose/spikes/lod/g1-global-lattice/index.html';
const OUT='C:/Dev/windrose/spikes/lod/g1-global-lattice/out/';
const b=await chromium.launch();
const c=await b.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:1});
const p=await c.newPage();
p.on('pageerror',e=>console.error(e.message));
await p.goto(`file://${INDEX}?ladder=13&lattice=one&look=siblings&zmin=0.62`);
await p.evaluate(()=>window.__lod.ready);
await p.evaluate(()=>window.__lod.setZoom(6,512,380));
await p.waitForTimeout(700);
// find the lake (authored contradiction inside forestA) in world coords
const lake = await p.evaluate(()=>{
  const l=window.__lod; // scan the screen for the bluest pixel is overkill; use forestA lake cell
  return null;
});
const m=await p.evaluate(()=>window.__lod.metrics());
await p.screenshot({path:OUT+'erase-town-1-before.png'});
// erase a 5-cell patch of AUTHORED level-1 content around the view centre-left
const res=await p.evaluate(()=>{
  const out=[];
  for(let dx=-90;dx<=90;dx+=30) for(let dy=-90;dy<=90;dy+=30){
    const w=window.__lod.worldAt(930+dx,490+dy);
    out.push(window.__lod.erase(w.x,w.y));
  }
  return out;
});
await p.waitForTimeout(700);
await p.screenshot({path:OUT+'erase-town-2-after.png'});
console.log('level',m.level,'erased had=true count',res.filter(r=>r.had).length,'of',res.length);
await b.close();
