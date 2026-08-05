import type { SettingDefinitionItem, SettingGroupItem } from 'obsidian';
import { Notice } from 'obsidian';
import type { TravelPack } from '#types/settings/travelPack.types';
import { BUILT_IN_COLORS } from '../core/settingsAccessor';
import { isFeatureEnabled } from '../core/featureFlags';
import { ContentPackBrowserModal } from '../content-packs/ContentPackBrowserModal';
import {
  createTravelPack,
  removeTravelPack,
  serializeTravelPack,
  setTravelPackEnabled,
  upsertTravelPack,
  validateTravelPackImport,
} from '../travel/travelPackOperations';
import { ColorHelpers } from './helpers/colorHelpers';
import { FolderSuggest } from './helpers/FolderSuggest';
import { runFolderDetection, FOLDER_DETECT_DEBOUNCE_MS } from './helpers/folderDetection';
import { ColorEditModal } from './modals/ColorEditModal';
import { ConfirmModal } from './modals/ConfirmModal';
import { TravelPackEditModal } from './modals/TravelPackEditModal';
import { AddTilesModal } from './modals/AddTilesModal';
import type { SettingsTabThis } from './tabs/settingsTabContext';

// settingDefinitionLists.ts
// Declarative Settings API (Obsidian 1.13+) list sections: Color palette,
// Travel packs, and Tile sets. Phase 2 of the migration in
// docs/proposals/settings-api-migration.md. Section shape: an intro group
// carries the section heading (native lists force delete/drag affordances
// onto EVERY item row, so intro text cannot live inside a list that uses
// onDelete), then the bare list with its addItem affordance, then a trailing
// group with the section's manage/browse action rows.

// The 1.13 declarative renderer silently drops control-less items whose name
// is empty (verified live on 1.13.4: getElementForDefinition returns
// undefined for them). A no-op render callback makes the row render as a
// plain description paragraph, matching the imperative tab's intro text.
function infoItem(desc: string): SettingGroupItem {
  return { name: '', desc, searchable: false, render: () => {} };
}

// Obsidian keys declarative rows by their name ("duplicate setting key"
// console error, flaky re-render reconciliation on collision), so rows built
// from user-named data (packs, colors) get a " (2)", " (3)" suffix on exact
// duplicates.
function dedupeRowNames(rows: SettingGroupItem[]): SettingGroupItem[] {
  const seen = new Map<string, number>();
  return rows.map(row => {
    if (!('name' in row) || row.name === '') return row;
    const count = (seen.get(row.name) ?? 0) + 1;
    seen.set(row.name, count);
    return count === 1 ? row : { ...row, name: `${row.name} (${count})` };
  });
}

/** Shape of a resolved palette color row (ColorHelpers.getResolved element) */
interface DisplayColor {
  id: string;
  color: string;
  label: string;
  opacity?: number;
  isBuiltIn?: boolean;
  isModified?: boolean;
  isCustom?: boolean;
}

// --- Color palette ---

function saveAndRebuild(tab: SettingsTabThis): void {
  tab.settingsChanged = true;
  void tab.plugin.saveSettings().then(() => tab.update());
}

