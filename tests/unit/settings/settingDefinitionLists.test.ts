import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SettingDefinitionList, SettingDefinitionGroup } from 'obsidian';
import { buildColorPaletteSections, buildTravelPackSections, buildTilesetSections, packSummary, packSlug } from '../../../src/settings/settingDefinitionLists';
import type { SettingsTabThis } from '../../../src/settings/tabs/settingsTabContext';
import type { PluginSettings } from '#types/settings/settings.types';
import type { TravelPack } from '#types/settings/travelPack.types';
import { clearPlugin, FALLBACK_SETTINGS, BUILT_IN_COLORS } from '../../../src/core/settingsAccessor';

type FakeTab = SettingsTabThis & {
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
    refreshDomState: vi.fn(),
    update: vi.fn()
  } as unknown as FakeTab;
}

function makePack(id: string, name: string): TravelPack {
  return {
    id, name, enabled: true,
    modes: [], terrains: [], units: [], allowances: []
  } as unknown as TravelPack;
}

afterEach(() => {
  clearPlugin();
});

describe('buildColorPaletteSections', () => {
  it('builds a list with an addItem affordance and no forced delete/reorder', () => {
    const [palette] = buildColorPaletteSections(makeTab()) as SettingDefinitionList[];
    expect(palette.type).toBe('list');
    expect(palette.heading).toBe('Color palette');
    expect(palette.addItem?.name).toBe('Add color');
    expect(palette.onDelete).toBeUndefined();
    expect(palette.onReorder).toBeUndefined();
  });

  it('renders every visible built-in as a named render row', () => {
    const [palette] = buildColorPaletteSections(makeTab()) as SettingDefinitionList[];
    const rows = (palette.items ?? []).filter(i => 'name' in i && i.name !== '');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect('render' in row && typeof row.render === 'function').toBe(true);
    }
  });

  it('adds a hidden-colors group only when a built-in is hidden', () => {
    const without = buildColorPaletteSections(makeTab());
    expect(without.some(s => 'heading' in s && s.heading === 'Hidden colors')).toBe(false);

    const hiddenId = BUILT_IN_COLORS[0].id;
    const sections = buildColorPaletteSections(makeTab({
      colorPaletteOverrides: { [hiddenId]: { hidden: true } }
    } as unknown as Partial<PluginSettings>));
    const hiddenGroup = sections.find(s => 'heading' in s && s.heading === 'Hidden colors') as SettingDefinitionGroup | undefined;
    expect(hiddenGroup).toBeDefined();
    expect((hiddenGroup?.items ?? [])).toHaveLength(1);
    const palette = sections[0] as SettingDefinitionList;
    expect(palette.items?.some(i => 'name' in i && i.name === BUILT_IN_COLORS[0].label)).toBe(false);
  });
});

describe('buildTravelPackSections', () => {
  it('produces intro group, list, and action group, all gated on measurement', () => {
    const sections = buildTravelPackSections(makeTab({ travelPacks: [makePack('a', 'Pack A')] }));
    expect(sections).toHaveLength(3);
    const [intro, list, actions] = sections as [SettingDefinitionGroup, SettingDefinitionList, SettingDefinitionGroup];
    expect(intro.heading).toBe('Travel packs');
    expect(list.type).toBe('list');
    expect(list.emptyState).toBe('No travel packs yet');
    expect(list.addItem?.name).toBe('New travel pack');
    expect((list.items ?? []).map(i => ('name' in i ? i.name : ''))).toEqual(['Pack A']);
    const actionNames = (actions.items ?? []).map(i => ('name' in i ? i.name : ''));
    expect(actionNames).toEqual(['Import from file', 'Browse travel packs']);
    for (const s of sections) {
      expect(typeof ('visible' in s ? s.visible : undefined)).toBe('function');
    }
  });

  it('suffixes duplicate pack names so Obsidian row keys stay unique', () => {
    const sections = buildTravelPackSections(makeTab({
      travelPacks: [makePack('a', 'Twin'), makePack('b', 'Twin'), makePack('c', 'Solo')]
    }));
    const list = sections[1] as SettingDefinitionList;
    expect((list.items ?? []).map(i => ('name' in i ? i.name : ''))).toEqual(['Twin', 'Twin (2)', 'Solo']);
  });

  it('summarizes pack contents and slugs pack names for export filenames', () => {
    const pack = makePack('x', 'My Pack');
    expect(packSummary(pack)).toBe('0 mode(s) · 0 terrain(s) · 0 unit(s) · 0 allowance(s)');
    expect(packSlug('My Wild  Pack!')).toBe('my-wild-pack');
    expect(packSlug('***')).toBe('pack');
  });
});

describe('buildTilesetSections', () => {
  it('maps onDelete indices to the folder list one-to-one', () => {
    const tab = makeTab({ tilesetFolders: ['a/one', 'b/two', 'c/three'] });
    const sections = buildTilesetSections(tab);
    const list = sections[1] as SettingDefinitionList;
    expect((list.items ?? [])).toHaveLength(3);
    list.onDelete?.(1);
    expect(tab.plugin.settings.tilesetFolders).toEqual(['a/one', 'c/three']);
    expect(tab.plugin.settings).toBeDefined();
    expect(tab.plugin.saveSettings).toHaveBeenCalled();
    expect(tab.settingsChanged).toBe(true);
  });

  it('omits the preview action group when no folders are configured', () => {
    const withFolders = buildTilesetSections(makeTab({ tilesetFolders: ['a'] }));
    const without = buildTilesetSections(makeTab({ tilesetFolders: [] }));
    expect(withFolders).toHaveLength(3);
    expect(without).toHaveLength(2);
    const preview = withFolders[2] as SettingDefinitionGroup;
    expect((preview.items ?? []).some(i => 'name' in i && i.name === 'Preview')).toBe(true);
  });
});
