import type { App } from 'obsidian';
import { Modal, Setting } from 'obsidian';
import type { MapType } from '#types/index';
import { isFeatureEnabled } from '../../core/featureFlags';

class NewMapModal extends Modal {
  private mapName = '';
  private mapType: MapType | null = null;
  private onCreate: (mapId: string, mapName: string, mapType: MapType) => void;

  constructor(app: App, onCreate: (mapId: string, mapName: string, mapType: MapType) => void) {
    super(app);
    this.onCreate = onCreate;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('windrose-insert-map-modal');

    contentEl.createEl('h2', { text: 'New map' });

    new Setting(contentEl)
      .setName('Map name')
      .setDesc('A display name for this map (can be left blank)')
      .addText(text => {
        text
          .setPlaceholder('E.g., goblin cave level 1')
          .onChange(value => { this.mapName = value; });
        window.setTimeout(() => text.inputEl.focus(), 10);
      });

    const typeContainer = contentEl.createDiv({ cls: 'windrose-map-type-selection' });
    typeContainer.createDiv({ text: 'Map type', cls: 'setting-item-name' });
    typeContainer.createDiv({
      text: 'Choose the grid style for this map',
      cls: 'setting-item-description'
    });

    const buttonRow = typeContainer.createDiv({ cls: 'windrose-map-type-buttons' });

    const gridBtn = buttonRow.createEl('button', {
      text: 'Grid',
      cls: 'windrose-map-type-btn',
      attr: { type: 'button' }
    });

    // Feature gate: hex map CREATION hides when disabled. With only grid
    // left, preselect it.
    const hexEnabled = isFeatureEnabled('hexMaps');
    const hexBtn = hexEnabled ? buttonRow.createEl('button', {
      text: 'Hex',
      cls: 'windrose-map-type-btn',
      attr: { type: 'button' }
    }) : null;

    gridBtn.onclick = () => {
      this.mapType = 'grid';
      gridBtn.addClass('selected');
      hexBtn?.removeClass('selected');
    };

    if (hexBtn != null) {
      hexBtn.onclick = () => {
        this.mapType = 'hex';
        hexBtn.addClass('selected');
        gridBtn.removeClass('selected');
      };
    } else {
      this.mapType = 'grid';
      gridBtn.addClass('selected');
    }

    const buttonContainer = contentEl.createDiv({ cls: 'windrose-modal-buttons' });

    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();

    const createBtn = buttonContainer.createEl('button', { text: 'Create', cls: 'mod-cta' });
    createBtn.onclick = () => this.submit();

    contentEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && this.mapType) {
        e.preventDefault();
        this.submit();
      }
    });
  }

  private submit(): void {
    if (!this.mapType) return;
    const mapId = 'map-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11);
    this.onCreate(mapId, this.mapName, this.mapType);
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export { NewMapModal };
