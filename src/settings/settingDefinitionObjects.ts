import type { SettingDefinitionItem, SettingGroupItem, SettingDefinitionList } from 'obsidian';
import { Notice } from 'obsidian';
import type { CustomObject, CustomCategory, ObjectSet } from '#types/settings/settings.types';
import { ObjectHelpers } from './helpers/objectHelpers';
import { ObjectSetHelpers } from './helpers/objectSetHelpers';
import { FolderSuggest } from './helpers/FolderSuggest';
import { ObjectEditModal } from './modals/ObjectEditModal';
import { CategoryEditModal } from './modals/CategoryEditModal';
import { ExportModal } from './modals/ExportModal';
import { ImportModal } from './modals/ImportModal';
import { ObjectSetRenameModal } from './modals/ObjectSetRenameModal';
import { ObjectSetExportModal } from './modals/ObjectSetExportModal';
import { ObjectSetImportModal } from './modals/ObjectSetImportModal';
import { ConfirmModal } from './modals/ConfirmModal';
import { PromptModal } from './modals/PromptModal';
import { ContentPackBrowserModal } from '../content-packs/ContentPackBrowserModal';
import { infoItem, dedupeRowNames, saveAndRebuild } from './settingDefinitionLists';
import type { SettingsTabThis } from './tabs/settingsTabContext';

// settingDefinitionObjects.ts
// Declarative Settings API (Obsidian 1.13+) Object Types section: object
// sets, map-type-scoped customization actions, per-category native lists
// with drag reorder, and the hidden-objects group. Phase 2 of the migration
// in docs/proposals/settings-api-migration.md. The imperative in-section
// filter box is not ported: rows carry symbol/icon aliases instead, so the
// native settings search covers object lookup (proposal Phase 3 direction).

/** Resolved object entry from ObjectHelpers.getResolved() */
interface ResolvedObject {
  id: string;
  category?: string;
  symbol?: string;
  label?: string;
  imagePath?: string;
  iconClass?: string;
  order: number;
  isBuiltIn: boolean;
  isModified?: boolean;
  isCustom?: boolean;
  isHidden?: boolean;
  [key: string]: unknown;
}

/** Resolved category entry from ObjectHelpers.getCategories() */
interface ResolvedCategory {
  id: string;
  label?: string;
  order: number;
  isBuiltIn: boolean;
  isCustom?: boolean;
}

type OverridesKey = 'hexObjectOverrides' | 'gridObjectOverrides';
type CustomObjectsKey = 'customHexObjects' | 'customGridObjects';
type CustomCategoriesKey = 'customHexCategories' | 'customGridCategories';

function overridesKeyFor(tab: SettingsTabThis): OverridesKey {
  return tab.selectedMapType === 'hex' ? 'hexObjectOverrides' : 'gridObjectOverrides';
}

function customObjectsKeyFor(tab: SettingsTabThis): CustomObjectsKey {
  return tab.selectedMapType === 'hex' ? 'customHexObjects' : 'customGridObjects';
}

function customCategoriesKeyFor(tab: SettingsTabThis): CustomCategoriesKey {
  return tab.selectedMapType === 'hex' ? 'customHexCategories' : 'customGridCategories';
}

function dispatchSettingsChanged(): void {
  window.dispatchEvent(new CustomEvent('windrose-settings-changed', {
    detail: { timestamp: Date.now() }
  }));
}

// --- Object sets ---

function objectSetRow(tab: SettingsTabThis, set: ObjectSet): SettingGroupItem {
  const scope: string[] = [];
  if (set.data.hex) scope.push('hex');
  if (set.data.grid) scope.push('grid');
  const active = set.id === tab.plugin.settings.activeObjectSetId;
  return {
    name: set.name + (active ? ' (active)' : ''),
    desc: [scope.join('+'), set.source].filter(s => s !== '').join(' · '),
    render: (setting) => {
      setting.addExtraButton(btn => btn
        .setIcon('pencil')
        .setTooltip('Rename set')
        .onClick(() => {
          new ObjectSetRenameModal(tab.app, set.name, (newName: string) => {
            ObjectSetHelpers.renameSet(tab.plugin, set.id, newName);
            saveAndRebuild(tab);
          }).open();
        }));
      setting.addExtraButton(btn => btn
        .setIcon('download')
        .setTooltip('Export set to folder')
        .onClick(() => {
          new ObjectSetExportModal(tab.app, tab.plugin, set).open();
        }));
    }
  };
}

