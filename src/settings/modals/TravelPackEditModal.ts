/**
 * TravelPackEditModal.ts
 *
 * Native Obsidian modal for editing a travel pack: name/description plus
 * the four entity lists (custom units, terrains, travel modes, per-day
 * allowances). Edits apply immediately to plugin settings (instant-apply,
 * matching the settings tab convention).
 *
 * Text edits commit without re-rendering (re-render would steal focus per
 * keystroke); structural changes (add/remove/dropdown) re-render the list.
 *
 * Removing a custom unit that modes reference converts those modes to the
 * unit's base (distance × factor) so speeds stay semantically identical —
 * never dangling references, never silently wrong numbers.
 */

import type { App } from 'obsidian';
import { Modal, Notice, Setting, setIcon, setTooltip } from 'obsidian';
import type {
  TravelPack,
  TravelUnit,
  TravelTerrain,
  TravelMode,
  TravelAllowance,
  TravelTimeUnit,
} from '#types/settings/travelPack.types';
import type { WindrosePlugin } from '../tabs/settingsTabContext';
import { ConfirmModal } from './ConfirmModal';
import {
  createTravelAllowance,
  createTravelMode,
  createTravelTerrain,
  createTravelUnit,
  findModesReferencingUnit,
  removePackItem,
  resolvePackUnit,
  upsertPackItem,
  upsertTravelPack,
} from '../../travel/travelPackOperations';
import { colorsMatch, getColorPalette } from '../../drawing/colorOperations';
import { ColorEditModal } from './ColorEditModal';

const DEFAULT_TERRAIN_COLOR = '#a8a29e';
const MODE_TIME_UNITS: TravelTimeUnit[] = ['minutes', 'hours', 'days'];

/** Maps each pack list key to its entity type so patchItem patches typecheck */
interface PackItemTypes {
  units: TravelUnit;
  terrains: TravelTerrain;
  modes: TravelMode;
  allowances: TravelAllowance;
}

class TravelPackEditModal extends Modal {
  private plugin: WindrosePlugin;
  private packId: string;
  private onChanged: () => void;
  private notifyTimer: number | null = null;
  /** Terrain ids whose full palette list is open, kept across re-renders */
  private expandedTerrains = new Set<string>();
  /** Live palette container per terrain id, so a palette change repaints in
   *  place instead of re-rendering (and unfocusing) the whole modal */
  private terrainPaletteEls = new Map<string, HTMLElement>();
  /** Fingerprint of the palette the strips were last drawn from */
  private paletteSignature = '';
  private settingsListener: (() => void) | null = null;

  constructor(app: App, plugin: WindrosePlugin, packId: string, onChanged: () => void) {
    super(app);
    this.plugin = plugin;
    this.packId = packId;
    this.onChanged = onChanged;
  }

  private getPack(): TravelPack | null {
    return (this.plugin.settings.travelPacks ?? []).find(p => p.id === this.packId) ?? null;
  }

  /**
   * Settings mutate synchronously; persistence + onChanged fan out either
   * immediately (structural edits, rerender=true) or debounced (per-keystroke
   * text edits, rerender=false). onChanged rebuilds the settings tab behind
   * the modal AND dispatches windrose-settings-changed to every open map
   * view — per-character that cascade is a full-app refresh storm.
   */
  private commit(pack: TravelPack, rerender: boolean): void {
    this.plugin.settings.travelPacks = upsertTravelPack(this.plugin.settings.travelPacks ?? [], pack);
    if (rerender) {
      this.flushNotify();
      this.render();
    } else {
      if (this.notifyTimer != null) window.clearTimeout(this.notifyTimer);
      this.notifyTimer = window.setTimeout(() => this.flushNotify(), 600);
    }
  }

  /** Persist settings and notify listeners, cancelling any pending debounce */
  private flushNotify(): void {
    if (this.notifyTimer != null) {
      window.clearTimeout(this.notifyTimer);
      this.notifyTimer = null;
    }
    void this.plugin.saveSettings();
    this.onChanged();
  }

