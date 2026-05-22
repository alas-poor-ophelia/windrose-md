import { App, Modal, Setting } from 'obsidian';
import type { MapType } from '#types/index';

export class InsertMapModal extends Modal {
  private mapName = '';
  private mapType: MapType | null = null;
  private onInsert: (mapName: string, mapType: MapType) => void;

  constructor(app: App, onInsert: (mapName: string, mapType: MapType) => void) {
    super(app);
    this.onInsert = onInsert;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-insert-map-modal');

    contentEl.createEl('h2', { text: 'Insert new map' });

    new Setting(contentEl)
      .setName('Map name')
      .setDesc('A display name for this map (can be left blank)')
      .addText(text => {
        text
          .setPlaceholder('E.g., goblin cave level 1')
          .onChange(value => { this.mapName = value; });
        setTimeout(() => text.inputEl.focus(), 10);
      });

    const typeContainer = contentEl.createDiv({ cls: 'dmt-map-type-selection' });
    typeContainer.createEl('div', { text: 'Map type', cls: 'setting-item-name' });
    typeContainer.createEl('div', {
      text: 'Choose the grid style for this map',
      cls: 'setting-item-description'
    });

    const buttonRow = typeContainer.createDiv({ cls: 'dmt-map-type-buttons' });

    const gridBtn = buttonRow.createEl('button', {
      text: 'Grid',
      cls: 'dmt-map-type-btn',
      attr: { type: 'button' }
    });

    const hexBtn = buttonRow.createEl('button', {
      text: 'Hex',
      cls: 'dmt-map-type-btn',
      attr: { type: 'button' }
    });

    gridBtn.onclick = () => {
      this.mapType = 'grid';
      gridBtn.addClass('selected');
      hexBtn.removeClass('selected');
    };

    hexBtn.onclick = () => {
      this.mapType = 'hex';
      hexBtn.addClass('selected');
      gridBtn.removeClass('selected');
    };

    const buttonContainer = contentEl.createDiv({ cls: 'dmt-modal-buttons' });

    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();

    const insertBtn = buttonContainer.createEl('button', { text: 'Insert', cls: 'mod-cta' });
    insertBtn.onclick = () => this.submit();

    contentEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && this.mapType) {
        e.preventDefault();
        this.submit();
      }
    });
  }

  private submit() {
    if (!this.mapType) return;
    this.onInsert(this.mapName, this.mapType);
    this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}
