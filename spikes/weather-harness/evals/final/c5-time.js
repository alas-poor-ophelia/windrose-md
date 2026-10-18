(async () => {
  const api = app.plugins.plugins.wadjet.api;
  const out = {};
  const railBtns = [...document.querySelectorAll('.windrose-edge-rail-btn')];
  const almBtn = railBtns.find(b => b.getAttribute('aria-label') === 'Almanac');
  almBtn?.click(); await wait(800);
  const snap = () => ({
    now: api.now()?.dayOrdinal,
    almanacDay: document.querySelector('.windrose-almanac-day')?.textContent,
    almanacDescribe: document.querySelector('.windrose-almanac-describe')?.textContent,
    badges: [...document.querySelectorAll('.windrose-weather-overlay text, .windrose-weather-badge')].map(t => t.textContent).filter(Boolean).slice(0, 6),
    skyAreas: skyOf(document.body)?.windroseSky.areas,
  });
  out.start = snap();
  await shot('c5-before');
  const adv = document.querySelector('.windrose-almanac-advance');
  out.advanceButton = !!adv;
  adv?.click(); await wait(1500);
  out.afterAlmanacAdvance = snap();
  await shot('c5-after-almanac-advance');
  out.commandFound = !!app.commands.findCommand('wadjet:next-day');
  app.commands.executeCommandById('wadjet:next-day'); await wait(1500);
  out.afterCommand = snap();
  await shot('c5-after-command');
  out.errors = __errs;
  return out;
})()