  /**
   * Patch one field of a pack entity by id, spreading the LIVE entity from
   * settings — never the render-time closure copy. Spreading the captured
   * entity would clobber every other field edited since the last re-render
   * (the stale-closure clobber: type a name, then a factor, name reverts).
   */
  private patchItem<K extends keyof PackItemTypes>(
    key: K,
    itemId: string,
    patch: Partial<PackItemTypes[K]>,
    rerender = false
  ): void {
    const current = this.getPack();
    if (!current) return;
    const item = (current[key] as PackItemTypes[K][]).find(e => e.id === itemId);
    if (!item) return;
    this.commit(upsertPackItem(current, key, { ...item, ...patch }), rerender);
  }

  /** Parse a positive number from an input; returns null when invalid */
  private parsePositive(raw: string): number | null {
    if (raw.trim() === '') return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return null;
    return value;
  }

  /**
   * Bind a numeric field so half-typed values ('', '0', '0.') never nag.
   *
   * Typing an invalid value only marks the input (silent, per keystroke);
   * the Notice fires once on commit — blur or Enter — and the last valid
   * value is restored. Valid keystrokes still apply live, as before.
   */
  private bindPositiveNumber(
    input: HTMLInputElement,
    label: string,
    initial: number,
    apply: (value: number) => void
  ): void {
    let lastValid = initial;
    const clearInvalid = (): void => {
      input.removeClass('is-invalid');
      input.removeAttribute('aria-invalid');
    };
    input.addEventListener('input', () => {
      const value = this.parsePositive(input.value);
      if (value == null) {
        input.addClass('is-invalid');
        input.setAttribute('aria-invalid', 'true');
        return;
      }
      clearInvalid();
      lastValid = value;
      apply(value);
    });
    input.addEventListener('change', () => {
      if (this.parsePositive(input.value) != null) return;
      // Settings still hold lastValid (invalid keystrokes never applied), so
      // restoring the text is enough to put the field back in sync.
      new Notice(`${label} must be a number greater than zero`);
      input.value = String(lastValid);
      clearInvalid();
    });
  }

  onOpen(): void {
    this.modalEl.addClass('windrose-travel-pack-modal');
    this.settingsListener = () => { this.handleSettingsChanged(); };
    window.addEventListener('windrose-settings-changed', this.settingsListener);
    this.render();
  }

  /** Fingerprint of the palette: identity, colour and label of every entry */
  private computePaletteSignature(): string {
    return getColorPalette().map(entry => `${entry.id}:${entry.color}:${entry.label}`).join('|');
  }

  /**
   * Repaint terrain palettes when the palette itself changed (a colour added
   * or edited elsewhere). Every settings save fires this event — including
   * this modal's own debounced text saves — so the signature check is what
   * keeps typing from being interrupted by a repaint.
   */
  private handleSettingsChanged(): void {
    const signature = this.computePaletteSignature();
    if (signature === this.paletteSignature) return;
    this.paletteSignature = signature;
    const pack = this.getPack();
    if (!pack) return;
    for (const [terrainId, paletteEl] of this.terrainPaletteEls) {
      const terrain = pack.terrains.find(t => t.id === terrainId);
      if (terrain) this.fillTerrainPalette(paletteEl, terrain);
    }
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.terrainPaletteEls.clear();
    this.paletteSignature = this.computePaletteSignature();
    const pack = this.getPack();
    if (!pack) {
      contentEl.createEl('p', { text: 'This travel pack no longer exists.' });
      return;
    }

    contentEl.createEl('h3', { text: 'Edit travel pack' });

    new Setting(contentEl)
      .setName('Name')
      .addText(text => {
        text.setValue(pack.name);
        text.onChange(value => {
          const current = this.getPack();
          if (current && value.trim() !== '') this.commit({ ...current, name: value.trim() }, false);
        });
      });

    new Setting(contentEl)
      .setName('Description')
      .addText(text => {
        text.setValue(pack.description ?? '');
        text.setPlaceholder('Optional');
        text.onChange(value => {
          const current = this.getPack();
          if (!current) return;
          const trimmed = value.trim();
          if (trimmed === '') {
            const { description: _removed, ...rest } = current;
            this.commit(rest, false);
          } else {
            this.commit({ ...current, description: trimmed }, false);
          }
        });
      });

    this.renderUnits(contentEl, pack);
    this.renderTerrains(contentEl, pack);
    this.renderModes(contentEl, pack);
    this.renderAllowances(contentEl, pack);
  }

  // ===========================================
  // Custom units
  // ===========================================

