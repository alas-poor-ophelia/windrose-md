/**
 * TabRenderTravelPacks.ts
 *
 * WindroseMDSettingsTab render methods — travel pack management.
 * Packs are rule bundles (custom units, terrains, travel modes, per-day
 * allowances); this section lists them with per-pack enable/disable and
 * offers create, edit, export-to-file, import-from-file, and delete.
 * Only enabled packs surface in map UI.
 */

import type { SettingsTabThis } from './settingsTabContext';
import { Notice, Setting } from 'obsidian';
import { ContentPackBrowserModal } from '../../content-packs/ContentPackBrowserModal';
import { ConfirmModal } from '../modals/ConfirmModal';
import { TravelPackEditModal } from '../modals/TravelPackEditModal';
import {
  createTravelPack,
  removeTravelPack,
  serializeTravelPack,
  setTravelPackEnabled,
  upsertTravelPack,
  validateTravelPackImport,
} from '../../travel/travelPackOperations';
import { packSummary, packSlug } from '../settingDefinitionLists';

export const TabRenderTravelPacksMethods = {
  renderTravelPacksContent(this: SettingsTabThis, containerEl: HTMLElement): void {
    const packs = this.plugin.settings.travelPacks ?? [];

    containerEl.createEl('p', {
      text: 'Travel packs bundle the travel rules of a game system — custom units, terrain speed multipliers, travel modes, and per-day allowances. Enabled packs power travel times in the measure tool and the beacon.',
      cls: 'setting-item-description'
    });

    for (const pack of packs) {
      new Setting(containerEl)
        .setName(pack.name)
        .setDesc(packSummary(pack))
        .addToggle(toggle => {
          toggle.setTooltip(pack.enabled ? 'Enabled — shown in map UI' : 'Disabled — hidden from map UI');
          toggle.setValue(pack.enabled);
          toggle.onChange(async (enabled) => {
            this.plugin.settings.travelPacks = setTravelPackEnabled(this.plugin.settings.travelPacks ?? [], pack.id, enabled);
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          });
        })
        .addExtraButton(btn => btn
          .setIcon('pencil')
          .setTooltip('Edit pack')
          .onClick(() => {
            new TravelPackEditModal(this.app, this.plugin, pack.id, () => {
              this.settingsChanged = true;
            }).open();
          }))
        .addExtraButton(btn => btn
          .setIcon('download')
          .setTooltip('Export to file')
          .onClick(async () => {
            const current = (this.plugin.settings.travelPacks ?? []).find(p => p.id === pack.id);
            if (!current) return;
            const base = `windrose-travel-pack-${packSlug(current.name)}`;
            let filename = `${base}.json`;
            if (this.app.vault.getAbstractFileByPath(filename) != null) {
              filename = `${base}-${Date.now()}.json`;
            }
            try {
              await this.app.vault.create(filename, serializeTravelPack(current));
              new Notice(`Exported to ${filename} in the vault root`);
            } catch (e) {
              console.error('[Windrose] Travel pack export failed:', e);
              new Notice('Export failed — see console for details');
            }
          }))
        .addExtraButton(btn => btn
          .setIcon('trash-2')
          .setTooltip('Delete pack')
          .onClick(async () => {
            const confirmed = await new ConfirmModal(this.app, {
              message: `Delete travel pack "${pack.name}"?\nMaps referencing it fall back to plain distance display.`,
              confirmText: 'Delete pack',
              isDestructive: true
            }).openAndGetValue();
            if (!confirmed) return;
            this.plugin.settings.travelPacks = removeTravelPack(this.plugin.settings.travelPacks ?? [], pack.id);
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }));
    }

    new Setting(containerEl)
      .setName(packs.length === 0 ? 'No travel packs yet' : 'Manage packs')
      .addButton(btn => btn
        .setButtonText('New travel pack')
        .setCta()
        .onClick(async () => {
          const pack = createTravelPack('New travel pack');
          this.plugin.settings.travelPacks = upsertTravelPack(this.plugin.settings.travelPacks ?? [], pack);
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
          new TravelPackEditModal(this.app, this.plugin, pack.id, () => {
            this.settingsChanged = true;
          }).open();
        }))
      .addButton(btn => btn
        .setButtonText('Import from file')
        .onClick(() => {
          const input = createEl('input', { type: 'file' });
          input.accept = '.json';
          input.addEventListener('change', () => {
            const file = input.files?.[0];
            if (!file) return;
            void this.importTravelPackFile(file);
          });
          input.click();
        }));

    // Browse Content Packs (travel tab)
    new Setting(containerEl)
      .setName('Browse travel packs')
      .setDesc('Download ready-made travel rule packs from the content library')
      .addButton(btn => btn
        .setButtonText('Browse')
        .onClick(() => {
          new ContentPackBrowserModal(this.app, this.plugin, 'travel-pack', () => {
            this.settingsChanged = true;
            this.display();
          }).open();
        }));
  },

  async importTravelPackFile(this: SettingsTabThis, file: File): Promise<void> {
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

    const existing = (this.plugin.settings.travelPacks ?? []).find(p => p.id === result.pack?.id);
    if (existing != null) {
      const confirmed = await new ConfirmModal(this.app, {
        message: `A travel pack with this id already exists ("${existing.name}"). Replace it with "${result.pack.name}"?`,
        confirmText: 'Replace pack'
      }).openAndGetValue();
      if (!confirmed) return;
    }

    this.plugin.settings.travelPacks = upsertTravelPack(this.plugin.settings.travelPacks ?? [], result.pack);
    this.settingsChanged = true;
    await this.plugin.saveSettings();
    this.display();
    new Notice(`Imported travel pack "${result.pack.name}"`);
  }
};
