import type { App, TextComponent } from 'obsidian';
import { Modal, Setting, Notice } from 'obsidian';
import { DungeonEssenceVisualizer } from '../DungeonEssenceVisualizer';

type DungeonSize = 'small' | 'medium' | 'large';
type DungeonStyleName = 'classic' | 'cavern' | 'fortress' | 'crypt';
type CorridorStyle = 'straight' | 'organic' | 'diagonal';

interface DungeonStyleDefaults {
  circleChance: number;
  corridorStyle: CorridorStyle;
  loopChance: number;
  waterChance: number;
  doorChance: number;
  secretDoorChance: number;
  wideCorridorChance: number;
  roomSizeBias: number;
  diagonalCorridorChance: number;
}

interface VisualizerSettings extends Partial<DungeonStyleDefaults> {
  size: DungeonSize;
  [key: string]: unknown;
}

interface ConfigOverrides {
  circleChance: number | null;
  loopChance: number | null;
  doorChance: number | null;
  secretDoorChance: number | null;
  wideCorridorChance: number | null;
  roomSizeBias: number | null;
  corridorStyle: string | null;
  diagonalCorridorChance: number | null;
  style: string | null;
  objectDensity: number | null;
  monsterWeight: number | null;
  emptyWeight: number | null;
  featureWeight: number | null;
  trapWeight: number | null;
  useTemplates: boolean | null;
  waterChance: number | null;
  autoFogEnabled: boolean;
  [key: string]: unknown;
}

interface SliderRef {
  slider: HTMLInputElement;
  valueDisplay: HTMLSpanElement;
  formatFn: (v: number) => string;
}

interface DungeonGenerationResult {
  cells: Array<Record<string, unknown>>;
  objects: Array<Record<string, unknown>>;
  edges: unknown[];
  metadata: {
    rooms: unknown[];
    connections: unknown[];
    gridWidth: number;
    gridHeight: number;
    roomCount: number;
    doorCount: number;
    secretDoorCount: number;
    hasWideCorridors: boolean;
    hasDiagonalCorridors: boolean;
    entryRoomId?: string;
    exitRoomId?: string;
    waterRoomIds: string[];
    corridorResult: unknown;
    doorPositions: unknown[];
    style: string;
  };
}

interface StockResult {
  objects: Record<string, unknown>[];
  roomAssignments: Record<string, unknown>;
}

interface DungeonInsertOptions {
  distancePerCell: number;
  distanceUnit: string;
  preset: DungeonSize;
  configOverrides: Record<string, unknown>;
  roomCount: number;
  doorCount: number;
  stockingMetadata: {
    rooms: unknown[];
    corridorResult: unknown;
    doorPositions: unknown[];
    entryRoomId?: string;
    exitRoomId?: string;
    waterRoomIds: string[];
    style: string;
  };
  [key: string]: unknown;
}

type OnInsertCallback = (
  mapName: string,
  cells: Record<string, unknown>[],
  objects: Record<string, unknown>[],
  edges: unknown[],
  options: DungeonInsertOptions
) => void | Promise<void>;

interface WindrosePlugin {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loadDungeonGenerator(): Promise<{ generateDungeon: (...args: any[]) => any }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loadObjectPlacer(): Promise<{ stockDungeon: (...args: any[]) => any }>;
}

const DUNGEON_STYLE_DEFAULTS: Record<DungeonStyleName, DungeonStyleDefaults> = {
  classic: {
    circleChance: 0.3, corridorStyle: 'straight', loopChance: 0.15,
    waterChance: 0.15, doorChance: 0.7, secretDoorChance: 0.05,
    wideCorridorChance: 0.25, roomSizeBias: 0, diagonalCorridorChance: 0.5
  },
  cavern: {
    circleChance: 0.6, corridorStyle: 'organic', loopChance: 0.2,
    waterChance: 0.35, doorChance: 0.3, secretDoorChance: 0.08,
    wideCorridorChance: 0.4, roomSizeBias: 0.3, diagonalCorridorChance: 0.7
  },
  fortress: {
    circleChance: 0, corridorStyle: 'straight', loopChance: 0.08,
    waterChance: 0.05, doorChance: 0.9, secretDoorChance: 0.03,
    wideCorridorChance: 0.5, roomSizeBias: 0.2, diagonalCorridorChance: 0.2
  },
  crypt: {
    circleChance: 0.1, corridorStyle: 'straight', loopChance: 0.02,
    waterChance: 0.1, doorChance: 0.8, secretDoorChance: 0.15,
    wideCorridorChance: 0.1, roomSizeBias: -0.3, diagonalCorridorChance: 0.3
  }
};