  private renderUnits(containerEl: HTMLElement, pack: TravelPack): void {
    new Setting(containerEl).setName('Custom units').setHeading()
      .setDesc('Distance units defined in standard units, like a hex worth 6 mi. No calibration involved.')
      .addExtraButton(btn => btn
        .setIcon('plus')
        .setTooltip('Add unit')
        .onClick(() => {
          const current = this.getPack();
          if (current) this.commit(upsertPackItem(current, 'units', createTravelUnit()), true);
        }));

    for (const unit of pack.units) {
      const row = new Setting(containerEl);
      row.settingEl.addClass('windrose-travel-pack-row');
      row.addText(text => {
        text.setValue(unit.name);
        text.setPlaceholder('Name');
        text.onChange(value => {
          if (value.trim() !== '') this.patchItem('units', unit.id, { name: value.trim() });
        });
      });
      row.addText(text => {
        text.setValue(unit.abbreviation);
        text.setPlaceholder('Abbrev.');
        text.inputEl.addClass('windrose-travel-pack-input-small');
        text.onChange(value => {
          this.patchItem('units', unit.id, { abbreviation: value.trim() });
        });
      });
      row.addText(text => {
        text.setValue(String(unit.factor));
        text.inputEl.type = 'number';
        text.inputEl.addClass('windrose-travel-pack-input-small');
        this.bindPositiveNumber(text.inputEl, 'Conversion factor', unit.factor, factor => {
          this.patchItem('units', unit.id, { factor });
        });
      });
      row.addText(text => {
        text.setValue(unit.baseUnit);
        text.setPlaceholder('Base unit');
        text.inputEl.addClass('windrose-travel-pack-input-small');
        text.onChange(value => {
          if (value.trim() !== '') this.patchItem('units', unit.id, { baseUnit: value.trim() });
        });
      });
      row.addExtraButton(btn => btn
        .setIcon('trash-2')
        .setTooltip('Remove unit')
        .onClick(() => { void this.removeUnit(unit.id); }));
    }
  }

  /** Unit removal converts referencing modes to the unit's base so speeds keep meaning */
  private async removeUnit(unitId: string): Promise<void> {
    const pack = this.getPack();
    if (!pack) return;
    const unit = resolvePackUnit(pack, unitId);
    const referencing = findModesReferencingUnit(pack, unitId);

    if (unit && referencing.length > 0) {
      const confirmed = await new ConfirmModal(this.app, {
        message: `${referencing.length} travel mode(s) use "${unit.name}". Removing it converts them to ${unit.baseUnit} (1 ${unit.name} = ${unit.factor} ${unit.baseUnit}) — speeds stay the same.`,
        confirmText: 'Remove and convert',
      }).openAndGetValue();
      if (!confirmed) return;
    }

    let next = pack;
    if (unit) {
      for (const mode of referencing) {
        const converted: TravelMode = {
          ...mode,
          distance: mode.distance * unit.factor,
          unit: { type: 'standard', unit: unit.baseUnit },
        };
        next = upsertPackItem(next, 'modes', converted);
      }
    }
    this.commit(removePackItem(next, 'units', unitId), true);
  }

  // ===========================================
  // Terrains
  // ===========================================

  private renderTerrains(containerEl: HTMLElement, pack: TravelPack): void {
    new Setting(containerEl).setName('Terrain types').setHeading()
      .setDesc('Speed multipliers — above 1 is faster (roads), below 1 is slower (swamps).')
      .addExtraButton(btn => btn
        .setIcon('plus')
        .setTooltip('Add terrain')
        .onClick(() => {
          const current = this.getPack();
          if (current) this.commit(upsertPackItem(current, 'terrains', createTravelTerrain({ color: DEFAULT_TERRAIN_COLOR })), true);
        }));

    for (const terrain of pack.terrains) {
      const row = new Setting(containerEl);
      row.settingEl.addClass('windrose-travel-pack-row');
      row.addText(text => {
        text.setValue(terrain.name);
        text.setPlaceholder('Name');
        text.onChange(value => {
          if (value.trim() !== '') this.patchItem('terrains', terrain.id, { name: value.trim() });
        });
      });
      row.addText(text => {
        text.setValue(String(terrain.multiplier));
        text.inputEl.type = 'number';
        text.inputEl.addClass('windrose-travel-pack-input-small');
        this.bindPositiveNumber(text.inputEl, 'Speed multiplier', terrain.multiplier, multiplier => {
          this.patchItem('terrains', terrain.id, { multiplier });
        });
      });
      row.addColorPicker(picker => {
        picker.setValue(terrain.color ?? DEFAULT_TERRAIN_COLOR);
        picker.onChange(value => {
          this.patchItem('terrains', terrain.id, { color: value });
        });
      });
      row.addExtraButton(btn => btn
        .setIcon('trash-2')
        .setTooltip('Remove terrain')
        .onClick(() => {
          const current = this.getPack();
          if (current) this.commit(removePackItem(current, 'terrains', terrain.id), true);
        }));
      this.renderTerrainDetails(containerEl, terrain);
    }
  }

