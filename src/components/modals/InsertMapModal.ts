import type { App } from 'obsidian';
import { Modal, Setting } from 'obsidian';
import type { MapType } from '#types/index';
import { listMaps } from '../../persistence/fileOperations';
import type { MapListEntry } from '../../persistence/fileOperations';

export class InsertMapModal extends Modal {
  private mapName = '';
  private mapType: MapType | null = null;
  private onInsert: (mapId: string, mapName: string, mapType: MapType) => void;

  constructor(app: App, onInsert: (mapId: string, mapName: string, mapType: MapType) => void) {
    super(app);
    this.onInsert = onInsert;
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('windrose-insert-map-modal');

    contentEl.createEl('h2', { text: 'Insert map' });

    const maps = await listMaps(this.app);
    if (maps.length > 0) {
      this.renderExistingMaps(contentEl, maps);
    }

    this.renderNewMapSection(contentEl, maps.length > 0);

    contentEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && this.mapType) {
        e.preventDefault();
        this.submitNew();
      }
    });
  }

  private renderExistingMaps(contentEl: HTMLElement, maps: MapListEntry[]): void {
    const section = contentEl.createDiv({ cls: 'windrose-insert-section' });
    section.createEl('div', { text: 'Existing maps', cls: 'windrose-insert-section-title' });

    const list = section.createDiv({ cls: 'windrose-insert-map-list' });
    for (const entry of maps) {
      const row = list.createDiv({ cls: 'windrose-insert-map-item' });
      row.createEl('span', { text: entry.name || entry.id, cls: 'windrose-insert-map-item-name' });
      row.createEl('span', { text: entry.type, cls: 'windrose-insert-map-item-type' });
      row.onclick = () => {
        this.onInsert(entry.id, entry.name, entry.type);
        this.close();
      };
    }
  }

  private renderNewMapSection(contentEl: HTMLElement, hasExisting: boolean): void {
    const section = contentEl.createDiv({ cls: 'windrose-insert-section' });
    if (hasExisting) {
      section.createEl('div', { text: 'Create new', cls: 'windrose-insert-section-title' });
    }

    new Setting(section)
      .setName('Map name')
      .setDesc('A display name for this map (can be left blank)')
      .addText(text => {
        text
          .setPlaceholder('E.g., goblin cave level 1')
          .onChange(value => { this.mapName = value; });
        if (!hasExisting) {
          setTimeout(() => text.inputEl.focus(), 10);
        }
      });

    const typeContainer = section.createDiv({ cls: 'windrose-map-type-selection' });
    typeContainer.createEl('div', { text: 'Map type', cls: 'setting-item-name' });
    typeContainer.createEl('div', {
      text: 'Choose the grid style for this map',
      cls: 'setting-item-description'
    });

    const buttonRow = typeContainer.createDiv({ cls: 'windrose-map-type-buttons' });

    const gridBtn = buttonRow.createEl('button', {
      text: 'Grid',
      cls: 'windrose-map-type-btn',
      attr: { type: 'button' }
    });

    const hexBtn = buttonRow.createEl('button', {
      text: 'Hex',
      cls: 'windrose-map-type-btn',
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

    const buttonContainer = section.createDiv({ cls: 'windrose-modal-buttons' });

    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();

    const insertBtn = buttonContainer.createEl('button', { text: 'Create', cls: 'mod-cta' });
    insertBtn.onclick = () => this.submitNew();
  }

  private generateMapId(): string {
    return 'map-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  private submitNew(): void {
    if (!this.mapType) return;
    this.onInsert(this.generateMapId(), this.mapName, this.mapType);
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
