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

/** Flatten page entries so lookups reach groups nested inside sub-pages. */
function flattenPages(items: SettingDefinitionItem[]): SettingDefinitionItem[] {
  return items.flatMap(item =>
    'type' in item && item.type === 'page' && item.items != null
      ? [item, ...flattenPages(item.items)]
      : [item]);
}

function groupByHeading(items: SettingDefinitionItem[], heading: string): SettingDefinitionGroup {
  const group = flattenPages(items).find(item => 'heading' in item && item.heading === heading);
  expect(group, `group "${heading}"`).toBeDefined();
  return group as SettingDefinitionGroup;
}

function pageByName(items: SettingDefinitionItem[], name: string): SettingDefinitionItem {
  const page = items.find(item => 'type' in item && item.type === 'page' && 'name' in item && item.name === name);
  expect(page, `page "${name}"`).toBeDefined();
  return page as SettingDefinitionItem;
}

function controlItems(group: SettingDefinitionGroup): SettingDefinitionControl[] {
  return (group.items ?? []).filter((item): item is SettingDefinitionControl =>
    'control' in item && item.control != null);
}

afterEach(() => {
  clearPlugin();
});

describe('buildSettingDefinitions', () => {
  it('keeps a short root: banner, Features, then one sub-page per cluster', () => {
    const defs = buildSettingDefinitions(makeTab());
    const rootShape = defs.map(d => {
      if ('type' in d && d.type === 'page') return `page:${'name' in d ? d.name : ''}`;
      if ('heading' in d) return `group:${d.heading}`;
      return 'row';
    });
    expect(rootShape).toEqual([
      'row', // import banner (visible only with cached old data)
      'group:Features',
      'page:Display & behavior',
      'page:Color palette',
      'page:Dungeon generation',
      'page:Fog of war',
      'page:Measurement & travel',
      'page:Tile sets',
      'page:Objects',
      'page:Keyboard shortcuts'
    ]);
  });

  it('nests every former section inside its page, in the drafted order', () => {
    const defs = buildSettingDefinitions(makeTab());
    const headings = flattenPages(defs).map(d => ('heading' in d ? d.heading : undefined));
    // undefined entries are page markers, bare rows, and the heading-less
    // list/action sections that render under the preceding section heading.
    const named = headings.filter((h): h is string => typeof h === 'string' && h !== '');
    const fixedPrefix = [
      'Features',
      'Map behavior', 'Color settings', 'Hex map settings',
      'Color palette',
      'Dungeon generation',
      'Fog of war',
      'Distance measurement', 'Travel packs',
      'Tile sets',
      'Object types', 'Object sets', 'Object customization'
    ];
    expect(named.slice(0, fixedPrefix.length)).toEqual(fixedPrefix);
    // The remainder is one named list per object category, then shortcuts;
    // no hidden-objects group on default settings.
    const rest = named.slice(fixedPrefix.length);
    expect(rest.length).toBeGreaterThan(1);
    expect(rest[rest.length - 1]).toBe('Keyboard shortcuts');
    expect(rest.some(h => h.startsWith('Hidden objects'))).toBe(false);
  });

  it('gates the dungeon, fog, measurement, and tiles pages on their feature flags', () => {
    const tab = makeTab({ features: { dungeonGenerator: false, fogOfWar: false, measurement: false, tiles: false } });
    setPlugin({ settings: tab.plugin.settings } as never);
    const defs = buildSettingDefinitions(tab);
    for (const name of ['Dungeon generation', 'Fog of war', 'Measurement & travel', 'Tile sets']) {
      const page = pageByName(defs, name);
      const visible = ('visible' in page ? page.visible : undefined) as (() => boolean) | undefined;
      expect(typeof visible, `page "${name}" visible()`).toBe('function');
      expect(visible?.()).toBe(false);
    }
    for (const name of ['Display & behavior', 'Color palette', 'Objects', 'Keyboard shortcuts']) {
      const page = pageByName(defs, name);
      expect('visible' in page ? page.visible : undefined, `page "${name}" is ungated`).toBeUndefined();
    }
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
    const groups = flattenPages(buildSettingDefinitions(makeTab()));
    const nameless = groups
      .filter(g => !('type' in g && g.type === 'page'))
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
    expect(captureRows).toHaveLength(15);
    const resetAll = items.find(i => 'name' in i && i.name === 'Reset all shortcuts');
    expect(resetAll != null && 'action' in resetAll && typeof resetAll.action === 'function').toBe(true);
  });

  describe('page displayValue chips (1.13.1; ignored by older renderers)', () => {
    function displayValueOf(tab: FakeTab, pageName: string): () => string {
      const page = pageByName(buildSettingDefinitions(tab), pageName);
      const dv = ('displayValue' in page ? page.displayValue : undefined) as (() => string) | undefined;
      expect(typeof dv, `page "${pageName}" displayValue`).toBe('function');
      return dv as () => string;
    }

    it('summarizes tile folder count with singular/plural, skipping blank rows', () => {
      expect(displayValueOf(makeTab({ tilesetFolders: [] }), 'Tile sets')()).toBe('0 folders');
      expect(displayValueOf(makeTab({ tilesetFolders: ['Assets/tiles'] }), 'Tile sets')()).toBe('1 folder');
      expect(displayValueOf(makeTab({ tilesetFolders: ['Assets/tiles', 'Assets/more'] }), 'Tile sets')()).toBe('2 folders');
      expect(displayValueOf(makeTab({ tilesetFolders: ['Assets/tiles', '  '] }), 'Tile sets')()).toBe('1 folder');
    });

    it('names the active fog texture, falling back to Default and Custom', () => {
      expect(displayValueOf(makeTab({ fogOfWarImage: null }), 'Fog of war')()).toBe('Default');
      const withPack = makeTab({
        installedContentPacks: [
          { id: 'mist', name: 'Rolling mist', version: '1.0.0', type: 'fog-pack', vaultPath: 'windrose-content/mist' }
        ] as PluginSettings['installedContentPacks'],
        fogOfWarImage: 'windrose-content/mist/mist.jpg'
      });
      expect(displayValueOf(withPack, 'Fog of war')()).toBe('Rolling mist');
      expect(displayValueOf(makeTab({ fogOfWarImage: 'some/manual/path.png' }), 'Fog of war')()).toBe('Custom');
    });

    it('shows the active object set name with a modified marker', () => {
      expect(displayValueOf(makeTab(), 'Objects')()).toBe('Default');
      const dirtyNoSet = makeTab({
        customGridObjects: [{ id: 'c1', symbol: 'X', label: 'Probe', category: 'custom' }] as PluginSettings['customGridObjects']
      });
      expect(displayValueOf(dirtyNoSet, 'Objects')()).toBe('Modified');
      const withSet = makeTab({
        objectSets: [{ id: 's1', name: 'Wilderness', data: {} }] as PluginSettings['objectSets'],
        activeObjectSetId: 's1'
      });
      expect(displayValueOf(withSet, 'Objects')()).toBe('Wilderness');
      withSet.plugin.settings.customGridObjects = [{ id: 'c1', symbol: 'X', label: 'Probe', category: 'custom' }] as PluginSettings['customGridObjects'];
      expect(displayValueOf(withSet, 'Objects')()).toBe('Wilderness (modified)');
    });
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
