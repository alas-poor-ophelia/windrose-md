/**
 * weatherRegionMenu.ts
 *
 * Region context-menu entries that bind a region to a weather zone. Shared
 * by both region menus (the region tool's and the hex context menu's).
 * Adds nothing when the weather plugin is unavailable, so the menus are
 * unchanged for vaults without it.
 */

// Type-only imports
import type { App, Menu, MenuItem } from 'obsidian';
import type { Region } from '#types/core/map.types';

import { getWadjetApi, listWeatherZones } from './wadjetBridge';
import { hasWeatherZone } from './weatherZones';

/**
 * `regions` with one region bound to `weatherZoneId`, or unbound when it
 * is undefined: the key is deleted, never stored as undefined (an absent
 * key is the persisted "no weather").
 */
function withRegionWeatherZone(regions: readonly Region[], regionId: string, weatherZoneId: string | undefined): Region[] {
  return regions.map(region => {
    if (region.id !== regionId) return region;
    if (weatherZoneId !== undefined) return { ...region, weatherZoneId };
    const unbound = { ...region };
    delete unbound.weatherZoneId;
    return unbound;
  });
}

/**
 * Append one checkable entry per weather zone, plus a removal entry when
 * the region is bound; each hands `onRegionsChange` the updated region
 * list. A binding to a zone the weather plugin no longer lists still gets
 * its removal entry.
 */
function addWeatherZoneMenuItems(
  menu: Menu,
  app: App,
  region: Region,
  regions: readonly Region[],
  onRegionsChange: (regions: Region[]) => void
): void {
  const onChange = (weatherZoneId: string | undefined): void =>
    onRegionsChange(withRegionWeatherZone(regions, region.id, weatherZoneId));
  const api = getWadjetApi(app);
  if (api == null) return;

  const zones = listWeatherZones(api);
  const bound = hasWeatherZone(region);
  if (zones.length === 0 && !bound) return;

  menu.addSeparator();

  for (const zone of zones) {
    const isCurrent = region.weatherZoneId === zone.id;
    menu.addItem((item: MenuItem) => {
      item.setTitle(`Weather: ${zone.name}`);
      item.setIcon('lucide-cloud-sun');
      item.setChecked(isCurrent);
      item.onClick(() => {
        if (!isCurrent) onChange(zone.id);
      });
    });
  }

  if (bound) {
    menu.addItem((item: MenuItem) => {
      item.setTitle('Remove weather');
      item.setIcon('lucide-cloud-off');
      item.onClick(() => onChange(undefined));
    });
  }
}

export { addWeatherZoneMenuItems, withRegionWeatherZone };