function activeSetDropdownRow(tab: SettingsTabThis, sets: ObjectSet[], isDirty: boolean): SettingGroupItem {
  return {
    name: 'Active set',
    desc: 'Switch to a saved set (overwrites current objects)',
    render: (setting) => {
      setting.addDropdown(dropdown => {
        dropdown.addOption('__defaults__', 'Defaults (built-in)');
        for (const set of sets) {
          const scope: string[] = [];
          if (set.data.hex) scope.push('hex');
          if (set.data.grid) scope.push('grid');
          dropdown.addOption(set.id, set.name + (scope.length ? ' [' + scope.join('+') + ']' : ''));
        }
        const current = tab.plugin.settings.activeObjectSetId;
        dropdown.setValue(current != null && current !== '' ? current : '__defaults__');
        dropdown.onChange(async (value: string) => {
          // Prompt to save current objects before switching
          if (isDirty) {
            if (await new ConfirmModal(tab.app, {
              message: 'Save your current objects as a set before switching?',
              confirmText: 'Save',
              cancelText: value === '__defaults__' ? 'Reset Without Saving' : 'Switch Without Saving'
            }).openAndGetValue()) {
              const name = await new PromptModal(tab.app, {
                message: 'Name for the saved set:',
                defaultValue: 'My Objects'
              }).openAndGetValue();
              if (name != null && name !== '') {
                ObjectSetHelpers.saveCurrentAsSet(tab.plugin, name);
              }
            }
          }

          if (value === '__defaults__') {
            ObjectSetHelpers.resetToDefaults(tab.plugin);
          } else {
            ObjectSetHelpers.activateSet(tab.plugin, value);
          }
          tab.settingsChanged = true;
          await tab.plugin.saveSettings();
          dispatchSettingsChanged();
          tab.update();
        });
      });
    }
  };
}

function buildObjectSetsSections(tab: SettingsTabThis): SettingDefinitionItem[] {
  const s = tab.plugin.settings;
  const sets = s.objectSets ?? [];
  const activeSet = sets.find(st => st.id === s.activeObjectSetId);
  const isDirty = ObjectSetHelpers.isDirty(tab.plugin);

  const introItems: SettingGroupItem[] = [
    infoItem('Save and swap between named collections of object customizations.')
  ];
  if (activeSet != null) {
    introItems.push(infoItem(`Active set: ${activeSet.name}${isDirty ? ' (modified)' : ''}`));
  } else if (isDirty) {
    introItems.push(infoItem('Objects modified from defaults'));
  }
  introItems.push(activeSetDropdownRow(tab, sets, isDirty));

  const sections: SettingDefinitionItem[] = [{
    type: 'group',
    heading: 'Object sets',
    items: introItems
  }];

  if (sets.length > 0) {
    sections.push({
      type: 'list',
      onDelete: (index) => {
        const set = sets[index] as ObjectSet | undefined;
        if (set == null) return;
        void (async () => {
          if (await new ConfirmModal(tab.app, {
              message: 'Delete set "' + set.name + '"?',
              confirmText: 'Delete',
              isDestructive: true
            }).openAndGetValue()) {
            ObjectSetHelpers.deleteSet(tab.plugin, set.id);
            saveAndRebuild(tab);
          }
        })();
      },
      items: dedupeRowNames(sets.map(set => objectSetRow(tab, set)))
    });
  }

  sections.push({
    type: 'group',
    items: [
      {
        name: 'Save current as set',
        desc: 'Snapshot the current object customizations under a name',
        action: () => {
          void (async () => {
            const name = await new PromptModal(tab.app, {
              message: 'Name for the new set:',
              defaultValue: 'My Objects'
            }).openAndGetValue();
            if (name == null || name === '') return;
            ObjectSetHelpers.saveCurrentAsSet(tab.plugin, name);
            await tab.plugin.saveSettings();
            new Notice('Saved set: ' + name);
            tab.update();
          })();
        }
      },
      {
        name: 'Import from folder',
        desc: 'Load object set packages from a vault folder',
        action: () => {
          new ObjectSetImportModal(tab.app, tab.plugin, () => saveAndRebuild(tab)).open();
        }
      },
      {
        name: 'Browse content packs',
        desc: 'Download object packs from the content library',
        action: () => {
          new ContentPackBrowserModal(tab.app, tab.plugin, 'object-pack', () => saveAndRebuild(tab)).open();
        }
      },
      {
        name: 'Auto-load folder',
        desc: 'Vault folder to scan for object set packages on startup',
        render: (setting) => {
          setting.addSearch(search => {
            new FolderSuggest(tab.app, search.inputEl);
            search
              .setPlaceholder('E.g. Windrose-objects')
              .setValue(tab.plugin.settings.objectSetsAutoLoadFolder ?? '')
              .onChange(async (value: string) => {
                tab.plugin.settings.objectSetsAutoLoadFolder = value.trim();
                await tab.plugin.saveSettings();
              });
          });
          setting.addButton(btn => btn
            .setButtonText('Scan now')
            .onClick(async () => {
              const added = await ObjectSetHelpers.scanAutoLoadFolder(tab.plugin);
              await tab.plugin.saveSettings();
              new Notice(added > 0 ? 'Found ' + added + ' new set(s)' : 'No new sets found');
              tab.update();
            }));
        }
      }
    ]
  });

  return sections;
}