  /**
   * The second line of a terrain row: a one-click strip of the user's own
   * map palette (so route colors match the paint they describe without
   * copying hex codes through the OS color dialog), and the tile tag that
   * automatic categorization matches placed tiles against.
   *
   * This is a plain block rather than a Setting because the modal hides
   * `.setting-item-info` on pack rows — setName/setDesc would render nothing.
   */
  private renderTerrainDetails(containerEl: HTMLElement, terrain: TravelTerrain): void {
    const details = containerEl.createDiv({ cls: 'windrose-travel-terrain-details' });

    const palette = details.createDiv({ cls: 'windrose-travel-terrain-palette' });
    this.terrainPaletteEls.set(terrain.id, palette);
    this.fillTerrainPalette(palette, terrain);

    const tagField = details.createDiv({ cls: 'windrose-travel-terrain-tag' });
    const input = tagField.createEl('input', {
      cls: 'windrose-travel-terrain-tag-input',
      attr: { type: 'text', placeholder: 'Tile tag', 'aria-label': 'Tile tag' },
    });
    input.value = terrain.tileTag ?? '';
    input.addEventListener('input', () => {
      const trimmed = input.value.trim();
      const current = this.getPack();
      if (!current) return;
      if (trimmed === '') {
        const item = current.terrains.find(t => t.id === terrain.id);
        if (!item) return;
        const { tileTag: _removed, ...rest } = item;
        this.commit(upsertPackItem(current, 'terrains', rest), false);
      } else {
        this.patchItem('terrains', terrain.id, { tileTag: trimmed });
      }
    });
    tagField.createDiv({
      cls: 'windrose-travel-terrain-hint',
      text: 'Cells holding a tile with this tag count as this terrain.',
    });
  }

  /**
   * The palette region of a terrain row: the compact one-click strip, an
   * ellipsis toggle, and (when open) the same palette spelled out with
   * labels plus an "Add color" entry. Repainted in place so an added colour
   * shows up without re-rendering the modal.
   */
  private fillTerrainPalette(paletteEl: HTMLElement, terrain: TravelTerrain): void {
    paletteEl.empty();
    const entries = getColorPalette();
    const activeColor = terrain.color ?? DEFAULT_TERRAIN_COLOR;
    const expanded = this.expandedTerrains.has(terrain.id);

    const swatches = paletteEl.createDiv({ cls: 'windrose-travel-terrain-swatches' });
    for (const entry of entries) {
      const swatch = swatches.createEl('button', {
        cls: 'windrose-travel-terrain-swatch',
        attr: { type: 'button' },
      });
      swatch.setCssStyles({ backgroundColor: entry.color });
      setTooltip(swatch, entry.label);
      swatch.setAttribute('aria-label', entry.label);
      if (colorsMatch(entry.color, activeColor)) swatch.addClass('is-selected');
      swatch.onclick = () => {
        this.patchItem('terrains', terrain.id, { color: entry.color }, true);
      };
    }

    const moreBtn = swatches.createEl('button', {
      cls: 'windrose-travel-terrain-more',
      attr: { type: 'button', 'aria-label': 'More colors', 'aria-expanded': String(expanded) },
    });
    setIcon(moreBtn, 'more-horizontal');
    setTooltip(moreBtn, 'More colors');
    if (expanded) moreBtn.addClass('is-active');
    moreBtn.onclick = () => {
      if (expanded) {
        this.expandedTerrains.delete(terrain.id);
      } else {
        this.expandedTerrains.add(terrain.id);
      }
      this.fillTerrainPalette(paletteEl, terrain);
    };

    if (!expanded) return;

    const list = paletteEl.createDiv({ cls: 'windrose-travel-terrain-expanded' });
    for (const entry of entries) {
      const option = list.createEl('button', {
        cls: 'windrose-travel-terrain-option',
        attr: { type: 'button', 'aria-label': entry.label },
      });
      const chip = option.createSpan({ cls: 'windrose-travel-terrain-option-swatch' });
      chip.setCssStyles({ backgroundColor: entry.color });
      option.createSpan({ cls: 'windrose-travel-terrain-option-label', text: entry.label });
      if (colorsMatch(entry.color, activeColor)) option.addClass('is-selected');
      option.onclick = () => {
        this.patchItem('terrains', terrain.id, { color: entry.color }, true);
      };
    }

    const addBtn = list.createEl('button', {
      cls: 'windrose-travel-terrain-add',
      attr: { type: 'button', 'aria-label': 'Add color' },
    });
    const addIcon = addBtn.createSpan({ cls: 'windrose-travel-terrain-add-icon' });
    setIcon(addIcon, 'plus');
    addBtn.createSpan({ cls: 'windrose-travel-terrain-option-label', text: 'Add color' });
    setTooltip(addBtn, 'Add color');
    addBtn.onclick = () => { this.addPaletteColor(terrain.id); };
  }

