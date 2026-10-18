import type { App } from 'obsidian';
import { Modal, Setting } from 'obsidian';
import type { MapType } from '#types/index';
import { isFeatureEnabled } from '../../core/featureFlags';
import { mintId } from '../../core/ids';
import { ensureDataFileForNewMap } from '../../persistence/fileOperations';
import { isLodLadderEnabled } from '../../core/lodFlags';
import { LADDER_DEFAULTS } from '../../geometry/core/lattice';
import { confirmEnableDetailLevels } from './confirmEnableDetailLevels';

/** Dropdown value for a classic hex map (no detail levels). */
const DETAIL_LEVELS_OFF = 'off';

/**
 * Detail-level choices for a new hex map. "Off (classic)" is the default:
 * nobody gets detail levels without picking a preset (and confirming).
 */
const DETAIL_LEVEL_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: DETAIL_LEVELS_OFF, label: 'Off (classic)' },
  { value: String(LADDER_DEFAULTS.m), label: `${LADDER_DEFAULTS.m} child hexes per edge (recommended)` },
  { value: '2', label: '2 child hexes per edge' },
  { value: '15', label: '15 child hexes per edge' }
];

/** `ladderM` is passed only for a hex map with a detail-levels preset chosen (and confirmed). */
type NewMapCallback = (mapId: string, mapName: string, mapType: MapType, ladderM?: number) => void;

class NewMapModal extends Modal {
  private mapName = '';
  private mapType: MapType | null = null;
  /** Null = off (classic). */
  private ladderM: number | null = null;
  /** True while the detail-levels confirmation is open (Enter must not stack a second). */
  private confirming = false;
  private onCreate: NewMapCallback;

  constructor(app: App, onCreate: NewMapCallback) {
    super(app);
    this.onCreate = onCreate;
  }

  override onOpen(): void {
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

    // Detail levels: only meaningful for hex maps, so the row is shown only
    // while Hex is the selected type. Off (classic) is the default.
    let ladderSetting: Setting | null = null;
    if (hexBtn != null && isLodLadderEnabled()) {
      ladderSetting = new Setting(contentEl)
        .setName('Detail levels')
        .setDesc('Let this map add finer hexes as you zoom in. Each level splits every hex into this many child hexes per edge.')
        .addDropdown(dropdown => {
          for (const option of DETAIL_LEVEL_OPTIONS) dropdown.addOption(option.value, option.label);
          dropdown
            .setValue(this.ladderM === null ? DETAIL_LEVELS_OFF : String(this.ladderM))
            .onChange(value => { this.ladderM = value === DETAIL_LEVELS_OFF ? null : Number(value); });
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
    createBtn.onclick = () => { void this.submit(); };

    contentEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && this.mapType) {
        e.preventDefault();
        void this.submit();
      }
    });
  }

  private async submit(): Promise<void> {
    if (!this.mapType || this.confirming) return;
    const mapType = this.mapType;
    const ladderM = mapType === 'hex' && isLodLadderEnabled() && this.ladderM !== null ? this.ladderM : undefined;
    if (ladderM !== undefined) {
      // Cancel keeps this dialog open with its choices, so nothing is created.
      this.confirming = true;
      const confirmed = await confirmEnableDetailLevels(this.app);
      this.confirming = false;
      if (!confirmed) return;
    }
    const mapId = mintId('map');
    const mapName = this.mapName;
    this.close();
    // First use: create the store before the block mounts, so a fresh vault's
    // first map renders instead of the missing-store panel. Refuses when a
    // prior store is evidenced (the panel then explains it).
    void ensureDataFileForNewMap(this.app).finally(() => {
      if (ladderM !== undefined) this.onCreate(mapId, mapName, mapType, ladderM);
      else this.onCreate(mapId, mapName, mapType);
    });
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}

export { NewMapModal };