// --- Object customization (map-type scoped) ---

function buildCustomizationGroup(tab: SettingsTabThis): SettingDefinitionItem {
  const mapTypeSettings = tab.getObjectSettingsForMapType();
  const hasOverrides = Object.keys(mapTypeSettings.objectOverrides ?? {}).length > 0;
  const hasCustomObjects = (mapTypeSettings.customObjects ?? []).length > 0;
  const hasCustomCategories = (mapTypeSettings.customCategories ?? []).length > 0;
  const hasAnyCustomizations = hasOverrides || hasCustomObjects || hasCustomCategories;

  const items: SettingGroupItem[] = [
    {
      name: 'Map type',
      desc: 'Select which map type to configure objects for',
      render: (setting) => {
        setting.addDropdown(dropdown => dropdown
          .addOption('grid', 'Grid maps')
          .addOption('hex', 'Hex maps')
          .setValue(tab.selectedMapType)
          .onChange((value: string) => {
            tab.selectedMapType = value as 'grid' | 'hex';
            tab.update();
          }));
      }
    },
    {
      name: 'Add custom object',
      desc: 'Create a new map object with your own symbol',
      action: () => {
        new ObjectEditModal(tab.app, tab.plugin, null, () => saveAndRebuild(tab), tab.selectedMapType).open();
      }
    },
    {
      name: 'Add custom category',
      desc: 'Create a new category to organize objects',
      action: () => {
        new CategoryEditModal(tab.app, tab.plugin, null, () => saveAndRebuild(tab), tab.selectedMapType).open();
      }
    },
    {
      name: 'Import / export',
      desc: 'Share object configurations as JSON files',
      render: (setting) => {
        setting.addButton(btn => btn
          .setButtonText('Import')
          .onClick(() => {
            new ImportModal(tab.app, tab.plugin, () => saveAndRebuild(tab), tab.selectedMapType).open();
          }));
        setting.addButton(btn => btn
          .setButtonText('Export')
          .onClick(() => {
            new ExportModal(tab.app, tab.plugin, tab.selectedMapType).open();
          }));
      }
    }
  ];

  if (hasAnyCustomizations) {
    items.push({
      name: `Reset ${tab.selectedMapType === 'hex' ? 'hex' : 'grid'} to defaults`,
      desc: `Restore built-in objects for ${tab.selectedMapType} maps. Does not affect saved sets.`,
      action: () => {
        void (async () => {
          const counts: string[] = [];
          if (hasOverrides) counts.push(`${Object.keys(mapTypeSettings.objectOverrides).length} modification(s)`);
          if (hasCustomObjects) counts.push(`${mapTypeSettings.customObjects.length} custom object(s)`);
          if (hasCustomCategories) counts.push(`${mapTypeSettings.customCategories.length} custom category(ies)`);

          if (await new ConfirmModal(tab.app, {
            message: `This will remove ${counts.join(', ')} for ${tab.selectedMapType} maps. Saved sets are not affected. Maps using custom objects will show "?" placeholders.`,
            confirmText: 'Reset to Defaults',
            isDestructive: true
          }).openAndGetValue()) {
            tab.updateObjectSettingsForMapType({
              objectOverrides: {},
              customObjects: [],
              customCategories: []
            });
            saveAndRebuild(tab);
          }
        })();
      }
    });
  }

  return { type: 'group', heading: 'Object customization', items };
}

