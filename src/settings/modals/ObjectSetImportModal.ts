import { Modal, Setting, Notice } from 'obsidian';
import { TFile } from 'obsidian';
import type { App } from 'obsidian';
import type { PluginSettings } from '#types/settings/settings.types';
import { ObjectSetHelpers } from '../helpers/objectSetHelpers';
import { FolderSuggest } from '../helpers/FolderSuggest';

interface WindrosePlugin {
  app: App;
  settings: PluginSettings;
  saveSettings(): Promise<void>;
}

class ObjectSetImportModal extends Modal {
  private plugin: WindrosePlugin;
  private onImport: () => void;

  constructor(app: App, plugin: WindrosePlugin, onImport: () => void) {
    super(app);
    this.plugin = plugin;
    this.onImport = onImport;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('windrose-import-modal');

    contentEl.createEl('h2', { text: 'Import Object Set from Folder' });

    contentEl.createEl('p', {
      text: 'Enter the vault path to a folder containing objects.json.',
      cls: 'setting-item-description'
    });

    let folderPath = '';
    const previewArea = contentEl.createDiv({ cls: 'windrose-import-preview' });
    previewArea.style.display = 'none';

    new Setting(contentEl)
      .setName('Folder Path')
      .setDesc('Vault-relative path (e.g. object-sets/my-set)')
      .addSearch(search => {
        new FolderSuggest(this.app, search.inputEl);
        search
          .setPlaceholder('path/to/set-folder')
          .onChange((v: string) => { folderPath = v.trim(); });
      })
      .addButton(btn => btn
        .setButtonText('Preview')
        .onClick(async () => {
          previewArea.empty();

          if (!folderPath) {
            previewArea.createEl('p', { text: 'Enter a folder path first.', cls: 'windrose-import-error' });
            previewArea.style.display = 'block';
            return;
          }

          const folder = this.app.vault.getAbstractFileByPath(folderPath) as { children?: unknown[] } | null;
          if (!folder || !folder.children) {
            previewArea.createEl('p', { text: 'Folder not found: ' + folderPath, cls: 'windrose-import-error' });
            previewArea.style.display = 'block';
            return;
          }

          const jsonFile = this.app.vault.getAbstractFileByPath(folderPath + '/objects.json');
          if (!(jsonFile instanceof TFile)) {
            previewArea.createEl('p', { text: 'No objects.json found in this folder.', cls: 'windrose-import-error' });
            previewArea.style.display = 'block';
            return;
          }

          try {
            const content = await this.app.vault.read(jsonFile);
            const data = JSON.parse(content) as Record<string, unknown>;

            if (!data.windroseMD_objectSet) {
              previewArea.createEl('p', { text: 'Not a valid Windrose object set.', cls: 'windrose-import-error' });
              previewArea.style.display = 'block';
              return;
            }

            previewArea.createEl('p', { text: 'Valid object set: ' + ((data.name as string) || 'Unnamed') });

            const scope: string[] = [];
            if (data.hex) {
              const hexData = data.hex as Record<string, unknown>;
              const objCount = ((hexData.customObjects as unknown[]) || []).length;
              const overCount = Object.keys((hexData.objectOverrides as Record<string, unknown>) || {}).length;
              scope.push('Hex: ' + objCount + ' custom, ' + overCount + ' overrides');
            }
            if (data.grid) {
              const gridData = data.grid as Record<string, unknown>;
              const objCount = ((gridData.customObjects as unknown[]) || []).length;
              const overCount = Object.keys((gridData.objectOverrides as Record<string, unknown>) || {}).length;
              scope.push('Grid: ' + objCount + ' custom, ' + overCount + ' overrides');
            }
            for (const line of scope) {
              previewArea.createEl('p', { text: line, cls: 'setting-item-description' });
            }

            // Check for duplicate name
            const existing = (this.plugin.settings.objectSets || []).find(s => s.name === data.name);
            if (existing) {
              previewArea.createEl('p', {
                text: 'A set named "' + (data.name as string) + '" already exists. It will be imported with a unique name.',
                cls: 'windrose-import-note'
              });
            }

            previewArea.style.display = 'block';
          } catch (err: unknown) {
            previewArea.createEl('p', { text: 'Error reading: ' + (err as Error).message, cls: 'windrose-import-error' });
            previewArea.style.display = 'block';
          }
        }));

    const buttons = contentEl.createDiv({ cls: 'windrose-modal-buttons' });

    const cancelBtn = buttons.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();

    const importBtn = buttons.createEl('button', { text: 'Import', cls: 'mod-cta' });
    importBtn.onclick = async () => {
      if (!folderPath) {
        new Notice('Enter a folder path first');
        return;
      }

      try {
        const set = await ObjectSetHelpers.importSetFromFolder(this.plugin, folderPath);
        await this.plugin.saveSettings();
        new Notice('Imported set: ' + set.name);
        this.onImport();
        this.close();
      } catch (err: unknown) {
        new Notice('Import failed: ' + (err as Error).message);
      }
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}

export { ObjectSetImportModal };
