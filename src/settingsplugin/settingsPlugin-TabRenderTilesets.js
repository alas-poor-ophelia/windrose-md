return `// settingsPlugin-TabRenderTilesets.js
// WindroseMDSettingsTab render methods - Tileset configuration
// This file is concatenated into the settings plugin template by the assembler

const TabRenderTilesetsMethods = {
  renderTilesetFoldersContent(containerEl) {
    const s = this.plugin.settings;
    const folders = s.tilesetFolders || [];

    containerEl.createEl('p', {
      text: 'Configure vault folders containing hex tile images. Each folder becomes a tileset available to all hex maps. Subfolders are used as tile categories.',
      cls: 'setting-item-description'
    });

    // List existing folders
    for (let i = 0; i < folders.length; i++) {
      const folderPath = folders[i];
      new Setting(containerEl)
        .setName('Tile Folder ' + (i + 1))
        .addSearch(search => {
          new FolderSuggest(this.app, search.inputEl);
          search
            .setPlaceholder('e.g. Assets/Tiles/Baumgart')
            .setValue(folderPath)
            .onChange(async (value) => {
              const updated = [...(s.tilesetFolders || [])];
              updated[i] = value.trim();
              s.tilesetFolders = updated;
              this.settingsChanged = true;
              await this.plugin.saveSettings();
            });
        })
        .addExtraButton(btn => btn
          .setIcon('trash-2')
          .setTooltip('Remove folder')
          .onClick(async () => {
            const updated = [...(s.tilesetFolders || [])];
            updated.splice(i, 1);
            s.tilesetFolders = updated;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }));
    }

    // Add folder button
    new Setting(containerEl)
      .setName('Add Tile Folder')
      .setDesc('Add a vault folder to scan for tile images')
      .addButton(btn => btn
        .setButtonText('Add Folder')
        .onClick(async () => {
          const updated = [...(s.tilesetFolders || []), ''];
          s.tilesetFolders = updated;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));

    // Scan preview
    if (folders.length > 0) {
      new Setting(containerEl)
        .setName('Preview')
        .setDesc('Check what tiles would be loaded from configured folders')
        .addButton(btn => btn
          .setButtonText('Scan Folders')
          .onClick(() => {
            let totalTiles = 0;
            const results = [];
            for (const folder of folders) {
              if (!folder) continue;
              const allFiles = this.app.vault.getFiles();
              const normalizedFolder = folder.endsWith('/') ? folder.slice(0, -1) : folder;
              const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
              let count = 0;
              for (const file of allFiles) {
                if (!file.path.startsWith(normalizedFolder + '/')) continue;
                const ext = file.extension ? file.extension.toLowerCase() : '';
                if (IMAGE_EXTENSIONS.has(ext)) count++;
              }
              totalTiles += count;
              results.push(folder + ': ' + count + ' tile(s)');
            }
            new Notice(results.join('\\n') + '\\nTotal: ' + totalTiles + ' tiles');
          }));
    }
  }
};`;
