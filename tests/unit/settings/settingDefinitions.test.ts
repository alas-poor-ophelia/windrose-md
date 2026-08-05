import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SettingDefinitionGroup, SettingDefinitionControl, SettingDefinitionItem } from 'obsidian';
import { buildSettingDefinitions, getSettingControlValue, setSettingControlValue } from '../../../src/settings/settingDefinitions';
import type { SettingsTabThis } from '../../../src/settings/tabs/settingsTabContext';
import type { PluginSettings } from '#types/settings/settings.types';
import { setPlugin, clearPlugin, FALLBACK_SETTINGS } from '../../../src/core/settingsAccessor';
import { FEATURE_DEFINITIONS } from '../../../src/core/featureFlags';

type FakeTab = SettingsTabThis & {
  refreshDomState: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  plugin: SettingsTabThis['plugin'] & { saveSettings: ReturnType<typeof vi.fn> };
};

function makeTab(overrides: Partial<PluginSettings> = {}): FakeTab {
  const settings = {
    ...structuredClone(FALLBACK_SETTINGS),
    ...overrides
  } as PluginSettings;
  const plugin = {
    app: {} as SettingsTabThis['app'],
    settings,
    saveSettings: vi.fn().mockResolvedValue(undefined)
  };
  return {
    app: plugin.app,
    plugin,
    settingsChanged: false,
    selectedMapType: 'grid',
    objectFilter: '',
    refreshDomState: vi.fn(),
    update: vi.fn(),
    getObjectSettingsForMapType() {
      return {
        objectOverrides: settings.gridObjectOverrides ?? {},
        customObjects: settings.customGridObjects ?? [],
        customCategories: settings.customGridCategories ?? []
      };
    },
    updateObjectSettingsForMapType() { /* not exercised here */ }
  } as unknown as FakeTab;
}

function groupByHeading(items: SettingDefinitionItem[], heading: string): SettingDefinitionGroup {
  const group = items.find(item => 'heading' in item && item.heading === heading);
  expect(group, `group "${heading}"`).toBeDefined();
  return group as SettingDefinitionGroup;
}

function controlItems(group: SettingDefinitionGroup): SettingDefinitionControl[] {
  return (group.items ?? []).filter((item): item is SettingDefinitionControl =>
    'control' in item && item.control != null);
}

afterEach(() => {
  clearPlugin();
});