function colorRow(tab: SettingsTabThis, color: DisplayColor, isHidden: boolean): SettingGroupItem {
  const opacity = color.opacity ?? 1;
  const hexText = opacity < 1 ? `${color.color} @ ${Math.round(opacity * 100)}%` : color.color;
  const flair = color.isModified === true ? ' (modified)' : color.isCustom === true ? ' (custom)' : '';
  return {
    name: color.label,
    desc: hexText,
    render: (setting) => {
      // Re-renders reuse the row element and re-invoke render (the framework
      // only resets controlEl), so anything added outside controlEl must be
      // cleared first or it accumulates.
      setting.settingEl.querySelectorAll(':scope > .windrose-setting-color-swatch').forEach(n => n.remove());
      setting.nameEl.querySelectorAll('.windrose-color-row-modified').forEach(n => n.remove());
      const swatch = createDiv({ cls: 'windrose-setting-color-swatch' });
      swatch.style.backgroundColor = color.color;
      swatch.style.opacity = String(opacity);
      setting.settingEl.prepend(swatch);
      if (flair !== '') {
        setting.nameEl.createSpan({ text: flair, cls: 'windrose-color-row-modified' });
      }
      setting.addExtraButton(btn => btn
        .setIcon('pencil')
        .setTooltip('Edit color')
        .onClick(() => {
          new ColorEditModal(tab.app, tab.plugin, color, () => saveAndRebuild(tab)).open();
        }));
      if (color.isBuiltIn === true) {
        setting.addExtraButton(btn => btn
          .setIcon(isHidden ? 'eye' : 'eye-off')
          .setTooltip(isHidden ? 'Show color' : 'Hide color')
          .onClick(() => {
            const overrides = tab.plugin.settings.colorPaletteOverrides ??= {};
            overrides[color.id] ??= {};
            overrides[color.id].hidden = !isHidden;
            // Clean up an override that only says "not hidden"
            if (Object.keys(overrides[color.id]).length === 1 && overrides[color.id].hidden !== true) {
              delete overrides[color.id];
            }
            saveAndRebuild(tab);
          }));
        if (color.isModified === true) {
          setting.addExtraButton(btn => btn
            .setIcon('rotate-ccw')
            .setTooltip('Reset to default')
            .onClick(() => {
              if (tab.plugin.settings.colorPaletteOverrides) {
                delete tab.plugin.settings.colorPaletteOverrides[color.id];
              }
              saveAndRebuild(tab);
            }));
        }
      }
      if (color.isCustom === true) {
        setting.addExtraButton(btn => btn
          .setIcon('trash-2')
          .setTooltip('Delete color')
          .onClick(() => {
            tab.plugin.settings.customPaletteColors = (tab.plugin.settings.customPaletteColors ?? []).filter(c => c.id !== color.id);
            saveAndRebuild(tab);
          }));
      }
    }
  };
}

function buildColorPaletteSections(tab: SettingsTabThis): SettingDefinitionItem[] {
  const settingsRecord = tab.plugin.settings as unknown as Record<string, unknown>;
  const resolvedColors = ColorHelpers.getResolved(settingsRecord);
  const hiddenColors = ColorHelpers.getHidden(settingsRecord);
  const visibleColors = resolvedColors.filter(c => !hiddenColors.has(c.id));
  const hiddenBuiltIns = BUILT_IN_COLORS.filter(c => hiddenColors.has(c.id));

  const sections: SettingDefinitionItem[] = [{
    // No onDelete/onReorder: built-ins are hidden rather than deleted, so
    // rows carry their own edit/hide/reset/delete buttons and the list is
    // only used for its addItem affordance.
    type: 'list',
    heading: 'Color palette',
    addItem: {
      name: 'Add color',
      action: () => {
        new ColorEditModal(tab.app, tab.plugin, null, () => saveAndRebuild(tab)).open();
      }
    },
    items: [
      infoItem('Customize the color palette used for drawing cells and objects. Edit built-in colors, add custom colors, or hide colors you don\'t use.'),
      ...dedupeRowNames(visibleColors.map(c => colorRow(tab, c as unknown as DisplayColor, false)))
    ]
  }];

  if (hiddenBuiltIns.length > 0) {
    sections.push({
      type: 'group',
      heading: 'Hidden colors',
      items: hiddenBuiltIns.map(c => {
        const override = tab.plugin.settings.colorPaletteOverrides?.[c.id];
        const display: DisplayColor = override
          ? { ...c, ...override, isBuiltIn: true, isModified: true }
          : { ...c, isBuiltIn: true };
        return colorRow(tab, display, true);
      })
    });
  }

  sections.push({
    type: 'group',
    items: [{
      name: 'Reset palette',
      desc: 'Restore all built-in colors to defaults and remove custom colors',
      action: () => {
        void (async () => {
          if (await new ConfirmModal(tab.app, {
              message: 'Reset all colors to defaults? This will remove all customizations.',
              confirmText: 'Reset All',
              isDestructive: true
            }).openAndGetValue()) {
            tab.plugin.settings.colorPaletteOverrides = {};
            tab.plugin.settings.customPaletteColors = [];
            saveAndRebuild(tab);
          }
        })();
      }
    }]
  });

  return sections;
}

// --- Travel packs ---

/** Summarize a pack's contents for its list row */
function packSummary(pack: TravelPack): string {
  const parts = [
    `${pack.modes.length} mode(s)`,
    `${pack.terrains.length} terrain(s)`,
    `${pack.units.length} unit(s)`,
    `${pack.allowances.length} allowance(s)`,
  ];
  const summary = parts.join(' · ');
  return pack.description != null && pack.description !== ''
    ? `${pack.description} — ${summary}`
    : summary;
}

/** Vault-safe filename slug from a pack name */
function packSlug(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug === '' ? 'pack' : slug;
}

