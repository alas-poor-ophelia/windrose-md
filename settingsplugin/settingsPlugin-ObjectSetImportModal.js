return `// settingsPlugin-ObjectSetImportModal.js
// Modal for importing an object set from a vault folder
// This file is concatenated into the settings plugin template by the assembler

class ObjectSetImportModal extends Modal {
  constructor(app, plugin, onImport) {
    super(app);
    this.plugin = plugin;
    this.onImport = onImport;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-import-modal');

    contentEl.createEl('h2', { text: 'Import Object Set from Folder' });

    contentEl.createEl('p', {
      text: 'Enter the vault path to a folder containing objects.json.',
      cls: 'setting-item-description'
    });

    let folderPath = '';
    const previewArea = contentEl.createDiv({ cls: 'dmt-import-preview' });
    previewArea.style.display = 'none';

    new Setting(contentEl)
      .setName('Folder Path')
      .setDesc('Vault-relative path (e.g. object-sets/my-set)')
      .addSearch(search => {
        new FolderSuggest(this.app, search.inputEl);
        search
          .setPlaceholder('path/to/set-folder')
          .onChange(v => { folderPath = v.trim(); });
      })
      .addButton(btn => btn
        .setButtonText('Preview')
        .onClick(async () => {
          previewArea.empty();

          if (!folderPath) {
            previewArea.createEl('p', { text: 'Enter a folder path first.', cls: 'dmt-import-error' });
            previewArea.style.display = 'block';
            return;
          }

          const folder = this.app.vault.getAbstractFileByPath(folderPath);
          if (!folder || !folder.children) {
            previewArea.createEl('p', { text: 'Folder not found: ' + folderPath, cls: 'dmt-import-error' });
            previewArea.style.display = 'block';
            return;
          }

          const jsonFile = this.app.vault.getAbstractFileByPath(folderPath + '/objects.json');
          if (!jsonFile) {
            previewArea.createEl('p', { text: 'No objects.json found in this folder.', cls: 'dmt-import-error' });
            previewArea.style.display = 'block';
            return;
          }

          try {
            const content = await this.app.vault.read(jsonFile);
            const data = JSON.parse(content);

            if (!data.windroseMD_objectSet) {
              previewArea.createEl('p', { text: 'Not a valid Windrose object set.', cls: 'dmt-import-error' });
              previewArea.style.display = 'block';
              return;
            }

            previewArea.createEl('p', { text: 'Valid object set: ' + (data.name || 'Unnamed') });

            const scope = [];
            if (data.hex) {
              const objCount = (data.hex.customObjects || []).length;
              const overCount = Object.keys(data.hex.objectOverrides || {}).length;
              scope.push('Hex: ' + objCount + ' custom, ' + overCount + ' overrides');
            }
            if (data.grid) {
              const objCount = (data.grid.customObjects || []).length;
              const overCount = Object.keys(data.grid.objectOverrides || {}).length;
              scope.push('Grid: ' + objCount + ' custom, ' + overCount + ' overrides');
            }
            for (const line of scope) {
              previewArea.createEl('p', { text: line, cls: 'setting-item-description' });
            }

            // Check for duplicate name
            const existing = (this.plugin.settings.objectSets || []).find(s => s.name === data.name);
            if (existing) {
              previewArea.createEl('p', {
                text: 'A set named "' + data.name + '" already exists. It will be imported with a unique name.',
                cls: 'dmt-import-note'
              });
            }

            previewArea.style.display = 'block';
          } catch (err) {
            previewArea.createEl('p', { text: 'Error reading: ' + err.message, cls: 'dmt-import-error' });
            previewArea.style.display = 'block';
          }
        }));

    const buttons = contentEl.createDiv({ cls: 'dmt-modal-buttons' });

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
      } catch (err) {
        new Notice('Import failed: ' + err.message);
      }
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}`;
