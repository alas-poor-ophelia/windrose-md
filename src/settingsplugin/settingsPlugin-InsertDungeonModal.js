return `// settingsPlugin-InsertDungeonModal.js
// Modal for generating a random dungeon
// This file is concatenated into the settings plugin template by the assembler

// Style defaults at module scope - avoids recreation on each call
const DUNGEON_STYLE_DEFAULTS = {
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

/**
 * Stock a generated dungeon with objects using the objectPlacer module.
 * @param {Object} objectPlacer - The loaded objectPlacer module
 * @param {Object} result - The dungeon generation result
 * @param {Object} overrides - Config overrides from the modal
 * @returns {Object} Stock result with objects array
 */
async function stockGeneratedDungeon(plugin, result, overrides) {
  const objectPlacer = await plugin.loadObjectPlacer();
  return objectPlacer.stockDungeon(
    result.metadata.rooms,
    result.metadata.corridorResult,
    result.metadata.doorPositions,
    result.metadata.style || 'classic',
    {
      objectDensity: overrides.objectDensity ?? 1.0,
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
}

class InsertDungeonModal extends Modal {
  constructor(app, plugin, onInsert) {
    super(app);
    this.plugin = plugin;
    this.onInsert = onInsert;
    this.mapName = '';
    this.dungeonSize = null; // 'small', 'medium', or 'large'
    this.distancePerCell = 5;
    this.distanceUnit = 'ft';
    this.advancedOpen = false;
    this.dungeonStyle = 'classic'; // Default style
    this.visualizer = null; // DungeonEssenceVisualizer instance
    // Slider references for syncing with style changes
    this.sliderRefs = {};
    this.corridorSelect = null;
    // Config overrides - null means use preset default
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
      // Object placement settings
      objectDensity: null,
      monsterWeight: null,
      emptyWeight: null,
      featureWeight: null,
      trapWeight: null,
      useTemplates: null,
      // Water features
      waterChance: null,
      // Fog of war
      autoFogEnabled: false
    };
  }
  
  getVisualizerSettings() {
    const base = DUNGEON_STYLE_DEFAULTS[this.dungeonStyle] || DUNGEON_STYLE_DEFAULTS.classic;
    
    // Apply any explicit overrides
    const settings = { ...base, size: this.dungeonSize || 'medium' };
    if (this.configOverrides.circleChance !== null) settings.circleChance = this.configOverrides.circleChance;
    if (this.configOverrides.loopChance !== null) settings.loopChance = this.configOverrides.loopChance;
    if (this.configOverrides.corridorStyle !== null) settings.corridorStyle = this.configOverrides.corridorStyle;
    
    return settings;
  }
  
  // Update visualizer with current settings
  updateVisualizer() {
    if (this.visualizer) {
      this.visualizer.updateSettings(this.getVisualizerSettings());
    }
  }

  syncSlidersToStyle() {
    const defaults = DUNGEON_STYLE_DEFAULTS[this.dungeonStyle] || DUNGEON_STYLE_DEFAULTS.classic;

    // Update each slider to the style default
    for (const [key, ref] of Object.entries(this.sliderRefs)) {
      if (defaults[key] !== undefined) {
        ref.slider.value = String(defaults[key]);
        ref.valueDisplay.textContent = ref.formatFn(defaults[key]);
        // Clear override so generator uses style default
        this.configOverrides[key] = null;
      }
    }

    // Update corridor style select
    if (this.corridorSelect && defaults.corridorStyle) {
      this.corridorSelect.value = defaults.corridorStyle;
      this.configOverrides.corridorStyle = null;
    }

    this.updateVisualizer();
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-insert-dungeon-modal');
    
    // === Header with Visualizer ===
    const headerContainer = contentEl.createDiv({ cls: 'dmt-dungeon-header' });
    
    // Visualizer canvas container
    const visualizerContainer = headerContainer.createDiv({ cls: 'dmt-dungeon-visualizer' });
    
    // Title overlay at bottom of visualizer
    const titleOverlay = headerContainer.createDiv({ cls: 'dmt-dungeon-title-overlay' });
    titleOverlay.createEl('h2', { text: 'Generate Random Dungeon' });
    
    // Initialize visualizer
    this.visualizer = new DungeonEssenceVisualizer(visualizerContainer, {
      height: 180,
      settings: this.getVisualizerSettings()
    });
    this.visualizer.start();
    
    // Map name input
    new Setting(contentEl)
      .setName('Map name')
      .setDesc('A display name for this dungeon map (can be left blank)')
      .addText(text => {
        this.nameInput = text;
        text
          .setPlaceholder('e.g., Goblin Cave Level 1')
          .onChange(value => {
            this.mapName = value;
          });
        // Focus the input after modal opens
        setTimeout(() => text.inputEl.focus(), 10);
      });
    
    // Dungeon style selection
    const styleContainer = contentEl.createDiv({ cls: 'dmt-dungeon-style-selection' });
    styleContainer.createEl('div', { text: 'Style', cls: 'setting-item-name' });
    styleContainer.createEl('div', { 
      text: 'Choose the architectural style of the dungeon', 
      cls: 'setting-item-description' 
    });
    
    const styleRow = styleContainer.createDiv({ cls: 'dmt-dungeon-style-buttons' });
    
    const styleInfo = {
      classic: { label: 'Classic', desc: 'Balanced mix of rooms and corridors' },
      cavern: { label: 'Cavern', desc: 'Natural caves with organic passages' },
      fortress: { label: 'Fortress', desc: 'Military structure, wide corridors' },
      crypt: { label: 'Crypt', desc: 'Tight passages, hidden chambers' }
    };
    
    const styleButtons = {};
    
    for (const [style, info] of Object.entries(styleInfo)) {
      const btn = styleRow.createEl('button', { 
        cls: 'dmt-dungeon-style-btn',
        text: info.label,
        attr: { type: 'button', title: info.desc }
      });
      styleButtons[style] = btn;
      
      btn.onclick = () => {
        this.dungeonStyle = style;
        this.configOverrides.style = style === 'classic' ? null : style;
        Object.values(styleButtons).forEach(b => b.removeClass('selected'));
        btn.addClass('selected');
        this.syncSlidersToStyle();
      };
    }
    
    // Default to classic selected
    styleButtons.classic.addClass('selected');
    
    // Dungeon size selection
    const sizeContainer = contentEl.createDiv({ cls: 'dmt-dungeon-size-selection' });
    sizeContainer.createEl('div', { text: 'Dungeon size', cls: 'setting-item-name' });
    sizeContainer.createEl('div', { 
      text: 'Choose the overall size of the generated dungeon', 
      cls: 'setting-item-description' 
    });
    
    const buttonRow = sizeContainer.createDiv({ cls: 'dmt-dungeon-size-buttons' });
    
    const presetInfo = {
      small: { label: 'Small', desc: '3-5 rooms, tight layout' },
      medium: { label: 'Medium', desc: '8-12 rooms, multiple paths' },
      large: { label: 'Large', desc: '10-15 rooms, grand scale' }
    };
    
    const buttons = {};
    
    for (const [preset, info] of Object.entries(presetInfo)) {
      const btn = buttonRow.createEl('button', { 
        cls: 'dmt-dungeon-size-btn',
        text: info.label,
        attr: { type: 'button', title: info.desc }
      });
      buttons[preset] = btn;
      
      btn.onclick = () => {
        this.dungeonSize = preset;
        Object.values(buttons).forEach(b => b.removeClass('selected'));
        btn.addClass('selected');
        this.updateVisualizer();
      };
    }
    
    // Distance measurement settings
    const distContainer = contentEl.createDiv({ cls: 'dmt-dungeon-size-selection' });
    distContainer.createEl('div', { text: 'Distance measurement', cls: 'setting-item-name' });
    distContainer.createEl('div', { 
      text: 'Set the scale for distance measurement on this map', 
      cls: 'setting-item-description' 
    });
    
    const distRow = distContainer.createDiv({ cls: 'dmt-dungeon-distance-row' });
    
    const distInput = distRow.createEl('input', {
      type: 'number',
      value: String(this.distancePerCell),
      attr: { min: '1', step: '1' }
    });
    distInput.addEventListener('change', (e) => {
      this.distancePerCell = parseInt(e.target.value) || 5;
    });
    
    distRow.createEl('span', { text: 'per cell, unit:' });
    
    const unitInput = distRow.createEl('input', {
      type: 'text',
      value: this.distanceUnit
    });
    unitInput.addEventListener('change', (e) => {
      this.distanceUnit = e.target.value || 'ft';
    });
    
    // Advanced options (collapsed by default)
    const advancedContainer = contentEl.createDiv({ cls: 'dmt-dungeon-advanced' });
    
    const advancedHeader = advancedContainer.createDiv({ cls: 'dmt-dungeon-advanced-header' });
    const chevron = advancedHeader.createSpan({ cls: 'dmt-dungeon-advanced-chevron', text: '▶' });
    advancedHeader.createSpan({ text: 'Advanced Options' });
    
    const advancedContent = advancedContainer.createDiv({ cls: 'dmt-dungeon-advanced-content' });
    advancedContent.style.display = 'none';
    
    advancedHeader.onclick = () => {
      this.advancedOpen = !this.advancedOpen;
      advancedContent.style.display = this.advancedOpen ? 'block' : 'none';
      chevron.textContent = this.advancedOpen ? '▼' : '▶';
    };
    
    // Helper to create a slider row
    const createSlider = (container, label, key, min, max, step, defaultVal, formatFn) => {
      const row = container.createDiv({ cls: 'dmt-dungeon-slider-row' });
      row.createEl('label', { text: label });

      const sliderContainer = row.createDiv({ cls: 'dmt-dungeon-slider-container' });
      const slider = sliderContainer.createEl('input', {
        type: 'range',
        attr: { min: String(min), max: String(max), step: String(step) }
      });
      slider.value = String(defaultVal);

      const valueDisplay = sliderContainer.createSpan({
        cls: 'dmt-dungeon-slider-value',
        text: formatFn(defaultVal)
      });

      slider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        valueDisplay.textContent = formatFn(val);
        this.configOverrides[key] = val;
        this.updateVisualizer();
      });

      // Store reference for style sync
      this.sliderRefs[key] = { slider, valueDisplay, formatFn };

      return { slider, valueDisplay };
    };
    
    // Percentage formatter
    const pct = (v) => \`\${Math.round(v * 100)}%\`;
    // Bias formatter  
    const biasLabel = (v) => {
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
    
    // Corridor style toggle
    const corridorRow = advancedContent.createDiv({ cls: 'dmt-dungeon-slider-row' });
    corridorRow.createEl('label', { text: 'Corridor Style' });
    const corridorToggleContainer = corridorRow.createDiv({ cls: 'dmt-dungeon-toggle-container' });

    const corridorSelect = corridorToggleContainer.createEl('select', { cls: 'dmt-dungeon-select' });
    corridorSelect.createEl('option', { value: 'straight', text: 'Straight' });
    corridorSelect.createEl('option', { value: 'organic', text: 'Organic' });
    corridorSelect.createEl('option', { value: 'diagonal', text: 'Diagonal' });
    corridorSelect.value = 'straight';
    this.corridorSelect = corridorSelect; // Store reference for style sync

    corridorSelect.addEventListener('change', (e) => {
      this.configOverrides.corridorStyle = e.target.value;
      this.updateVisualizer();
    });

    // Diagonal corridor chance slider
    const diagonalLabel = (v) => v === 0 ? 'None' : \`\${Math.round(v * 100)}%\`;
    createSlider(advancedContent, 'Diagonal Corridors', 'diagonalCorridorChance', 0, 1, 0.1, 0.5, diagonalLabel);

    // Environment section
    advancedContent.createEl('div', { cls: 'dmt-dungeon-section-header', text: 'Environment' });

    const waterLabel = (v) => v === 0 ? 'None' : \`\${Math.round(v * 100)}%\`;
    createSlider(advancedContent, 'Water Features', 'waterChance', 0, 0.5, 0.05, 0.15, waterLabel);

    // Object placement section
    advancedContent.createEl('div', { cls: 'dmt-dungeon-section-header', text: 'Object Placement' });

    const densityLabel = (v) => v < 0.75 ? 'Sparse' : v > 1.25 ? 'Dense' : 'Normal';
    createSlider(advancedContent, 'Object Density', 'objectDensity', 0.5, 2, 0.1, 1.0, densityLabel);

    // Room templates toggle
    const templateRow = advancedContent.createDiv({ cls: 'dmt-dungeon-slider-row' });
    templateRow.createEl('label', { text: 'Room Templates' });
    const templateToggleContainer = templateRow.createDiv({ cls: 'dmt-dungeon-toggle-container' });
    const templateCheckbox = templateToggleContainer.createEl('input', {
      type: 'checkbox',
      attr: { id: 'dmt-template-toggle' }
    });
    templateCheckbox.checked = true; // Default to enabled
    templateToggleContainer.createEl('label', {
      attr: { for: 'dmt-template-toggle' },
      text: 'Enable',
      cls: 'dmt-checkbox-label'
    });
    templateCheckbox.addEventListener('change', (e) => {
      this.configOverrides.useTemplates = e.target.checked;
    });
    // Hint text below checkbox row
    advancedContent.createEl('div', {
      cls: 'dmt-checkbox-hint',
      text: 'Generates themed rooms (library, shrine, barracks) with appropriate objects'
    });

    advancedContent.createEl('div', { cls: 'dmt-dungeon-subsection', text: 'Room Categories' });
    createSlider(advancedContent, 'Monsters', 'monsterWeight', 0, 1, 0.05, 0.33, pct);
    createSlider(advancedContent, 'Empty Rooms', 'emptyWeight', 0, 1, 0.05, 0.33, pct);
    createSlider(advancedContent, 'Features', 'featureWeight', 0, 1, 0.05, 0.17, pct);
    createSlider(advancedContent, 'Traps', 'trapWeight', 0, 1, 0.05, 0.17, pct);

    // Auto-fog section
    advancedContent.createEl('div', { cls: 'dmt-dungeon-section-header', text: 'Solo Play' });

    const fogRow = advancedContent.createDiv({ cls: 'dmt-dungeon-slider-row' });
    fogRow.createEl('label', { text: 'Auto-Fog Dungeon' });
    const fogToggleContainer = fogRow.createDiv({ cls: 'dmt-dungeon-toggle-container' });
    const fogCheckbox = fogToggleContainer.createEl('input', {
      type: 'checkbox',
      attr: { id: 'dmt-fog-toggle' }
    });
    fogCheckbox.checked = false;
    fogToggleContainer.createEl('label', {
      attr: { for: 'dmt-fog-toggle' },
      text: 'Enable',
      cls: 'dmt-checkbox-label'
    });
    fogCheckbox.addEventListener('change', (e) => {
      this.configOverrides.autoFogEnabled = e.target.checked;
    });
    advancedContent.createEl('div', {
      cls: 'dmt-checkbox-hint',
      text: 'Cover dungeon with fog, revealing only the entrance room'
    });

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: 'dmt-modal-buttons' });
    
    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();
    
    const generateBtn = buttonContainer.createEl('button', { text: 'Generate', cls: 'mod-cta' });
    generateBtn.onclick = async () => {
      if (!this.dungeonSize) {
        // Brief visual feedback that size is required
        buttonRow.addClass('dmt-shake');
        setTimeout(() => buttonRow.removeClass('dmt-shake'), 300);
        return;
      }

      // Load generator
      try {
        const generator = await this.plugin.loadDungeonGenerator();

        // Build config overrides (only include non-null values)
        const overrides = {};
        for (const [key, val] of Object.entries(this.configOverrides)) {
          if (val !== null) overrides[key] = val;
        }

        const result = generator.generateDungeon(this.dungeonSize, undefined, overrides);
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
      } catch (err) {
        console.error('[Windrose] Dungeon generation failed:', err);
        new Notice('Failed to generate dungeon: ' + err.message);
      }
    };

    // Handle Enter key to submit (if size is selected)
    contentEl.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && this.dungeonSize) {
        e.preventDefault();
        try {
          const generator = await this.plugin.loadDungeonGenerator();

          // Build config overrides (only include non-null values)
          const overrides = {};
          for (const [key, val] of Object.entries(this.configOverrides)) {
            if (val !== null) overrides[key] = val;
          }

          const result = generator.generateDungeon(this.dungeonSize, undefined, overrides);
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
        } catch (err) {
          console.error('[Windrose] Dungeon generation failed:', err);
          new Notice('Failed to generate dungeon: ' + err.message);
        }
      }
    });
  }

  onClose() {
    if (this.visualizer) {
      this.visualizer.destroy();
      this.visualizer = null;
    }
    this.sliderRefs = {};
    this.corridorSelect = null;
    this.contentEl.empty();
  }
}`;