async function stockGeneratedDungeon(plugin: WindrosePlugin, result: DungeonGenerationResult, overrides: Record<string, unknown>): Promise<StockResult> {
  const objectPlacer = await plugin.loadObjectPlacer();
  const stockResult = objectPlacer.stockDungeon(
    result.metadata.rooms,
    result.metadata.corridorResult,
    result.metadata.doorPositions,
    result.metadata.style || 'classic',
    {
      objectDensity: (overrides.objectDensity as number | undefined) ?? 1.0,
      monsterWeight: overrides.monsterWeight,
      emptyWeight: overrides.emptyWeight,
      featureWeight: overrides.featureWeight,
      trapWeight: overrides.trapWeight,
      useTemplates: overrides.useTemplates
    },
    {
      entryRoomId: result.metadata.entryRoomId,
      exitRoomId: result.metadata.exitRoomId,
      waterRoomIds: result.metadata.waterRoomIds
    }
  );
  return stockResult as StockResult;
}

class InsertDungeonModal extends Modal {
  private plugin: WindrosePlugin;
  private onInsert: OnInsertCallback;
  private mapName: string;
  private dungeonSize: DungeonSize | null;
  private distancePerCell: number;
  private distanceUnit: string;
  private advancedOpen: boolean;
  private dungeonStyle: DungeonStyleName;
  private visualizer: DungeonEssenceVisualizer | null;
  private sliderRefs: Record<string, SliderRef>;
  private corridorSelect: HTMLSelectElement | null;
  private configOverrides: ConfigOverrides;
  private nameInput: TextComponent | null;

  constructor(app: App, plugin: WindrosePlugin, onInsert: OnInsertCallback) {
    super(app);
    this.plugin = plugin;
    this.onInsert = onInsert;
    this.mapName = '';
    this.dungeonSize = null;
    this.distancePerCell = 5;
    this.distanceUnit = 'ft';
    this.advancedOpen = false;
    this.dungeonStyle = 'classic';
    this.visualizer = null;
    this.sliderRefs = {};
    this.corridorSelect = null;
    this.nameInput = null;
    this.configOverrides = {
      circleChance: null,
      loopChance: null,
      doorChance: null,
      secretDoorChance: null,
      wideCorridorChance: null,
      roomSizeBias: null,
      corridorStyle: null,
      diagonalCorridorChance: null,
      style: null,
      objectDensity: null,
      monsterWeight: null,
      emptyWeight: null,
      featureWeight: null,
      trapWeight: null,
      useTemplates: null,
      waterChance: null,
      autoFogEnabled: false
    };
  }

  getVisualizerSettings(): VisualizerSettings {
    const base = DUNGEON_STYLE_DEFAULTS[this.dungeonStyle] || DUNGEON_STYLE_DEFAULTS.classic;

    const settings: VisualizerSettings = { ...base, size: this.dungeonSize || 'medium' };
    if (this.configOverrides.circleChance !== null) settings.circleChance = this.configOverrides.circleChance;
    if (this.configOverrides.loopChance !== null) settings.loopChance = this.configOverrides.loopChance;
    if (this.configOverrides.corridorStyle !== null) settings.corridorStyle = this.configOverrides.corridorStyle as CorridorStyle;

    return settings;
  }

  updateVisualizer(): void {
    if (this.visualizer) {
      this.visualizer.updateSettings(this.getVisualizerSettings());
    }
  }

