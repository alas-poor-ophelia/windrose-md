import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SettingDefinitionList, SettingDefinitionItem } from 'obsidian';
import { buildObjectTypesSections } from '../../../src/settings/settingDefinitionObjects';
import type { SettingsTabThis, ObjectSettingsForMapType, ObjectSettingsUpdate } from '../../../src/settings/tabs/settingsTabContext';
import type { PluginSettings } from '#types/settings/settings.types';
import { clearPlugin, FALLBACK_SETTINGS } from '../../../src/core/settingsAccessor';

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
  const tab = {
    app: plugin.app,
    plugin,
    settingsChanged: false,
    selectedMapType: 'grid' as const,
    objectFilter: '',
    refreshDomState: vi.fn(),
    update: vi.fn(),
    getObjectSettingsForMapType(): ObjectSettingsForMapType {
      return {
        objectOverrides: settings.gridObjectOverrides ?? {},
        customObjects: settings.customGridObjects ?? [],
        customCategories: settings.customGridCategories ?? []
      };
    },
    updateObjectSettingsForMapType(updates: ObjectSettingsUpdate): void {
      if (updates.objectOverrides !== undefined) settings.gridObjectOverrides = updates.objectOverrides;
      if (updates.customObjects !== undefined) settings.customGridObjects = updates.customObjects;
      if (updates.customCategories !== undefined) settings.customGridCategories = updates.customCategories;
    }
  };
  return tab as unknown as FakeTab;
}

function headings(sections: SettingDefinitionItem[]): (string | undefined)[] {
  return sections.map(s => ('heading' in s ? s.heading : undefined));
}

afterEach(() => {
  clearPlugin();
});

describe('buildObjectTypesSections', () => {
  it('assembles intro, object sets, customization, and per-category lists', () => {
    const sections = buildObjectTypesSections(makeTab());
    const h = headings(sections);
    expect(h[0]).toBe('Object types');
    expect(h).toContain('Object sets');
    expect(h).toContain('Object customization');
    const lists = sections.filter(s => 'type' in s && s.type === 'list') as SettingDefinitionList[];
    expect(lists.length).toBeGreaterThan(0);
    for (const list of lists) {
      expect(typeof list.onReorder).toBe('function');
    }
  });

  it('omits reset row without customizations and includes it with them', () => {
    const plain = buildObjectTypesSections(makeTab());
    const custom = buildObjectTypesSections(makeTab({
      gridObjectOverrides: { water: { label: 'Agua' } }
    } as unknown as Partial<PluginSettings>));
    const resetIn = (sections: SettingDefinitionItem[]): boolean => sections.some(s =>
      'items' in s && (s.items ?? []).some(i => 'name' in i && i.name.startsWith('Reset ')));
    expect(resetIn(plain)).toBe(false);
    expect(resetIn(custom)).toBe(true);
  });

  it('shows the hidden-objects group only when objects are hidden', () => {
    const plain = buildObjectTypesSections(makeTab());
    expect(headings(plain).some(h => h?.startsWith('Hidden objects'))).toBe(false);

    const withHidden = buildObjectTypesSections(makeTab({
      gridObjectOverrides: { entrance: { hidden: true } }
    } as unknown as Partial<PluginSettings>));
    const hiddenHeading = headings(withHidden).find(h => h?.startsWith('Hidden objects'));
    expect(hiddenHeading).toBe('Hidden objects (1)');
  });

  it('writes an order override when a built-in moves and clears it when it moves back', () => {
    const tab = makeTab();
    const findFirstCategoryList = (): SettingDefinitionList => {
      const sections = buildObjectTypesSections(tab);
      const custIdx = sections.findIndex(s => 'heading' in s && s.heading === 'Object customization');
      return sections.slice(custIdx + 1).find(s => 'type' in s && s.type === 'list') as SettingDefinitionList;
    };

    const list = findFirstCategoryList();
    const rowNames = (list.items ?? []).map(i => ('name' in i ? i.name : ''));
    expect(rowNames.length).toBeGreaterThan(1);

    // Move first object to second position: both displaced built-ins get overrides
    list.onReorder?.(0, 1);
    const overrides = tab.plugin.settings.gridObjectOverrides ?? {};
    const overriddenIds = Object.keys(overrides).filter(id => overrides[id].order != null);
    expect(overriddenIds.length).toBeGreaterThan(0);
    expect(tab.plugin.saveSettings).toHaveBeenCalled();

    // Rebuild (order now applied) and move it back: overrides clear
    const list2 = findFirstCategoryList();
    list2.onReorder?.(1, 0);
    const overridesAfter = tab.plugin.settings.gridObjectOverrides ?? {};
    const stillOverridden = Object.keys(overridesAfter).filter(id => overridesAfter[id].order != null);
    expect(stillOverridden).toHaveLength(0);
  });

  it('keeps empty custom categories listed with edit/delete header buttons', () => {
    const sections = buildObjectTypesSections(makeTab({
      customGridCategories: [{ id: 'cat-x', label: 'My Empty', order: 500 }]
    } as unknown as Partial<PluginSettings>));
    const emptyCat = sections.find(s => 'heading' in s && s.heading === 'My Empty') as SettingDefinitionList | undefined;
    expect(emptyCat).toBeDefined();
    expect(emptyCat?.type).toBe('list');
    expect(emptyCat?.extraButtons).toHaveLength(2);
    expect(emptyCat?.items ?? []).toHaveLength(0);
    expect(emptyCat?.emptyState).toBe('No objects in this category');
  });

  it('gives object rows symbol aliases for the native settings search', () => {
    const sections = buildObjectTypesSections(makeTab());
    const lists = sections.filter(s => 'type' in s && s.type === 'list') as SettingDefinitionList[];
    const rows = lists.flatMap(l => l.items ?? []).filter(i => 'render' in i);
    const withAliases = rows.filter(r => 'aliases' in r && Array.isArray(r.aliases) && r.aliases.length > 0);
    expect(withAliases.length).toBeGreaterThan(0);
  });
});