async function importTravelPackFile(tab: SettingsTabThis, file: File): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    new Notice('Import failed: the file is not valid JSON');
    return;
  }

  const result = validateTravelPackImport(parsed);
  if (!result.valid || result.pack == null) {
    new Notice('Import failed:\n' + result.errors.slice(0, 5).join('\n'), 10000);
    return;
  }

  const existing = (tab.plugin.settings.travelPacks ?? []).find(p => p.id === result.pack?.id);
  if (existing != null) {
    const confirmed = await new ConfirmModal(tab.app, {
      message: `A travel pack with this id already exists ("${existing.name}"). Replace it with "${result.pack.name}"?`,
      confirmText: 'Replace pack'
    }).openAndGetValue();
    if (!confirmed) return;
  }

  tab.plugin.settings.travelPacks = upsertTravelPack(tab.plugin.settings.travelPacks ?? [], result.pack);
  saveAndRebuild(tab);
  new Notice(`Imported travel pack "${result.pack.name}"`);
}

function travelPackRow(tab: SettingsTabThis, pack: TravelPack): SettingGroupItem {
  return {
    name: pack.name,
    desc: packSummary(pack),
    render: (setting) => {
      setting.addToggle(toggle => {
        toggle.setTooltip(pack.enabled ? 'Enabled — shown in map UI' : 'Disabled — hidden from map UI');
        toggle.setValue(pack.enabled);
        toggle.onChange(async (enabled) => {
          tab.plugin.settings.travelPacks = setTravelPackEnabled(tab.plugin.settings.travelPacks ?? [], pack.id, enabled);
          tab.settingsChanged = true;
          await tab.plugin.saveSettings();
        });
      });
      setting.addExtraButton(btn => btn
        .setIcon('pencil')
        .setTooltip('Edit pack')
        .onClick(() => {
          new TravelPackEditModal(tab.app, tab.plugin, pack.id, () => saveAndRebuild(tab)).open();
        }));
      setting.addExtraButton(btn => btn
        .setIcon('download')
        .setTooltip('Export to file')
        .onClick(async () => {
          const current = (tab.plugin.settings.travelPacks ?? []).find(p => p.id === pack.id);
          if (!current) return;
          const base = `windrose-travel-pack-${packSlug(current.name)}`;
          let filename = `${base}.json`;
          if (tab.app.vault.getAbstractFileByPath(filename) != null) {
            filename = `${base}-${Date.now()}.json`;
          }
          try {
            await tab.app.vault.create(filename, serializeTravelPack(current));
            new Notice(`Exported to ${filename} in the vault root`);
          } catch (e) {
            console.error('[Windrose] Travel pack export failed:', e);
            new Notice('Export failed — see console for details');
          }
        }));
    }
  };
}

function buildTravelPackSections(tab: SettingsTabThis): SettingDefinitionItem[] {
  const measurementEnabled = (): boolean => isFeatureEnabled('measurement');
  const packs = tab.plugin.settings.travelPacks ?? [];
  return [
    {
      type: 'group',
      heading: 'Travel packs',
      visible: measurementEnabled,
      items: [
        infoItem('Travel packs bundle the travel rules of a game system — custom units, terrain speed multipliers, travel modes, and per-day allowances. Enabled packs power travel times in the measure tool and the beacon.')
      ]
    },
    {
      type: 'list',
      visible: measurementEnabled,
      emptyState: 'No travel packs yet',
      addItem: {
        name: 'New travel pack',
        action: () => {
          void (async () => {
            const pack = createTravelPack('New travel pack');
            tab.plugin.settings.travelPacks = upsertTravelPack(tab.plugin.settings.travelPacks ?? [], pack);
            tab.settingsChanged = true;
            await tab.plugin.saveSettings();
            tab.update();
            new TravelPackEditModal(tab.app, tab.plugin, pack.id, () => saveAndRebuild(tab)).open();
          })();
        }
      },
      onDelete: (index) => {
        const pack = (tab.plugin.settings.travelPacks ?? [])[index] as TravelPack | undefined;
        if (pack == null) return;
        void (async () => {
          const confirmed = await new ConfirmModal(tab.app, {
            message: `Delete travel pack "${pack.name}"?\nMaps referencing it fall back to plain distance display.`,
            confirmText: 'Delete pack',
            isDestructive: true
          }).openAndGetValue();
          if (!confirmed) return;
          tab.plugin.settings.travelPacks = removeTravelPack(tab.plugin.settings.travelPacks ?? [], pack.id);
          saveAndRebuild(tab);
        })();
      },
      items: dedupeRowNames(packs.map(pack => travelPackRow(tab, pack)))
    },
    {
      type: 'group',
      visible: measurementEnabled,
      items: [
        {
          name: 'Import from file',
          desc: 'Import a travel pack from a JSON file',
          action: () => {
            const input = createEl('input', { type: 'file' });
            input.accept = '.json';
            input.addEventListener('change', () => {
              const file = input.files?.[0];
              if (!file) return;
              void importTravelPackFile(tab, file);
            });
            input.click();
          }
        },
        {
          name: 'Browse travel packs',
          desc: 'Download ready-made travel rule packs from the content library',
          action: () => {
            new ContentPackBrowserModal(tab.app, tab.plugin, 'travel-pack', () => saveAndRebuild(tab)).open();
          }
        }
      ]
    }
  ];
}

