(() => {
  const stage = document.querySelector('.windrose-stage');
  const lines = [];
  const walk = (e, d) => {
    if (d > 5) return;
    const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
    if (!e.className || typeof e.className !== 'string' || !e.className.includes('windrose')) { if (d > 0) return; }
    lines.push('  '.repeat(d) + e.tagName.toLowerCase() + '.' + e.className.split(' ').filter(c => c.startsWith('windrose') || c.startsWith('is-')).join('.') + ` [${cs.display}/${cs.position} w=${Math.round(r.width)} l=${Math.round(r.left)} min=${cs.minWidth} shrink=${cs.flexShrink} grow=${cs.flexGrow}]`);
    for (const c of e.children) walk(c, d + 1);
  };
  walk(stage, 0);
  return lines.join('\n');
})()
