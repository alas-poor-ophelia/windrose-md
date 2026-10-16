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
 * Append one checkable entry per weather zone, plus a removal entry when
 * the region is bound. `onChange(undefined)` unbinds. A binding to a zone
 * the weather plugin no longer lists still gets its removal entry.
 */
function addWeatherZoneMenuItems(
  menu: Menu,
  app: App,
  region: Region,
  onChange: (weatherZoneId: string | undefined) => void
): void {
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

export { addWeatherZoneMenuItems };