// --- Tile sets ---

function tilesetFolderRow(tab: SettingsTabThis, folderPath: string, index: number): SettingGroupItem {
  return {
    name: `Tile folder ${index + 1}`,
    render: (setting) => {
      let detectTimer: number | undefined;
      setting.addSearch(search => {
        new FolderSuggest(tab.app, search.inputEl);
        search
          .setPlaceholder('Assets/tiles/baumgart')
          .setValue(folderPath)
          .onChange(async (value: string) => {
            const updated = [...(tab.plugin.settings.tilesetFolders ?? [])];
            updated[index] = value.trim();
            tab.plugin.settings.tilesetFolders = updated;
            tab.settingsChanged = true;
            await tab.plugin.saveSettings();
            // Debounced auto-detection once the path settles — the folder
            // set's "import moment" (scanTilesetFolder no-ops on non-folders).
            if (detectTimer != null) window.clearTimeout(detectTimer);
            detectTimer = window.setTimeout(() => {
              void runFolderDetection(tab.app, value);
            }, FOLDER_DETECT_DEBOUNCE_MS);
          });
      });
      // Drop a pending detection if the row is torn down mid-debounce
      return () => {
        if (detectTimer != null) window.clearTimeout(detectTimer);
      };
    }
  };
}

function buildTilesetSections(tab: SettingsTabThis): SettingDefinitionItem[] {
  const tilesEnabled = (): boolean => isFeatureEnabled('tiles');
  const folders = tab.plugin.settings.tilesetFolders ?? [];
  const sections: SettingDefinitionItem[] = [
    {
      type: 'group',
      heading: 'Tile sets',
      visible: tilesEnabled,
      items: [
        infoItem('Configure vault folders containing hex tile images. Each folder becomes a tileset available to all hex maps. Subfolders are used as tile categories. Use the add button to import a .dungeondraft_pack or a folder of images — with tier mapping and tag suggestions.')
      ]
    },
    {
      type: 'list',
      visible: tilesEnabled,
      emptyState: 'No tile folders configured',
      addItem: {
        name: 'Add tiles',
        action: () => {
          const pluginLike = { app: tab.app, settings: tab.plugin.settings, saveSettings: () => tab.plugin.saveSettings() };
          new AddTilesModal(tab.app, pluginLike, () => saveAndRebuild(tab)).open();
        }
      },
      onDelete: (index) => {
        const updated = [...(tab.plugin.settings.tilesetFolders ?? [])];
        updated.splice(index, 1);
        tab.plugin.settings.tilesetFolders = updated;
        saveAndRebuild(tab);
      },
      items: folders.map((path, i) => tilesetFolderRow(tab, path, i))
    }
  ];

  if (folders.length > 0) {
    sections.push({
      type: 'group',
      visible: tilesEnabled,
      items: [{
        name: 'Preview',
        desc: 'Check what tiles would be loaded from configured folders',
        action: () => {
          let totalTiles = 0;
          const results: string[] = [];
          const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
          for (const folder of tab.plugin.settings.tilesetFolders ?? []) {
            if (!folder) continue;
            const normalizedFolder = folder.endsWith('/') ? folder.slice(0, -1) : folder;
            let count = 0;
            for (const file of tab.app.vault.getFiles()) {
              if (!file.path.startsWith(normalizedFolder + '/')) continue;
              const ext = file.extension ? file.extension.toLowerCase() : '';
              if (IMAGE_EXTENSIONS.has(ext)) count++;
            }
            totalTiles += count;
            results.push(folder + ': ' + count + ' tile(s)');
          }
          new Notice(results.join('\n') + '\nTotal: ' + totalTiles + ' tiles');
        }
      }]
    });
  }

  return sections;
}

export { buildColorPaletteSections, buildTravelPackSections, buildTilesetSections, packSummary, packSlug, infoItem, dedupeRowNames, saveAndRebuild };
