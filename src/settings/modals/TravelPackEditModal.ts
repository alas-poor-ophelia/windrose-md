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
import { Modal, Notice, Setting } from 'obsidian';
import type {
  TravelPack,
  TravelMode,
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

const DEFAULT_TERRAIN_COLOR = '#a8a29e';
const MODE_TIME_UNITS: TravelTimeUnit[] = ['minutes', 'hours', 'days'];

class TravelPackEditModal extends Modal {
  private plugin: WindrosePlugin;
  private packId: string;
  private onChanged: () => void;

  constructor(app: App, plugin: WindrosePlugin, packId: string, onChanged: () => void) {
    super(app);
    this.plugin = plugin;
    this.packId = packId;
    this.onChanged = onChanged;
  }

  private getPack(): TravelPack | null {
    return (this.plugin.settings.travelPacks ?? []).find(p => p.id === this.packId) ?? null;
  }

  private commit(pack: TravelPack, rerender: boolean): void {
    this.plugin.settings.travelPacks = upsertTravelPack(this.plugin.settings.travelPacks ?? [], pack);
    void this.plugin.saveSettings();
    this.onChanged();
    if (rerender) this.render();
  }

  /**
   * Patch one field of a pack entity by id, spreading the LIVE entity from
   * settings — never the render-time closure copy. Spreading the captured
   * entity would clobber every other field edited since the last re-render
   * (the stale-closure clobber: type a name, then a factor, name reverts).
   */
  private patchItem(
    key: 'units' | 'terrains' | 'modes' | 'allowances',
    itemId: string,
    patch: Record<string, unknown>,
    rerender = false
  ): void {
    const current = this.getPack();
    if (!current) return;
    const item = (current[key] as { id: string }[]).find(e => e.id === itemId);
    if (!item) return;
    this.commit(upsertPackItem(current, key, { ...item, ...patch }), rerender);
  }

  /** Parse a positive number from an input; returns null (and notices) when invalid */
  private parsePositive(raw: string, label: string): number | null {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      new Notice(`${label} must be a number greater than zero`);
      return null;
    }
    return value;
  }

  onOpen(): void {
    this.modalEl.addClass('windrose-travel-pack-modal');
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
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
        text.onChange(value => {
          const factor = this.parsePositive(value, 'Conversion factor');
          if (factor != null) this.patchItem('units', unit.id, { factor });
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
        text.onChange(value => {
          const multiplier = this.parsePositive(value, 'Speed multiplier');
          if (multiplier != null) this.patchItem('terrains', terrain.id, { multiplier });
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
    }
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
        text.onChange(value => {
          const distance = this.parsePositive(value, 'Distance');
          if (distance != null) this.patchItem('modes', mode.id, { distance });
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
        text.onChange(value => {
          const timeValue = this.parsePositive(value, 'Time span');
          if (timeValue != null) this.patchItem('modes', mode.id, { timeValue });
        });
      });
      row.addDropdown(dropdown => {
        for (const timeUnit of MODE_TIME_UNITS) {
          dropdown.addOption(timeUnit, timeUnit);
        }
        dropdown.setValue(mode.timeUnit);
        dropdown.onChange(value => {
          this.patchItem('modes', mode.id, { timeUnit: value });
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
        text.onChange(value => {
          const timeValue = this.parsePositive(value, 'Time per day');
          if (timeValue != null) this.patchItem('allowances', allowance.id, { timeValue });
        });
      });
      row.addDropdown(dropdown => {
        dropdown.addOption('hours', 'Hours/day');
        dropdown.addOption('minutes', 'Minutes/day');
        dropdown.setValue(allowance.timeUnit);
        dropdown.onChange(value => {
          this.patchItem('allowances', allowance.id, { timeUnit: value });
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
    this.contentEl.empty();
  }
}

export { TravelPackEditModal };