// --- Per-category object lists ---

function objectRow(tab: SettingsTabThis, obj: ResolvedObject, isHiddenSection: boolean): SettingGroupItem {
  const aliases = [obj.symbol, obj.iconClass].filter((a): a is string => a != null && a !== '');
  return {
    name: obj.label ?? '',
    ...(aliases.length > 0 ? { aliases } : {}),
    render: (setting) => {
      // Re-renders reuse the row element and re-invoke render (the framework
      // only resets controlEl), so the prepended symbol must be cleared
      // first or it accumulates.
      setting.settingEl.querySelectorAll(':scope > .windrose-setting-object-symbol').forEach(n => n.remove());
      const symbolEl = createSpan({ cls: 'windrose-settings-object-symbol windrose-setting-object-symbol' });
      ObjectHelpers.renderObjectSymbol(obj, symbolEl, tab.app);
      setting.settingEl.prepend(symbolEl);
      if (obj.isModified === true) {
        setting.nameEl.addClass('windrose-settings-modified');
      }

      setting.addExtraButton(btn => btn
        .setIcon('pencil')
        .setTooltip('Edit object')
        .onClick(() => {
          new ObjectEditModal(tab.app, tab.plugin, obj, () => saveAndRebuild(tab), tab.selectedMapType).open();
        }));

      if (obj.isBuiltIn) {
        const overridesKey = overridesKeyFor(tab);
        if (isHiddenSection) {
          setting.addExtraButton(btn => btn
            .setIcon('eye')
            .setTooltip('Show in palette')
            .onClick(() => {
              const overrides = tab.plugin.settings[overridesKey];
              if (overrides?.[obj.id]) {
                delete overrides[obj.id].hidden;
                if (Object.keys(overrides[obj.id]).length === 0) {
                  delete overrides[obj.id];
                }
              }
              saveAndRebuild(tab);
            }));
        } else {
          setting.addExtraButton(btn => btn
            .setIcon('eye-off')
            .setTooltip('Hide from palette')
            .onClick(() => {
              tab.plugin.settings[overridesKey] ??= {};
              tab.plugin.settings[overridesKey][obj.id] ??= {};
              tab.plugin.settings[overridesKey][obj.id].hidden = true;
              saveAndRebuild(tab);
            }));
        }
        if (obj.isModified === true) {
          setting.addExtraButton(btn => btn
            .setIcon('rotate-ccw')
            .setTooltip('Reset to default')
            .onClick(() => {
              void (async () => {
                if (await new ConfirmModal(tab.app, {
                    message: `Reset "${obj.label}" to its default symbol and name?`,
                    confirmText: 'Reset',
                    isDestructive: true
                  }).openAndGetValue()) {
                  const overrides = tab.plugin.settings[overridesKey];
                  if (overrides) delete overrides[obj.id];
                  saveAndRebuild(tab);
                }
              })();
            }));
        }
      } else {
        const targetType = tab.selectedMapType === 'hex' ? 'grid' : 'hex';
        const targetLabel = targetType === 'hex' ? 'Hex' : 'Grid';
        setting.addExtraButton(btn => btn
          .setIcon('copy')
          .setTooltip(`Copy to ${targetLabel}`)
          .onClick(async () => {
            const targetObjectsKey: CustomObjectsKey = targetType === 'hex' ? 'customHexObjects' : 'customGridObjects';
            const targetCategoriesKey: CustomCategoriesKey = targetType === 'hex' ? 'customHexCategories' : 'customGridCategories';

            tab.plugin.settings[targetObjectsKey] ??= [];

            const newId = 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11);

            // Copy the object's custom category to the target type if absent
            const targetCategory = obj.category;
            const targetCategories = tab.plugin.settings[targetCategoriesKey] ?? [];
            const builtInCategoryIds = (ObjectHelpers.getCategories({
              objectOverrides: {},
              customObjects: [],
              customCategories: []
            }) as ResolvedCategory[]).map(c => c.id);

            if (targetCategory != null && targetCategory !== '' && !builtInCategoryIds.includes(targetCategory) && !targetCategories.find((c: CustomCategory) => c.id === obj.category)) {
              const sourceCategories = tab.plugin.settings[customCategoriesKeyFor(tab)] ?? [];
              const sourceCat = sourceCategories.find((c: CustomCategory) => c.id === obj.category);
              if (sourceCat) {
                tab.plugin.settings[targetCategoriesKey] ??= [];
                tab.plugin.settings[targetCategoriesKey].push({ ...sourceCat });
              }
            }

            // Copy the object with new ID — strip resolved-only fields
            const copiedObj: CustomObject = {
              id: newId,
              label: obj.label ?? '',
              category: targetCategory ?? '',
              ...(obj.symbol != null ? { symbol: obj.symbol } : {}),
              ...(obj.iconClass != null ? { iconClass: obj.iconClass } : {}),
              ...(obj.imagePath != null ? { imagePath: obj.imagePath } : {}),
              ...(obj.order != null ? { order: obj.order } : {}),
            };
            tab.plugin.settings[targetObjectsKey].push(copiedObj);

            tab.settingsChanged = true;
            await tab.plugin.saveSettings();
            new Notice(`Copied "${obj.label}" to ${targetLabel} maps`);
          }));
        setting.addExtraButton(btn => btn
          .setIcon('trash-2')
          .setTooltip('Delete object')
          .onClick(() => {
            void (async () => {
              if (await new ConfirmModal(tab.app, {
                  message: `Delete "${obj.label}"? Maps using this object will show a "?" placeholder.`,
                  confirmText: 'Delete',
                  isDestructive: true
                }).openAndGetValue()) {
                const customObjectsKey = customObjectsKeyFor(tab);
                if (tab.plugin.settings[customObjectsKey]) {
                  tab.plugin.settings[customObjectsKey] = tab.plugin.settings[customObjectsKey].filter((o: CustomObject) => o.id !== obj.id);
                }
                saveAndRebuild(tab);
              }
            })();
          }));
      }
    }
  };
}

