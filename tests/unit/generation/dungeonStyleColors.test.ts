import { describe, it, expect, afterEach } from 'vitest';
import {
  DUNGEON_STYLE_NAMES,
  DUNGEON_STYLE_COLOR_DEFAULTS,
  isDungeonStyleName,
  resolveDungeonStyleColors
} from '../../../src/generation/dungeonStyleColors';
import { setPlugin, clearPlugin } from '../../../src/core/settingsAccessor';
import type { PluginSettings } from '#types/settings/settings.types';

function withSettings(overrides: Partial<PluginSettings>): void {
  setPlugin({ settings: overrides } as never);
}

afterEach(() => {
  clearPlugin();
});

describe('dungeonStyleColors', () => {
  it('classic defaults keep the generator historical colors', () => {
    expect(DUNGEON_STYLE_COLOR_DEFAULTS.classic).toEqual({
      floor: '#c4a57b',
      wall: '#333333',
      water: '#4a90d9'
    });
  });

  it('every style defines floor, wall, and water hex colors', () => {
    for (const style of DUNGEON_STYLE_NAMES) {
      const colors = DUNGEON_STYLE_COLOR_DEFAULTS[style];
      for (const channel of ['floor', 'wall', 'water'] as const) {
        expect(colors[channel]).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('recognizes the four style names and rejects others', () => {
    for (const style of DUNGEON_STYLE_NAMES) {
      expect(isDungeonStyleName(style)).toBe(true);
    }
    expect(isDungeonStyleName('labyrinth')).toBe(false);
    expect(isDungeonStyleName(null)).toBe(false);
    expect(isDungeonStyleName(undefined)).toBe(false);
  });

  it('resolves built-in defaults when no plugin settings exist', () => {
    expect(resolveDungeonStyleColors('cavern')).toEqual(DUNGEON_STYLE_COLOR_DEFAULTS.cavern);
  });

  it('falls back to classic for unknown or absent styles', () => {
    expect(resolveDungeonStyleColors('labyrinth')).toEqual(DUNGEON_STYLE_COLOR_DEFAULTS.classic);
    expect(resolveDungeonStyleColors(null)).toEqual(DUNGEON_STYLE_COLOR_DEFAULTS.classic);
    expect(resolveDungeonStyleColors(undefined)).toEqual(DUNGEON_STYLE_COLOR_DEFAULTS.classic);
  });

  it('overlays per-channel settings overrides on style defaults', () => {
    withSettings({ dungeonStyleColors: { cavern: { floor: '#112233' } } });
    expect(resolveDungeonStyleColors('cavern')).toEqual({
      ...DUNGEON_STYLE_COLOR_DEFAULTS.cavern,
      floor: '#112233'
    });
    // Other styles are untouched by a cavern-only override
    expect(resolveDungeonStyleColors('fortress')).toEqual(DUNGEON_STYLE_COLOR_DEFAULTS.fortress);
  });

  it('applies full-style overrides across all channels', () => {
    withSettings({
      dungeonStyleColors: {
        crypt: { floor: '#010101', wall: '#020202', water: '#030303' }
      }
    });
    expect(resolveDungeonStyleColors('crypt')).toEqual({
      floor: '#010101',
      wall: '#020202',
      water: '#030303'
    });
  });
});
