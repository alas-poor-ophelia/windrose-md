import type { App } from 'obsidian';
import { Modal, Setting, Notice } from 'obsidian';
import type { PluginSettings, CustomObject, CustomCategory, ObjectOverride } from '#types/settings/settings.types';

interface WindrosePlugin {
  settings: PluginSettings;
  saveSettings(): Promise<void>;
}

type OverridesKey = 'hexObjectOverrides' | 'gridObjectOverrides';
type CustomObjectsKey = 'customHexObjects' | 'customGridObjects';
type CategoriesKey = 'customHexCategories' | 'customGridCategories';

interface ObjectExportData {
  windroseMD_objectExport?: boolean;
  exportedAt?: string;
  mapType?: string;
  objectOverrides?: Record<string, unknown>;
  customObjects?: unknown[];
  customCategories?: unknown[];
}

class ImportModal extends Modal {
  private plugin: WindrosePlugin;
  private onImport: () => void;
  private mapType: string;
  private importData: ObjectExportData | null;

  constructor(app: App, plugin: WindrosePlugin, onImport: () => void, mapType: string = 'grid') {
    super(app);
    this.plugin = plugin;
    this.onImport = onImport;
    this.mapType = mapType;
    this.importData = null;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('windrose-import-modal');

    const mapTypeLabel = this.mapType === 'hex' ? 'Hex' : 'Grid';
    contentEl.createEl('h2', { text: `Import ${mapTypeLabel} Object Customizations` });

    contentEl.createEl('p', {
      text: `Select a Windrose MD object export file (.json) to import into ${mapTypeLabel} maps.`,
      cls: 'setting-item-description'
    });

    // File picker
    const fileContainer = contentEl.createDiv({ cls: 'windrose-import-file-container' });
    const fileInput = fileContainer.createEl('input', {
      type: 'file',
      attr: { accept: '.json' }
    });

    // Preview area (hidden until file selected)
    const previewArea = contentEl.createDiv({ cls: 'windrose-import-preview' });
    previewArea.hide();

    // Import options (hidden until file validated)
    const optionsArea = contentEl.createDiv({ cls: 'windrose-import-options' });
    optionsArea.hide();

    let mergeMode = 'merge'; // 'merge' or 'replace'

    fileInput.addEventListener('change', (e: Event) => { void (async () => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text) as ObjectExportData;

        // Validate it's a Windrose export
        if (data.windroseMD_objectExport !== true) {
          previewArea.empty();
          previewArea.createEl('p', {
            text: 'This file is not a valid Windrose MD object export.',
            cls: 'windrose-import-error'
          });
          previewArea.show();
          optionsArea.hide();
          this.importData = null;
          return;
        }

        this.importData = data;

        // Show preview
        previewArea.empty();
        previewArea.createEl('p', { text: 'Valid Windrose MD export file' });
        if (data.exportedAt != null && data.exportedAt !== '') {
          previewArea.createEl('p', {
            text: `Exported: ${new Date(data.exportedAt).toLocaleString()}`,
            cls: 'windrose-import-date'
          });
        }

        // Show original map type if present
        if (data.mapType != null && data.mapType !== '') {
          const sourceType = data.mapType === 'hex' ? 'Hex' : 'Grid';
          if (data.mapType !== this.mapType) {
            previewArea.createEl('p', {
              text: `Note: This was exported from ${sourceType} maps but will be imported to ${mapTypeLabel} maps.`,
              cls: 'windrose-import-note'
            });
          }
        }

        const overrideCount = data.objectOverrides != null ? Object.keys(data.objectOverrides).length : 0;
        const customObjCount = data.customObjects?.length ?? 0;
        const customCatCount = data.customCategories?.length ?? 0;

        if (overrideCount > 0) {
          previewArea.createEl('p', { text: `• ${overrideCount} built-in modification(s)` });
        }
        if (customObjCount > 0) {
          previewArea.createEl('p', { text: `• ${customObjCount} custom object(s)` });
        }
        if (customCatCount > 0) {
          previewArea.createEl('p', { text: `• ${customCatCount} custom category(ies)` });
        }

        previewArea.show();

        // Show import options
        optionsArea.empty();
        new Setting(optionsArea)
          .setName('Import mode')
          .setDesc('How to handle existing customizations')
          .addDropdown(dropdown => dropdown
            .addOption('merge', 'Merge (keep existing, add new)')
            .addOption('replace', 'Replace (remove existing first)')
            .setValue(mergeMode)
            .onChange((v: string) => { mergeMode = v; }));

        optionsArea.show();

      } catch (err: unknown) {
        previewArea.empty();
        previewArea.createEl('p', {
          text: `Error reading file: ${(err as Error).message}`,
          cls: 'windrose-import-error'
        });
        previewArea.show();
        optionsArea.hide();
        this.importData = null;
      }
    })(); });

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: 'windrose-modal-buttons' });

    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();

    const importBtn = buttonContainer.createEl('button', { text: 'Import', cls: 'mod-cta' });
    importBtn.onclick = async () => {
      if (!this.importData) {
        new Notice('Please select a valid export file first.');
        return;
      }

      // Get the correct settings keys for this map type
      const overridesKey: OverridesKey = this.mapType === 'hex' ? 'hexObjectOverrides' : 'gridObjectOverrides';
      const customObjectsKey: CustomObjectsKey = this.mapType === 'hex' ? 'customHexObjects' : 'customGridObjects';
      const categoriesKey: CategoriesKey = this.mapType === 'hex' ? 'customHexCategories' : 'customGridCategories';

      const data = this.importData;

      if (mergeMode === 'replace') {
        // Clear existing for this map type
        this.plugin.settings[overridesKey] = {};
        this.plugin.settings[customObjectsKey] = [];
        this.plugin.settings[categoriesKey] = [];
      }

      // Import overrides
      if (data.objectOverrides != null) {
        this.plugin.settings[overridesKey] ??= {};
        Object.assign(
          this.plugin.settings[overridesKey] as Record<string, ObjectOverride>,
          data.objectOverrides
        );
      }

      // Import custom objects (avoid duplicates by ID)
      if (data.customObjects != null) {
        this.plugin.settings[customObjectsKey] ??= [];
        const customObjects = this.plugin.settings[customObjectsKey] as CustomObject[];
        for (const obj of data.customObjects as CustomObject[]) {
          const existingIdx = customObjects.findIndex((o: CustomObject) => o.id === obj.id);
          if (existingIdx !== -1) {
            customObjects[existingIdx] = obj;
          } else {
            customObjects.push(obj);
          }
        }
      }

      // Import custom categories (avoid duplicates by ID)
      if (data.customCategories != null) {
        this.plugin.settings[categoriesKey] ??= [];
        const customCategories = this.plugin.settings[categoriesKey] as CustomCategory[];
        for (const cat of data.customCategories as CustomCategory[]) {
          const existingIdx = customCategories.findIndex((c: CustomCategory) => c.id === cat.id);
          if (existingIdx !== -1) {
            customCategories[existingIdx] = cat;
          } else {
            customCategories.push(cat);
          }
        }
      }

      await this.plugin.saveSettings();
      this.onImport();
      this.close();
    };
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export { ImportModal };