/**
 * Reorder within one category, mirroring the imperative drop handler:
 * positions become order = index*10; a built-in back in its default position
 * gets its order override removed instead.
 */
function applyCategoryReorder(tab: SettingsTabThis, category: ResolvedCategory, categoryObjects: ResolvedObject[], oldIndex: number, newIndex: number): void {
  const objs = categoryObjects.slice();
  const [moved] = objs.splice(oldIndex, 1);
  if (moved == null) return;
  objs.splice(newIndex, 0, moved);

  const overridesKey = overridesKeyFor(tab);
  const customObjectsKey = customObjectsKeyFor(tab);
  const defaultIdOrder = ObjectHelpers.getDefaultIdOrder(category.id, tab.getObjectSettingsForMapType() as unknown as Record<string, unknown>);

  objs.forEach((obj, position) => {
    const newOrder = position * 10;
    if (obj.isBuiltIn) {
      const defaultPosition = defaultIdOrder.indexOf(obj.id);
      const overrides = tab.plugin.settings[overridesKey];
      if (position === defaultPosition) {
        if (overrides?.[obj.id]) {
          delete overrides[obj.id].order;
          if (Object.keys(overrides[obj.id]).length === 0) {
            delete overrides[obj.id];
          }
        }
      } else {
        tab.plugin.settings[overridesKey] ??= {};
        tab.plugin.settings[overridesKey][obj.id] ??= {};
        tab.plugin.settings[overridesKey][obj.id].order = newOrder;
      }
    } else {
      const customObjects = tab.plugin.settings[customObjectsKey] ?? [];
      const customObj = customObjects.find((o: CustomObject) => o.id === obj.id);
      if (customObj) customObj.order = newOrder;
    }
  });

  saveAndRebuild(tab);
}

