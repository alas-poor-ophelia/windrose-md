(async () => {
  const leaf = await openFullPane("weather-demo-001");
  const root = leaf.view.containerEl;
  const sky = skyOf(root);
  const f0 = sky?.windroseSky.frames;
  await shot("c1-sky-frame-1"); await wait(600);
  await shot("c1-sky-frame-2"); await wait(600);
  await shot("c1-sky-frame-3");
  const f1 = sky?.windroseSky.frames;
  const fog = await skyVsFog(root, 3000);
  const compass = root.querySelector(".windrose-compass-wind");
  return {
    skyStats: sky ? { ...sky.windroseSky } : null,
    framesDuringShots: f1 - f0,
    fog,
    compassWindNeedle: !!compass,
    compassLabel: root.querySelector(".windrose-compass-standalone, .windrose-compass-animated")?.getAttribute("aria-label") ?? null,
    now: app.plugins.plugins.wadjet.api.now()?.dayOrdinal,
    errors: __errs,
  };
})()
