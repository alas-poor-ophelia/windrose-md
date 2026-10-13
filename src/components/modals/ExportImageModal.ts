/**
 * ExportImageModal.ts
 *
 * Native Obsidian modal collecting the options for a map image export:
 * which map layers are composited (and at what opacity), plus which content
 * categories the canvas renderer draws. Resolves with the chosen options, or
 * null when cancelled.
 *
 * Not to be confused with settings/modals/ExportModal.ts, which exports object
 * customizations as JSON.
 */

import type { App } from 'obsidian';
import { Modal, Setting } from 'obsidian';
import type { MapData, LayerId } from '#types/core/map.types';
import type { LayerVisibility } from '#types/contexts/context.types';
import type { ExportImageOptions } from '#types/core/export.types';
import { getLayersOrdered, getDefaultExportLayers } from '../../persistence/layerAccessor';

interface ExportImageModalConfig {
  mapData: MapData;
  /** Current live content visibility; seeds the content toggles */
  visibility: LayerVisibility;
}

/** Content categories the export renderer honours, in display order */
const CONTENT_TOGGLES: { key: keyof LayerVisibility; name: string; desc: string; hexOnly: boolean }[] = [
  { key: 'grid', name: 'Grid', desc: 'Draw the grid lines behind the map', hexOnly: false },
  { key: 'objects', name: 'Objects', desc: 'Include placed objects', hexOnly: false },
  { key: 'textLabels', name: 'Text labels', desc: 'Include text labels', hexOnly: false },
  { key: 'regions', name: 'Regions', desc: 'Include named region fills', hexOnly: true },
  { key: 'outlines', name: 'Outlines', desc: 'Include hex outlines', hexOnly: true }
];

class ExportImageModal extends Modal {
  private mapData: MapData;
  private visibility: LayerVisibility;
  private included: Set<LayerId>;
  private opacities: Map<LayerId, number>;
  private resolved: boolean;
  private resolvePromise!: (value: ExportImageOptions | null) => void;
  private exportButton: HTMLButtonElement | null = null;

  constructor(app: App, config: ExportImageModalConfig) {
    super(app);
    this.mapData = config.mapData;
    this.visibility = { ...config.visibility };
    this.included = new Set(getDefaultExportLayers(config.mapData).map(layer => layer.id));
    this.opacities = new Map(getLayersOrdered(config.mapData).map(layer => [layer.id, 1]));
    this.resolved = false;
  }

  private updateExportButton(): void {
    if (this.exportButton == null) return;
    this.exportButton.disabled = this.included.size === 0;
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h3', { text: 'Export as image' });

    const isHex = this.mapData.mapType === 'hex';

    new Setting(contentEl).setName('Content').setHeading();

    for (const toggleDef of CONTENT_TOGGLES) {
      if (toggleDef.hexOnly && !isHex) continue;
      new Setting(contentEl)
        .setName(toggleDef.name)
        .setDesc(toggleDef.desc)
        .addToggle(toggle => {
          toggle.setValue(this.visibility[toggleDef.key] !== false);
          toggle.onChange(value => { this.visibility[toggleDef.key] = value; });
        });
    }

    new Setting(contentEl).setName('Layers').setHeading();

    // Top-most layer first, matching the layer panels.
    const layers = [...getLayersOrdered(this.mapData)].reverse();
    for (const layer of layers) {
      new Setting(contentEl)
        .setName(layer.name)
        .setDesc('Include this layer, and the opacity it is drawn at')
        .addSlider(slider => {
          slider.setLimits(10, 100, 5);
          slider.setValue(Math.round((this.opacities.get(layer.id) ?? 1) * 100));
          slider.setDynamicTooltip();
          slider.onChange(value => { this.opacities.set(layer.id, value / 100); });
        })
        .addToggle(toggle => {
          toggle.setValue(this.included.has(layer.id));
          toggle.onChange(value => {
            if (value) {
              this.included.add(layer.id);
            } else {
              this.included.delete(layer.id);
            }
            this.updateExportButton();
          });
        });
    }

    const buttons = contentEl.createDiv({ cls: 'windrose-modal-buttons' });

    const cancelBtn = buttons.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = (): void => {
      this.resolved = true;
      this.resolvePromise(null);
      this.close();
    };

    const exportBtn = buttons.createEl('button', { text: 'Export', cls: 'mod-cta' });
    exportBtn.onclick = (): void => {
      this.resolved = true;
      this.resolvePromise(this.buildOptions());
      this.close();
    };
    this.exportButton = exportBtn;
    this.updateExportButton();
  }

  private buildOptions(): ExportImageOptions {
    return {
      layers: [...this.included].map(id => ({ id, opacity: this.opacities.get(id) ?? 1 })),
      visibility: { ...this.visibility }
    };
  }

  override onClose(): void {
    this.contentEl.empty();
    this.exportButton = null;
    if (!this.resolved && this.resolvePromise != null) {
      this.resolvePromise(null);
    }
  }

  openAndGetValue(): Promise<ExportImageOptions | null> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }
}

export { ExportImageModal };