function categoryList(tab: SettingsTabThis, category: ResolvedCategory, categoryObjects: ResolvedObject[], allObjects: ResolvedObject[]): SettingDefinitionList {
  const label = (category.label ?? '') + (categoryObjects.length > 0 ? ` (${categoryObjects.length})` : '');
  const list: SettingDefinitionList = {
    type: 'list',
    heading: label,
    emptyState: 'No objects in this category',
    onReorder: (oldIndex, newIndex) => applyCategoryReorder(tab, category, categoryObjects, oldIndex, newIndex),
    items: dedupeRowNames(categoryObjects.map(obj => objectRow(tab, obj, false)))
  };

  if (category.isCustom === true) {
    // Unfiltered count gates deletion — a category must be empty to delete
    const allCategoryObjects = allObjects.filter(obj => obj.category === category.id);
    list.extraButtons = [
      (btn) => btn
        .setIcon('pencil')
        .setTooltip('Edit category')
        .onClick(() => {
          new CategoryEditModal(tab.app, tab.plugin, category as unknown as CustomCategory, () => saveAndRebuild(tab), tab.selectedMapType).open();
        }),
      (btn) => btn
        .setIcon('trash-2')
        .setTooltip('Delete category')
        .onClick(() => {
          void (async () => {
            if (allCategoryObjects.length > 0) {
              new Notice(`Cannot delete "${category.label}" - it contains ${allCategoryObjects.length} object(s). Move or delete them first.`);
              return;
            }
            if (await new ConfirmModal(tab.app, {
                message: `Delete category "${category.label}"?`,
                confirmText: 'Delete',
                isDestructive: true
              }).openAndGetValue()) {
              const categoriesKey = customCategoriesKeyFor(tab);
              if (tab.plugin.settings[categoriesKey]) {
                tab.plugin.settings[categoriesKey] = tab.plugin.settings[categoriesKey].filter((c: CustomCategory) => c.id !== category.id);
              }
              saveAndRebuild(tab);
            }
          })();
        })
    ];
  }

  return list;
}

/** Summary for the Objects page entry: active set name plus a modified marker. */
function objectsPageDisplayValue(tab: SettingsTabThis): string {
  const s = tab.plugin.settings;
  const activeSet = (s.objectSets ?? []).find(set => set.id === s.activeObjectSetId);
  const isDirty = ObjectSetHelpers.isDirty(tab.plugin);
  if (activeSet != null) {
    return isDirty ? `${activeSet.name} (modified)` : activeSet.name;
  }
  return isDirty ? 'Modified' : 'Default';
}

// --- Section assembly ---

function buildObjectTypesSections(tab: SettingsTabThis): SettingDefinitionItem[] {
  const mapTypeSettings = tab.getObjectSettingsForMapType() as unknown as Record<string, unknown>;
  const allCategories = ObjectHelpers.getCategories(mapTypeSettings) as ResolvedCategory[];
  const allObjects = ObjectHelpers.getResolved(mapTypeSettings) as ResolvedObject[];
  const hiddenObjects = ObjectHelpers.getHidden(mapTypeSettings) as ResolvedObject[];

  const sections: SettingDefinitionItem[] = [
    {
      type: 'group',
      heading: 'Object types',
      items: [
        infoItem('Customize map objects: modify built-in objects, create custom objects, or hide objects you don\'t use.')
      ]
    },
    ...buildObjectSetsSections(tab),
    buildCustomizationGroup(tab)
  ];

  for (const category of allCategories) {
    const categoryObjects = allObjects
      .filter(obj => obj.category === category.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    // Skip empty built-in categories; keep empty custom ones so they can be
    // edited or deleted (deletion requires them to be empty).
    if (categoryObjects.length === 0 && category.isBuiltIn) continue;
    sections.push(categoryList(tab, category, categoryObjects, allObjects));
  }

  if (hiddenObjects.length > 0) {
    sections.push({
      type: 'group',
      heading: `Hidden objects (${hiddenObjects.length})`,
      items: [
        infoItem('Built-in objects you\'ve hidden from the palette.'),
        ...dedupeRowNames(hiddenObjects.map(obj => objectRow(tab, obj, true)))
      ]
    });
  }

  return sections;
}

export { buildObjectTypesSections, objectsPageDisplayValue };
