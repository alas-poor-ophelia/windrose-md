import type { App } from 'obsidian';
import { Modal, Setting } from 'obsidian';
import type { MapType } from '#types/index';
import { isFeatureEnabled } from '../../core/featureFlags';
import { isLodLadderEnabled } from '../../core/lodFlags';
import { LADDER_DEFAULTS } from '../../geometry/core/lattice';

/** Ladder presets offered for a new hex map, default first. */
const LADDER_PRESETS: ReadonlyArray<{ m: number; label: string }> = [
  { m: 4, label: 'm = 4 (default)' },
  { m: 2, label: 'm = 2' },
  { m: 15, label: 'm = 15' }
];

/** `ladderM` is passed only for a hex map while the ladder capability is on. */
type NewMapCallback = (mapId: string, mapName: string, mapType: MapType, ladderM?: number) => void;

class NewMapModal extends Modal {
  private mapName = '';
  private mapType: MapType | null = null;
  private ladderM: number = LADDER_DEFAULTS.m;
  private onCreate: NewMapCallback;

  constructor(app: App, onCreate: NewMapCallback) {
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

    // Ladder preset (developer capability): only meaningful for hex maps, so
    // the row is shown only while Hex is the selected type.
    let ladderSetting: Setting | null = null;
    if (hexBtn != null && isLodLadderEnabled()) {
      ladderSetting = new Setting(contentEl)
        .setName('Detail ladder')
        .setDesc('How many child hexes each hex splits into per edge on each deeper level')
        .addDropdown(dropdown => {
          for (const preset of LADDER_PRESETS) dropdown.addOption(String(preset.m), preset.label);
          dropdown
            .setValue(String(this.ladderM))
            .onChange(value => { this.ladderM = Number(value); });
        });
      ladderSetting.settingEl.toggle(false);
    }

    gridBtn.onclick = () => {
      this.mapType = 'grid';
      gridBtn.addClass('selected');
      hexBtn?.removeClass('selected');
      ladderSetting?.settingEl.toggle(false);
    };

    if (hexBtn != null) {
      hexBtn.onclick = () => {
        this.mapType = 'hex';
        hexBtn.addClass('selected');
        gridBtn.removeClass('selected');
        ladderSetting?.settingEl.toggle(true);
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
    if (this.mapType === 'hex' && isLodLadderEnabled()) {
      this.onCreate(mapId, this.mapName, this.mapType, this.ladderM);
    } else {
      this.onCreate(mapId, this.mapName, this.mapType);
    }
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export { NewMapModal };
