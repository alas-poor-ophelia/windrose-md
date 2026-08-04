/**
 * dungeonStyleColors.ts
 * Per-style default colors for the dungeon generator, plus resolution
 * against user overrides in plugin settings (settings.dungeonStyleColors).
 *
 * Single source of truth for generation color defaults — the generator
 * itself stays style-blind and receives explicit colors via configOverrides.
 */

import type { DungeonStyleName, DungeonStyleColors } from '#types/core/map.types';

import { getSettings } from '../core/settingsAccessor';

const DUNGEON_STYLE_NAMES: DungeonStyleName[] = ['classic', 'cavern', 'fortress', 'crypt'];

/**
 * Built-in palette per style. Classic keeps the generator's historical
 * defaults (DEFAULT_FLOOR_COLOR / wall '#333333' / DEFAULT_WATER_COLOR)
 * so existing behavior is unchanged until a user picks another style
 * or overrides a color.
 */
const DUNGEON_STYLE_COLOR_DEFAULTS: Record<DungeonStyleName, DungeonStyleColors> = {
  classic: { floor: '#c4a57b', wall: '#333333', water: '#4a90d9' },
  cavern: { floor: '#8f7e63', wall: '#463a2b', water: '#3e8f80' },
  fortress: { floor: '#98a0a8', wall: '#23272c', water: '#4a6f96' },
  crypt: { floor: '#a49b7f', wall: '#333b2e', water: '#5c7d5e' }
};

function isDungeonStyleName(style: string | null | undefined): style is DungeonStyleName {
  return style != null && (DUNGEON_STYLE_NAMES as string[]).includes(style);
}

/**
 * Resolve the effective colors for a generation style: built-in style
 * defaults overlaid with any user overrides from plugin settings.
 * Unknown or absent styles resolve as 'classic'.
 */
function resolveDungeonStyleColors(style: string | null | undefined): DungeonStyleColors {
  const styleName: DungeonStyleName = isDungeonStyleName(style) ? style : 'classic';
  const overrides = getSettings().dungeonStyleColors?.[styleName];
  return { ...DUNGEON_STYLE_COLOR_DEFAULTS[styleName], ...overrides };
}

export { DUNGEON_STYLE_NAMES, DUNGEON_STYLE_COLOR_DEFAULTS, isDungeonStyleName, resolveDungeonStyleColors };
