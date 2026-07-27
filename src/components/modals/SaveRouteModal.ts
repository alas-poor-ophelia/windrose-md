/**
 * SaveRouteModal.ts
 *
 * Native Obsidian modal for converting a measured route into a permanent
 * saved route. Collects the route's style (name, color, width, distance
 * label visibility) and resolves with the chosen options, or null when
 * cancelled.
 */

import type { App } from 'obsidian';
import { Modal, Setting } from 'obsidian';
import { SAVED_ROUTE_DEFAULTS } from '../../drawing/routeOperations';

interface SaveRouteOptions {
  name: string;
  color: string;
  width: number;
  showLabel: boolean;
}

interface SaveRouteModalConfig {
  /** Initial color (defaults to the saved-route default) */
  initialColor?: string;
  /** Prefill all fields (edit mode) — takes precedence over initialColor */
  initial?: Partial<SaveRouteOptions>;
  /** Modal heading (defaults to "Save as route") */
  title?: string;
  /** Submit button text (defaults to "Save route") */
  submitText?: string;
}

class SaveRouteModal extends Modal {
  private result: SaveRouteOptions;
  private resolved: boolean;
  private resolvePromise!: (value: SaveRouteOptions | null) => void;

  private title: string;
  private submitText: string;

  constructor(app: App, config: SaveRouteModalConfig = {}) {
    super(app);
    this.result = {
      name: config.initial?.name ?? '',
      color: config.initial?.color ?? config.initialColor ?? SAVED_ROUTE_DEFAULTS.color,
      width: config.initial?.width ?? SAVED_ROUTE_DEFAULTS.width,
      showLabel: config.initial?.showLabel ?? SAVED_ROUTE_DEFAULTS.showLabel,
    };
    this.title = config.title ?? 'Save as route';
    this.submitText = config.submitText ?? 'Save route';
    this.resolved = false;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h3', { text: this.title });

    new Setting(contentEl)
      .setName('Name')
      .setDesc('Optional label for the route')
      .addText(text => {
        text.setPlaceholder('Route name');
        text.setValue(this.result.name);
        text.onChange(value => { this.result.name = value; });
      });

    new Setting(contentEl)
      .setName('Color')
      .addColorPicker(picker => {
        picker.setValue(this.result.color);
        picker.onChange(value => { this.result.color = value; });
      });

    new Setting(contentEl)
      .setName('Line width')
      .addSlider(slider => {
        slider.setLimits(1, 10, 1);
        slider.setValue(this.result.width);
        slider.setDynamicTooltip();
        slider.onChange(value => { this.result.width = value; });
      });

    new Setting(contentEl)
      .setName('Show distance label')
      .setDesc('Display the route’s total distance on the map')
      .addToggle(toggle => {
        toggle.setValue(this.result.showLabel);
        toggle.onChange(value => { this.result.showLabel = value; });
      });

    const buttons = contentEl.createDiv({ cls: 'windrose-modal-buttons' });

    const cancelBtn = buttons.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = (): void => {
      this.resolved = true;
      this.resolvePromise(null);
      this.close();
    };

    const saveBtn = buttons.createEl('button', { text: this.submitText, cls: 'mod-cta' });
    saveBtn.onclick = (): void => {
      this.resolved = true;
      this.resolvePromise({ ...this.result });
      this.close();
    };
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.resolved && this.resolvePromise != null) {
      this.resolvePromise(null);
    }
  }

  openAndGetValue(): Promise<SaveRouteOptions | null> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }
}

export { SaveRouteModal };
export type { SaveRouteOptions };