describe('buildSettingDefinitions', () => {
  it('returns the Phase 1+2 sections in imperative tab order', () => {
    const defs = buildSettingDefinitions(makeTab());
    const headings = defs.map(d => ('heading' in d ? d.heading : undefined));
    // undefined entries are the heading-less list/action sections that render
    // under the preceding section heading (see settingDefinitionLists.ts).
    const fixedPrefix = [
      undefined, // import banner (bare row, visible only with cached old data)
      'Features', 'Hex map settings', 'Color settings',
      'Color palette', undefined,
      'Dungeon generation', 'Fog of war', 'Map behavior', 'Distance measurement',
      'Travel packs', undefined, undefined,
      'Tile sets', undefined,
      'Object types', 'Object sets', undefined, 'Object customization'
    ];
    expect(headings.slice(0, fixedPrefix.length)).toEqual(fixedPrefix);
    // The remainder is one named list per object category (count varies with
    // the built-in set); no hidden-objects group on default settings.
    const rest = headings.slice(fixedPrefix.length);
    expect(rest.length).toBeGreaterThan(0);
    expect(rest.every(h => typeof h === 'string' && h !== '')).toBe(true);
    expect(rest.some(h => h?.startsWith('Hidden objects'))).toBe(false);
  });

  it('declares one toggle per gateable feature under features.* keys', () => {
    const features = groupByHeading(buildSettingDefinitions(makeTab()), 'Features');
    const toggles = controlItems(features);
    expect(toggles).toHaveLength(FEATURE_DEFINITIONS.length);
    for (const item of toggles) {
      expect(item.control.type).toBe('toggle');
      expect(item.control.key).toMatch(/^features\./);
    }
  });

  it('gates hex, dungeon generation, fog, and measurement groups on their feature flags', () => {
    const tab = makeTab({ features: { hexMaps: false, dungeonGenerator: false, fogOfWar: false, measurement: false } });
    setPlugin({ settings: tab.plugin.settings } as never);
    const defs = buildSettingDefinitions(tab);
    for (const heading of ['Hex map settings', 'Dungeon generation', 'Fog of war', 'Distance measurement']) {
      const group = groupByHeading(defs, heading);
      expect(typeof group.visible).toBe('function');
      expect((group.visible as () => boolean)()).toBe(false);
    }
    expect(groupByHeading(defs, 'Color settings').visible).toBeUndefined();
  });

  it('shows the blur slider only while soft edges is enabled', () => {
    const tab = makeTab({ fogOfWarBlurEnabled: false });
    const fog = groupByHeading(buildSettingDefinitions(tab), 'Fog of war');
    const slider = controlItems(fog).find(i => i.control.key === 'fogOfWarBlurPercent');
    expect(slider).toBeDefined();
    expect((slider?.visible as () => boolean)()).toBe(false);
    tab.plugin.settings.fogOfWarBlurEnabled = true;
    expect((slider?.visible as () => boolean)()).toBe(true);
  });

  it('declares one render row per dungeon generation style', () => {
    const dungeon = groupByHeading(buildSettingDefinitions(makeTab()), 'Dungeon generation');
    const rows = (dungeon.items ?? []).filter(i => 'render' in i && typeof i.render === 'function' && 'name' in i && i.name !== '');
    const names = rows.map(i => ('name' in i ? i.name : ''));
    expect(names).toEqual(['Classic', 'Cavern', 'Fortress', 'Crypt']);
  });

  it('gives every nameless info row a render callback so 1.13 renders it', () => {
    // The 1.13 declarative renderer silently drops control-less items whose
    // name is empty (verified live on 1.13.4); the no-op render keeps them.
    const groups = buildSettingDefinitions(makeTab());
    const nameless = groups
      .flatMap(g => ('items' in g ? g.items ?? [] : []))
      .filter(i => 'name' in i && i.name === '');
    expect(nameless.length).toBeGreaterThan(0);
    for (const row of nameless) {
      expect('render' in row && typeof row.render === 'function').toBe(true);
    }
  });

  it('lists installed fog packs with render rows, marking the active texture', () => {
    const tab = makeTab({
      installedContentPacks: [
        { id: 'mist', name: 'Rolling mist', version: '1.0.0', type: 'fog-pack', vaultPath: 'windrose-content/mist' },
        { id: 'tiles', name: 'Some tiles', version: '1.0.0', type: 'tile-pack', vaultPath: 'windrose-content/tiles' }
      ] as PluginSettings['installedContentPacks'],
      fogOfWarImage: 'windrose-content/mist/mist.jpg'
    });
    const fog = groupByHeading(buildSettingDefinitions(tab), 'Fog of war');
    const names = (fog.items ?? []).map(i => ('name' in i ? i.name : ''));
    expect(names).toContain('Rolling mist (active)');
    expect(names).not.toContain('Some tiles');
    const row = (fog.items ?? []).find(i => 'name' in i && i.name === 'Rolling mist (active)');
    expect(row != null && 'render' in row && typeof row.render === 'function').toBe(true);
  });

  it('builds unit dropdowns from base units plus enabled travel packs', () => {
    const tab = makeTab({
      travelPacks: [{
        id: 'wilds', name: 'Wilds', enabled: true,
        units: [{ id: 'league', name: 'League', abbreviation: 'lg' }],
        modes: [], terrains: [], allowances: []
      }] as unknown as PluginSettings['travelPacks'],
      distanceUnitGrid: 'ft'
    });
    const measurement = groupByHeading(buildSettingDefinitions(tab), 'Distance measurement');
    const dropdown = controlItems(measurement).find(i => i.control.key === 'distanceUnitGrid');
    const options = (dropdown?.control as { options: Record<string, string> }).options;
    expect(options.ft).toBe('Feet');
    expect(options.lg).toBe('League (Wilds)');
  });

  it('keeps a unit from a disabled pack listed instead of silently switching', () => {
    const tab = makeTab({ distanceUnitHex: 'lg', travelPacks: [] });
    const measurement = groupByHeading(buildSettingDefinitions(tab), 'Distance measurement');
    const dropdown = controlItems(measurement).find(i => i.control.key === 'distanceUnitHex');
    const options = (dropdown?.control as { options: Record<string, string> }).options;
    expect(options.lg).toBe('lg (pack disabled)');
  });

  it('shows the import banner only with cached old data and not dismissed', () => {
    const tab = makeTab();
    const banner = buildSettingDefinitions(tab)[0];
    expect('render' in banner && typeof banner.render === 'function').toBe(true);
    const visible = ('visible' in banner ? banner.visible : undefined) as () => boolean;
    expect(typeof visible).toBe('function');
    (tab as unknown as { cachedHasOldData: boolean }).cachedHasOldData = false;
    expect(visible()).toBe(false);
    (tab as unknown as { cachedHasOldData: boolean }).cachedHasOldData = true;
    expect(visible()).toBe(true);
    tab.plugin.settings.oldImportBannerDismissed = true;
    expect(visible()).toBe(false);
  });

  it('declares one capture row per shortcut action plus a reset-all action', () => {
    const shortcuts = groupByHeading(buildSettingDefinitions(makeTab()), 'Keyboard shortcuts');
    const items = shortcuts.items ?? [];
    const captureRows = items.filter(i => 'render' in i && typeof i.render === 'function' && 'name' in i && i.name !== '');
    expect(captureRows.map(i => ('name' in i ? i.name : ''))).toContain('Undo');
    expect(captureRows).toHaveLength(14);
    const resetAll = items.find(i => 'name' in i && i.name === 'Reset all shortcuts');
    expect(resetAll != null && 'action' in resetAll && typeof resetAll.action === 'function').toBe(true);
  });

  it('rejects non-positive distances via validate', () => {
    const measurement = groupByHeading(buildSettingDefinitions(makeTab()), 'Distance measurement');
    const distance = controlItems(measurement).find(i => i.control.key === 'distancePerCellGrid');
    const validate = (distance?.control as { validate: (v: number) => string | undefined }).validate;
    expect(validate(5)).toBeUndefined();
    expect(validate(0)).toBeTypeOf('string');
    expect(validate(-2)).toBeTypeOf('string');
  });
});