  /**
   * Open the shared colour editor in create mode; whatever the user adds
   * becomes this terrain's colour. The new entry is identified by diffing
   * the custom-colour ids, so a cancelled dialog changes nothing.
   */
  private addPaletteColor(terrainId: string): void {
    const beforeIds = new Set((this.plugin.settings.customPaletteColors ?? []).map(c => c.id));
    new ColorEditModal(this.app, this.plugin, null, () => {
      const added = (this.plugin.settings.customPaletteColors ?? []).find(c => !beforeIds.has(c.id));
      this.expandedTerrains.add(terrainId);
      if (added) this.patchItem('terrains', terrainId, { color: added.color });
      // ColorEditModal only mutates settings — persist here, which also fires
      // windrose-settings-changed for every other palette consumer.
      this.flushNotify();
      this.paletteSignature = this.computePaletteSignature();
      const paletteEl = this.terrainPaletteEls.get(terrainId);
      const terrain = this.getPack()?.terrains.find(t => t.id === terrainId);
      if (paletteEl && terrain) this.fillTerrainPalette(paletteEl, terrain);
    }).open();
  }

  // ===========================================
  // Travel modes
  // ===========================================

  private renderModes(containerEl: HTMLElement, pack: TravelPack): void {
    new Setting(containerEl).setName('Travel modes').setHeading()
      .setDesc('Speeds as distance per time: 24 miles per 8 hours, or 3 hexes per 1 day.')
      .addExtraButton(btn => btn
        .setIcon('plus')
        .setTooltip('Add mode')
        .onClick(() => {
          const current = this.getPack();
          if (current) this.commit(upsertPackItem(current, 'modes', createTravelMode()), true);
        }));

    for (const mode of pack.modes) {
      const row = new Setting(containerEl);
      row.settingEl.addClass('windrose-travel-pack-row');
      row.addText(text => {
        text.setValue(mode.name);
        text.setPlaceholder('Name');
        text.onChange(value => {
          if (value.trim() !== '') this.patchItem('modes', mode.id, { name: value.trim() });
        });
      });
      row.addText(text => {
        text.setValue(String(mode.distance));
        text.inputEl.type = 'number';
        text.inputEl.addClass('windrose-travel-pack-input-small');
        this.bindPositiveNumber(text.inputEl, 'Distance', mode.distance, distance => {
          this.patchItem('modes', mode.id, { distance });
        });
      });

      // Distance unit: a standard unit string, or one of the pack's custom
      // units referenced by id (never by name — TM-11)
      row.addDropdown(dropdown => {
        dropdown.addOption('standard', 'Unit…');
        for (const unit of pack.units) {
          dropdown.addOption(unit.id, unit.name);
        }
        dropdown.setValue(mode.unit.type === 'custom' ? mode.unit.unitId : 'standard');
        dropdown.onChange(value => {
          const live = this.getPack()?.modes.find(m => m.id === mode.id);
          if (!live) return;
          const unit: TravelMode['unit'] = value === 'standard'
            ? { type: 'standard', unit: live.unit.type === 'standard' ? live.unit.unit : 'mi' }
            : { type: 'custom', unitId: value };
          this.patchItem('modes', mode.id, { unit }, true);
        });
      });
      if (mode.unit.type === 'standard') {
        const standardUnit = mode.unit.unit;
        row.addText(text => {
          text.setValue(standardUnit);
          text.setPlaceholder('Unit');
          text.inputEl.addClass('windrose-travel-pack-input-small');
          text.onChange(value => {
            if (value.trim() !== '') {
              this.patchItem('modes', mode.id, { unit: { type: 'standard', unit: value.trim() } });
            }
          });
        });
      }

      row.addText(text => {
        text.setValue(String(mode.timeValue));
        text.inputEl.type = 'number';
        text.inputEl.addClass('windrose-travel-pack-input-small');
        this.bindPositiveNumber(text.inputEl, 'Time span', mode.timeValue, timeValue => {
          this.patchItem('modes', mode.id, { timeValue });
        });
      });
      row.addDropdown(dropdown => {
        for (const timeUnit of MODE_TIME_UNITS) {
          dropdown.addOption(timeUnit, timeUnit);
        }
        dropdown.setValue(mode.timeUnit);
        dropdown.onChange(value => {
          // Options are populated from MODE_TIME_UNITS, so the cast is sound
          this.patchItem('modes', mode.id, { timeUnit: value as TravelTimeUnit });
        });
      });
      row.addExtraButton(btn => btn
        .setIcon('trash-2')
        .setTooltip('Remove mode')
        .onClick(() => {
          const current = this.getPack();
          if (current) this.commit(removePackItem(current, 'modes', mode.id), true);
        }));
    }
  }