  syncSlidersToStyle(): void {
    const defaults = DUNGEON_STYLE_DEFAULTS[this.dungeonStyle] || DUNGEON_STYLE_DEFAULTS.classic;

    for (const [key, ref] of Object.entries(this.sliderRefs)) {
      const defaultVal = defaults[key as keyof DungeonStyleDefaults];
      if (defaultVal !== undefined && typeof defaultVal === 'number') {
        ref.slider.value = String(defaultVal);
        ref.valueDisplay.textContent = ref.formatFn(defaultVal);
        this.configOverrides[key] = null;
      }
    }

    if (this.corridorSelect && defaults.corridorStyle) {
      this.corridorSelect.value = defaults.corridorStyle;
      this.configOverrides.corridorStyle = null;
    }

    this.updateVisualizer();
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('windrose-insert-dungeon-modal');

    // === Header with Visualizer ===
    const headerContainer = contentEl.createDiv({ cls: 'windrose-dungeon-header' });

    const visualizerContainer = headerContainer.createDiv({ cls: 'windrose-dungeon-visualizer' });

    const titleOverlay = headerContainer.createDiv({ cls: 'windrose-dungeon-title-overlay' });
    titleOverlay.createEl('h2', { text: 'Generate Random Dungeon' });

    this.visualizer = new DungeonEssenceVisualizer(visualizerContainer, {
      height: 180,
      settings: this.getVisualizerSettings()
    });
    this.visualizer.start();

    new Setting(contentEl)
      .setName('Map name')
      .setDesc('A display name for this dungeon map (can be left blank)')
      .addText(text => {
        this.nameInput = text;
        text
          .setPlaceholder('e.g., Goblin Cave Level 1')
          .onChange((value: string) => {
            this.mapName = value;
          });
        setTimeout(() => text.inputEl.focus(), 10);
      });

    const styleContainer = contentEl.createDiv({ cls: 'windrose-dungeon-style-selection' });
    styleContainer.createEl('div', { text: 'Style', cls: 'setting-item-name' });
    styleContainer.createEl('div', {
      text: 'Choose the architectural style of the dungeon',
      cls: 'setting-item-description'
    });

    const styleRow = styleContainer.createDiv({ cls: 'windrose-dungeon-style-buttons' });

    const styleInfo: Record<DungeonStyleName, { label: string; desc: string }> = {
      classic: { label: 'Classic', desc: 'Balanced mix of rooms and corridors' },
      cavern: { label: 'Cavern', desc: 'Natural caves with organic passages' },
      fortress: { label: 'Fortress', desc: 'Military structure, wide corridors' },
      crypt: { label: 'Crypt', desc: 'Tight passages, hidden chambers' }
    };

    const styleButtons: Record<string, HTMLButtonElement> = {};

    for (const [style, info] of Object.entries(styleInfo)) {
      const btn = styleRow.createEl('button', {
        cls: 'windrose-dungeon-style-btn',
        text: info.label,
        attr: { type: 'button', title: info.desc }
      });
      styleButtons[style] = btn;

      btn.onclick = () => {
        this.dungeonStyle = style as DungeonStyleName;
        this.configOverrides.style = style === 'classic' ? null : style;
        Object.values(styleButtons).forEach((b: HTMLButtonElement) => b.removeClass('selected'));
        btn.addClass('selected');
        this.syncSlidersToStyle();
      };
    }

    styleButtons.classic.addClass('selected');

    const sizeContainer = contentEl.createDiv({ cls: 'windrose-dungeon-size-selection' });
    sizeContainer.createEl('div', { text: 'Dungeon size', cls: 'setting-item-name' });
    sizeContainer.createEl('div', {
      text: 'Choose the overall size of the generated dungeon',
      cls: 'setting-item-description'
    });

    const buttonRow = sizeContainer.createDiv({ cls: 'windrose-dungeon-size-buttons' });

    const presetInfo: Record<DungeonSize, { label: string; desc: string }> = {
      small: { label: 'Small', desc: '3-5 rooms, tight layout' },
      medium: { label: 'Medium', desc: '8-12 rooms, multiple paths' },
      large: { label: 'Large', desc: '10-15 rooms, grand scale' }
    };

    const buttons: Record<string, HTMLButtonElement> = {};

    for (const [preset, info] of Object.entries(presetInfo)) {
      const btn = buttonRow.createEl('button', {
        cls: 'windrose-dungeon-size-btn',
        text: info.label,
        attr: { type: 'button', title: info.desc }
      });
      buttons[preset] = btn;

      btn.onclick = () => {
        this.dungeonSize = preset as DungeonSize;
        Object.values(buttons).forEach((b: HTMLButtonElement) => b.removeClass('selected'));
        btn.addClass('selected');
        this.updateVisualizer();
      };
    }

    const distContainer = contentEl.createDiv({ cls: 'windrose-dungeon-size-selection' });
    distContainer.createEl('div', { text: 'Distance measurement', cls: 'setting-item-name' });
    distContainer.createEl('div', {
      text: 'Set the scale for distance measurement on this map',
      cls: 'setting-item-description'
    });

    const distRow = distContainer.createDiv({ cls: 'windrose-dungeon-distance-row' });

    const distInput = distRow.createEl('input', {
      type: 'number',
      value: String(this.distancePerCell),
      attr: { min: '1', step: '1' }
    });
    distInput.addEventListener('change', (e: Event) => {
      this.distancePerCell = parseInt((e.target as HTMLInputElement).value) || 5;
    });

    distRow.createEl('span', { text: 'per cell, unit:' });

    const unitInput = distRow.createEl('input', {
      type: 'text',
      value: this.distanceUnit
    });
    unitInput.addEventListener('change', (e: Event) => {
      this.distanceUnit = (e.target as HTMLInputElement).value || 'ft';
    });

    const advancedContainer = contentEl.createDiv({ cls: 'windrose-dungeon-advanced' });

    const advancedHeader = advancedContainer.createDiv({ cls: 'windrose-dungeon-advanced-header' });
    const chevron = advancedHeader.createSpan({ cls: 'windrose-dungeon-advanced-chevron', text: '▶' });
    advancedHeader.createSpan({ text: 'Advanced Options' });

    const advancedContent = advancedContainer.createDiv({ cls: 'windrose-dungeon-advanced-content' });
    advancedContent.style.display = 'none';

    advancedHeader.onclick = () => {
      this.advancedOpen = !this.advancedOpen;
      advancedContent.style.display = this.advancedOpen ? 'block' : 'none';
      chevron.textContent = this.advancedOpen ? '▼' : '▶';
    };

    const createSlider = (container: HTMLElement, label: string, key: string, min: number, max: number, step: number, defaultVal: number, formatFn: (v: number) => string) => {
      const row = container.createDiv({ cls: 'windrose-dungeon-slider-row' });
      row.createEl('label', { text: label });

      const sliderContainer = row.createDiv({ cls: 'windrose-dungeon-slider-container' });
      const slider = sliderContainer.createEl('input', {
        type: 'range',
        attr: { min: String(min), max: String(max), step: String(step) }
      });
      slider.value = String(defaultVal);

      const valueDisplay = sliderContainer.createSpan({
        cls: 'windrose-dungeon-slider-value',
        text: formatFn(defaultVal)
      });

      slider.addEventListener('input', (e: Event) => {
        const val = parseFloat((e.target as HTMLInputElement).value);
        valueDisplay.textContent = formatFn(val);
        this.configOverrides[key] = val;
        this.updateVisualizer();
      });

      this.sliderRefs[key] = { slider, valueDisplay, formatFn };

      return { slider, valueDisplay };
    };

    const pct = (v: number): string => `${Math.round(v * 100)}%`;
    const biasLabel = (v: number): string => {
      if (v < -0.3) return 'Compact';
      if (v > 0.3) return 'Spacious';
      return 'Normal';
    };

    createSlider(advancedContent, 'Circular Rooms', 'circleChance', 0, 1, 0.05, 0.3, pct);
    createSlider(advancedContent, 'Extra Connections', 'loopChance', 0, 0.5, 0.05, 0.15, pct);
    createSlider(advancedContent, 'Door Frequency', 'doorChance', 0, 1, 0.05, 0.7, pct);
    createSlider(advancedContent, 'Secret Doors', 'secretDoorChance', 0, 1, 0.05, 0.05, pct);
    createSlider(advancedContent, 'Wide Corridors', 'wideCorridorChance', 0, 1, 0.05, 0.25, pct);
    createSlider(advancedContent, 'Room Size Bias', 'roomSizeBias', -1, 1, 0.1, 0, biasLabel);

    const corridorRow = advancedContent.createDiv({ cls: 'windrose-dungeon-slider-row' });
    corridorRow.createEl('label', { text: 'Corridor Style' });
    const corridorToggleContainer = corridorRow.createDiv({ cls: 'windrose-dungeon-toggle-container' });

    const corridorSelect = corridorToggleContainer.createEl('select', { cls: 'windrose-dungeon-select' });
    corridorSelect.createEl('option', { value: 'straight', text: 'Straight' });
    corridorSelect.createEl('option', { value: 'organic', text: 'Organic' });
    corridorSelect.createEl('option', { value: 'diagonal', text: 'Diagonal' });
    corridorSelect.value = 'straight';
    this.corridorSelect = corridorSelect;

    corridorSelect.addEventListener('change', (e: Event) => {
      this.configOverrides.corridorStyle = (e.target as HTMLSelectElement).value;
      this.updateVisualizer();
    });

    const diagonalLabel = (v: number): string => v === 0 ? 'None' : `${Math.round(v * 100)}%`;
    createSlider(advancedContent, 'Diagonal Corridors', 'diagonalCorridorChance', 0, 1, 0.1, 0.5, diagonalLabel);

    advancedContent.createEl('div', { cls: 'windrose-dungeon-section-header', text: 'Environment' });

    const waterLabel = (v: number): string => v === 0 ? 'None' : `${Math.round(v * 100)}%`;
    createSlider(advancedContent, 'Water Features', 'waterChance', 0, 0.5, 0.05, 0.15, waterLabel);

    advancedContent.createEl('div', { cls: 'windrose-dungeon-section-header', text: 'Object Placement' });

    const densityLabel = (v: number): string => v < 0.75 ? 'Sparse' : v > 1.25 ? 'Dense' : 'Normal';
    createSlider(advancedContent, 'Object Density', 'objectDensity', 0.5, 2, 0.1, 1.0, densityLabel);

    const templateRow = advancedContent.createDiv({ cls: 'windrose-dungeon-slider-row' });
    templateRow.createEl('label', { text: 'Room Templates' });
    const templateToggleContainer = templateRow.createDiv({ cls: 'windrose-dungeon-toggle-container' });
    const templateCheckbox = templateToggleContainer.createEl('input', {
      type: 'checkbox',
      attr: { id: 'windrose-template-toggle' }
    });
    templateCheckbox.checked = true;
    templateToggleContainer.createEl('label', {
      attr: { for: 'windrose-template-toggle' },
      text: 'Enable',
      cls: 'windrose-checkbox-label'
    });
    templateCheckbox.addEventListener('change', (e: Event) => {
      this.configOverrides.useTemplates = (e.target as HTMLInputElement).checked;
    });
    advancedContent.createEl('div', {
      cls: 'windrose-checkbox-hint',
      text: 'Generates themed rooms (library, shrine, barracks) with appropriate objects'
    });

    advancedContent.createEl('div', { cls: 'windrose-dungeon-subsection', text: 'Room Categories' });
    createSlider(advancedContent, 'Monsters', 'monsterWeight', 0, 1, 0.05, 0.33, pct);
    createSlider(advancedContent, 'Empty Rooms', 'emptyWeight', 0, 1, 0.05, 0.33, pct);
    createSlider(advancedContent, 'Features', 'featureWeight', 0, 1, 0.05, 0.17, pct);
    createSlider(advancedContent, 'Traps', 'trapWeight', 0, 1, 0.05, 0.17, pct);

    advancedContent.createEl('div', { cls: 'windrose-dungeon-section-header', text: 'Solo Play' });

    const fogRow = advancedContent.createDiv({ cls: 'windrose-dungeon-slider-row' });
    fogRow.createEl('label', { text: 'Auto-Fog Dungeon' });
    const fogToggleContainer = fogRow.createDiv({ cls: 'windrose-dungeon-toggle-container' });
    const fogCheckbox = fogToggleContainer.createEl('input', {
      type: 'checkbox',
      attr: { id: 'windrose-fog-toggle' }
    });
    fogCheckbox.checked = false;
    fogToggleContainer.createEl('label', {
      attr: { for: 'windrose-fog-toggle' },
      text: 'Enable',
      cls: 'windrose-checkbox-label'
    });
    fogCheckbox.addEventListener('change', (e: Event) => {
      this.configOverrides.autoFogEnabled = (e.target as HTMLInputElement).checked;
    });
    advancedContent.createEl('div', {
      cls: 'windrose-checkbox-hint',
      text: 'Cover dungeon with fog, revealing only the entrance room'
    });

    const buttonContainer = contentEl.createDiv({ cls: 'windrose-modal-buttons' });

    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();

    const generateBtn = buttonContainer.createEl('button', { text: 'Generate', cls: 'mod-cta' });
    generateBtn.onclick = async () => {
      if (!this.dungeonSize) {
        buttonRow.addClass('windrose-shake');
        setTimeout(() => buttonRow.removeClass('windrose-shake'), 300);
        return;
      }

      try {
        const generator = await this.plugin.loadDungeonGenerator();

        const overrides: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(this.configOverrides)) {
          if (val !== null) overrides[key] = val;
        }

        const result = generator.generateDungeon(this.dungeonSize, undefined, overrides) as DungeonGenerationResult;
        const stockResult = await stockGeneratedDungeon(this.plugin, result, overrides);
        const allObjects = [...result.objects, ...stockResult.objects];

        await this.onInsert(this.mapName, result.cells, allObjects, result.edges || [], {
          distancePerCell: this.distancePerCell,
          distanceUnit: this.distanceUnit,
          preset: this.dungeonSize,
          configOverrides: overrides,
          roomCount: result.metadata.roomCount,
          doorCount: result.metadata.doorCount,
          stockingMetadata: {
            rooms: result.metadata.rooms,
            corridorResult: result.metadata.corridorResult,
            doorPositions: result.metadata.doorPositions,
            entryRoomId: result.metadata.entryRoomId,
            exitRoomId: result.metadata.exitRoomId,
            waterRoomIds: result.metadata.waterRoomIds,
            style: result.metadata.style
          }
        });
        this.close();
      } catch (err: unknown) {
        console.error('[Windrose] Dungeon generation failed:', err);
        new Notice('Failed to generate dungeon: ' + (err as Error).message);
      }
    };