describe('getSettingControlValue', () => {
  it('resolves absent feature flags as enabled', () => {
    const tab = makeTab({ features: {} });
    expect(getSettingControlValue(tab, 'features.hexMaps')).toBe(true);
    tab.plugin.settings.features = { hexMaps: false };
    expect(getSettingControlValue(tab, 'features.hexMaps')).toBe(false);
  });

  it('converts stored fractions to slider percentages', () => {
    const tab = makeTab({ fogOfWarBlurFactor: 0.35, hoverPreviewScale: 1.5, hoverPreviewZoom: 0 });
    expect(getSettingControlValue(tab, 'fogOfWarBlurPercent')).toBe(35);
    expect(getSettingControlValue(tab, 'hoverPreviewScalePercent')).toBe(150);
    // 0 falls back to the default, matching the imperative render guard
    expect(getSettingControlValue(tab, 'hoverPreviewZoomPercent')).toBe(50);
  });

  it('falls back to defaults for unset preview scale', () => {
    const tab = makeTab({ hoverPreviewScale: undefined, hoverPreviewZoom: undefined });
    expect(getSettingControlValue(tab, 'hoverPreviewScalePercent')).toBe(100);
    expect(getSettingControlValue(tab, 'hoverPreviewZoomPercent')).toBe(50);
  });

  it('reads direct keys straight from settings', () => {
    const tab = makeTab({ gridLineWidth: 3, hexOrientation: 'pointy' });
    expect(getSettingControlValue(tab, 'gridLineWidth')).toBe(3);
    expect(getSettingControlValue(tab, 'hexOrientation')).toBe('pointy');
  });

  it('returns undefined for undeclared keys', () => {
    expect(getSettingControlValue(makeTab(), 'colorPalette')).toBeUndefined();
  });
});

describe('setSettingControlValue', () => {
  it('persists feature toggles and refreshes gated groups', async () => {
    const tab = makeTab();
    await setSettingControlValue(tab, 'features.fogOfWar', false);
    expect(tab.plugin.settings.features?.fogOfWar).toBe(false);
    expect(tab.plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(tab.refreshDomState).toHaveBeenCalled();
    // Features save immediately; they do not use the deferred hide() batch
    expect(tab.settingsChanged).toBe(false);
  });

  it('converts slider percentages back to stored fractions', async () => {
    const tab = makeTab();
    await setSettingControlValue(tab, 'fogOfWarBlurPercent', 35);
    expect(tab.plugin.settings.fogOfWarBlurFactor).toBeCloseTo(0.35);
    await setSettingControlValue(tab, 'hoverPreviewScalePercent', 150);
    expect(tab.plugin.settings.hoverPreviewScale).toBeCloseTo(1.5);
    await setSettingControlValue(tab, 'hoverPreviewZoomPercent', 80);
    expect(tab.plugin.settings.hoverPreviewZoom).toBeCloseTo(0.8);
    expect(tab.settingsChanged).toBe(true);
  });

  it('writes direct keys and flags the deferred change batch', async () => {
    const tab = makeTab();
    await setSettingControlValue(tab, 'hexOrientation', 'pointy');
    expect(tab.plugin.settings.hexOrientation).toBe('pointy');
    expect(tab.settingsChanged).toBe(true);
    expect(tab.plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(tab.refreshDomState).toHaveBeenCalled();
  });

  it('ignores undeclared keys without saving', async () => {
    const tab = makeTab();
    await setSettingControlValue(tab, 'colorPalette', 'nonsense');
    expect(tab.plugin.saveSettings).not.toHaveBeenCalled();
    expect(tab.settingsChanged).toBe(false);
  });

  it('ignores non-numeric values on percent keys', async () => {
    const tab = makeTab({ fogOfWarBlurFactor: 0.2 });
    await setSettingControlValue(tab, 'fogOfWarBlurPercent', 'oops');
    expect(tab.plugin.settings.fogOfWarBlurFactor).toBeCloseTo(0.2);
    expect(tab.plugin.saveSettings).not.toHaveBeenCalled();
  });
});

describe('feature flag interaction with settingsAccessor', () => {
  beforeEach(() => clearPlugin());

  it('visible predicates read live settings through the accessor', () => {
    const tab = makeTab();
    setPlugin({ settings: tab.plugin.settings } as never);
    const defs = buildSettingDefinitions(tab);
    const hex = groupByHeading(defs, 'Hex map settings');
    expect((hex.visible as () => boolean)()).toBe(true);
    tab.plugin.settings.features = { hexMaps: false };
    expect((hex.visible as () => boolean)()).toBe(false);
  });
});
