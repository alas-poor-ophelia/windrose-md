return `// settingsPlugin-ObjectSetExportModal.js
// Modal for exporting an object set to a vault folder
// This file is concatenated into the settings plugin template by the assembler

class ObjectSetExportModal extends Modal {
  constructor(app, plugin, set) {
    super(app);
    this.plugin = plugin;
    this.set = set;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-export-modal');

    contentEl.createEl('h2', { text: 'Export Object Set' });

    const set = this.set;
    let exportName = set.name;
    let includeHex = !!set.data.hex;
    let includeGrid = !!set.data.grid;

    new Setting(contentEl)
      .setName('Set Name')
      .setDesc('Name used for the export folder')
      .addText(text => text
        .setValue(exportName)
        .onChange(v => { exportName = v; }));

    if (set.data.hex) {
      new Setting(contentEl)
        .setName('Include hex objects')
        .addToggle(toggle => toggle
          .setValue(includeHex)
          .onChange(v => { includeHex = v; }));
    }

    if (set.data.grid) {
      new Setting(contentEl)
        .setName('Include grid objects')
        .addToggle(toggle => toggle
          .setValue(includeGrid)
          .onChange(v => { includeGrid = v; }));
    }

    const imagePaths = ObjectSetHelpers.getImagePaths(set.data);
    if (imagePaths.length > 0) {
      contentEl.createEl('p', {
        text: imagePaths.length + ' image(s) will be bundled into the export.',
        cls: 'setting-item-description'
      });
    }

    // Destination info
    const destFolder = this.plugin.settings.objectSetsAutoLoadFolder || '';
    const destDesc = destFolder
      ? 'Will export to: ' + destFolder + '/' + (exportName || set.name).replace(/[\\\\\\\\/:*?"<>|]/g, '_')
      : 'Will export to: object-sets/' + (exportName || set.name).replace(/[\\\\\\\\/:*?"<>|]/g, '_');

    contentEl.createEl('p', {
      text: destDesc,
      cls: 'setting-item-description'
    });

    const buttons = contentEl.createDiv({ cls: 'dmt-modal-buttons' });

    const cancelBtn = buttons.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();

    const exportBtn = buttons.createEl('button', { text: 'Export', cls: 'mod-cta' });
    exportBtn.onclick = async () => {
      if (!includeHex && !includeGrid) {
        new Notice('Select at least one map type to export');
        return;
      }

      try {
        const destPath = await ObjectSetHelpers.exportSetToFolder(
          this.plugin, set.id, destFolder || null,
          { name: exportName, includeHex, includeGrid }
        );
        new Notice('Exported to: ' + destPath);
        this.close();
      } catch (err) {
        new Notice('Export failed: ' + err.message);
      }
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}`;
