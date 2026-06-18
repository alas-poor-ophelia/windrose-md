import type { App} from 'obsidian';
import { Modal, Setting, Notice } from 'obsidian';
import type { PluginSettings, CustomCategory } from '#types/settings/settings.types';

interface WindrosePlugin {
  settings: PluginSettings;
  saveSettings(): Promise<void>;
}

type CategoriesKey = 'customHexCategories' | 'customGridCategories';

class CategoryEditModal extends Modal {
  private plugin: WindrosePlugin;
  private existingCategory: CustomCategory | null;
  private onSave: () => void;
  private mapType: string;
  private label: string;
  private order: number;

  constructor(app: App, plugin: WindrosePlugin, existingCategory: CustomCategory | null, onSave: () => void, mapType: string = 'grid') {
    super(app);
    this.plugin = plugin;
    this.existingCategory = existingCategory;
    this.onSave = onSave;
    this.mapType = mapType;

    this.label = existingCategory?.label || '';
    this.order = existingCategory?.order ?? 100;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('windrose-category-edit-modal');

    const isEditing = !!this.existingCategory;

    contentEl.createEl('h2', { text: isEditing ? 'Edit Category' : 'Create Custom Category' });

    let nameInputEl: HTMLInputElement | null = null;
    new Setting(contentEl)
      .setName('Name')
      .setDesc('Display name for this category')
      .addText(text => {
        nameInputEl = text.inputEl;
        text.setValue(this.label)
          .setPlaceholder('E.g., alchemy')
          .onChange((value: string) => {
            this.label = value;
          });
      });

    // Focus the name input after a short delay
    if (nameInputEl) {
      window.setTimeout(() => (nameInputEl as HTMLInputElement).focus(), 50);
    }

    new Setting(contentEl)
      .setName('Sort order')
      .setDesc('Lower numbers appear first (built-ins use 0-50)')
      .addText(text => text
        .setValue(String(this.order))
        .setPlaceholder('100')
        .onChange((value: string) => {
          const num = parseInt(value, 10);
          if (!isNaN(num)) {
            this.order = num;
          }
        }));

    const buttonContainer = contentEl.createDiv({ cls: 'windrose-modal-buttons' });

    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();

    const saveBtn = buttonContainer.createEl('button', { text: 'Save', cls: 'mod-cta' });
    saveBtn.onclick = () => this.save();
  }

  save() {
    if (!this.label || this.label.trim().length === 0) {
      new Notice('Please enter a category name');
      return;
    }

    // Get the correct settings key for this map type
    const categoriesKey: CategoriesKey = this.mapType === 'hex' ? 'customHexCategories' : 'customGridCategories';

    if (!this.plugin.settings[categoriesKey]) {
      this.plugin.settings[categoriesKey] = [];
    }

    const categories = this.plugin.settings[categoriesKey];

    if (this.existingCategory) {
      const idx = categories.findIndex((c: CustomCategory) => c.id === this.existingCategory!.id);
      if (idx !== -1) {
        categories[idx] = {
          ...categories[idx],
          label: this.label.trim(),
          order: this.order
        };
      }
    } else {
      const newCategory: CustomCategory = {
        id: 'custom-cat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11),
        label: this.label.trim(),
        order: this.order
      };

      categories.push(newCategory);
    }

    this.onSave();
    this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}

export { CategoryEditModal };