  // ===========================================
  // Per-day allowances
  // ===========================================

  private renderAllowances(containerEl: HTMLElement, pack: TravelPack): void {
    new Setting(containerEl).setName('Per-day allowances').setHeading()
      .setDesc('How much travel time counts as one day — a normal pace runs eight hours, a forced march twelve.')
      .addExtraButton(btn => btn
        .setIcon('plus')
        .setTooltip('Add allowance')
        .onClick(() => {
          const current = this.getPack();
          if (current) this.commit(upsertPackItem(current, 'allowances', createTravelAllowance()), true);
        }));

    for (const allowance of pack.allowances) {
      const row = new Setting(containerEl);
      row.settingEl.addClass('windrose-travel-pack-row');
      row.addText(text => {
        text.setValue(allowance.name);
        text.setPlaceholder('Name');
        text.onChange(value => {
          if (value.trim() !== '') this.patchItem('allowances', allowance.id, { name: value.trim() });
        });
      });
      row.addText(text => {
        text.setValue(String(allowance.timeValue));
        text.inputEl.type = 'number';
        text.inputEl.addClass('windrose-travel-pack-input-small');
        this.bindPositiveNumber(text.inputEl, 'Time per day', allowance.timeValue, timeValue => {
          this.patchItem('allowances', allowance.id, { timeValue });
        });
      });
      row.addDropdown(dropdown => {
        dropdown.addOption('hours', 'Hours/day');
        dropdown.addOption('minutes', 'Minutes/day');
        dropdown.setValue(allowance.timeUnit);
        dropdown.onChange(value => {
          // Options are 'hours'/'minutes' only, matching the allowance union
          this.patchItem('allowances', allowance.id, { timeUnit: value as TravelAllowance['timeUnit'] });
        });
      });
      row.addExtraButton(btn => btn
        .setIcon('trash-2')
        .setTooltip('Remove allowance')
        .onClick(() => {
          const current = this.getPack();
          if (current) this.commit(removePackItem(current, 'allowances', allowance.id), true);
        }));
    }
  }

  onClose(): void {
    // Flush any debounced text-edit save so closing the modal never drops
    // the last keystrokes.
    if (this.notifyTimer != null) this.flushNotify();
    if (this.settingsListener) {
      window.removeEventListener('windrose-settings-changed', this.settingsListener);
      this.settingsListener = null;
    }
    this.terrainPaletteEls.clear();
    this.contentEl.empty();
  }
}

export { TravelPackEditModal };