    contentEl.addEventListener('keydown', async (e: KeyboardEvent) => {
      if (e.key === 'Enter' && this.dungeonSize) {
        e.preventDefault();
        try {
          const generator = await this.plugin.loadDungeonGenerator();

          const overrides: Record<string, unknown> = {};
          for (const [key, val] of Object.entries(this.configOverrides)) {
            if (val !== null) overrides[key] = val;
          }

          const result = generator.generateDungeon(this.dungeonSize, undefined, overrides) as DungeonGenerationResult;
          const stockResult = await stockGeneratedDungeon(this.plugin, result, overrides);
          const allObjects = [...result.objects, ...stockResult.objects];

          await this.onInsert(this.mapName, result.cells, allObjects, result.edges || [], {
            distancePerCell: this.distancePerCell,
            distanceUnit: this.distanceUnit,
            preset: this.dungeonSize,
            configOverrides: overrides,
            roomCount: result.metadata.roomCount,
            doorCount: result.metadata.doorCount,
            stockingMetadata: {
              rooms: result.metadata.rooms,
              corridorResult: result.metadata.corridorResult,
              doorPositions: result.metadata.doorPositions,
              entryRoomId: result.metadata.entryRoomId,
              exitRoomId: result.metadata.exitRoomId,
              waterRoomIds: result.metadata.waterRoomIds,
              style: result.metadata.style
            }
          });
          this.close();
        } catch (err: unknown) {
          console.error('[Windrose] Dungeon generation failed:', err);
          new Notice('Failed to generate dungeon: ' + (err as Error).message);
        }
      }
    });
  }

  onClose(): void {
    if (this.visualizer) {
      this.visualizer.destroy();
      this.visualizer = null;
    }
    this.sliderRefs = {};
    this.corridorSelect = null;
    this.contentEl.empty();
  }
}

export { InsertDungeonModal };
export type { OnInsertCallback, DungeonInsertOptions };
