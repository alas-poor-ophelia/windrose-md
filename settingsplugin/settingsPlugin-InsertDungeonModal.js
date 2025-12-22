// settingsPlugin-InsertDungeonModal.js
// Modal for generating a random dungeon
// This file is concatenated into the settings plugin template by the assembler

/**
 * Modal for generating a random dungeon
 */
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
    // Config overrides - null means use preset default
    this.configOverrides = {
      circleChance: null,
      loopChance: null,
      doorChance: null,
      secretDoorChance: null,
      wideCorridorChance: null,
      roomSizeBias: null,
      corridorStyle: null,
      style: null
    };
  }
  
  // Get effective settings for visualizer (merge style + overrides)
  getVisualizerSettings() {
    // Base settings from style
    const styleSettings = {
      classic: { circleChance: 0.3, corridorStyle: 'straight', loopChance: 0.15 },
      cavern: { circleChance: 0.6, corridorStyle: 'organic', loopChance: 0.2 },
      fortress: { circleChance: 0, corridorStyle: 'straight', loopChance: 0.08 },
      crypt: { circleChance: 0.1, corridorStyle: 'straight', loopChance: 0.02 }
    };
    
    const base = styleSettings[this.dungeonStyle] || styleSettings.classic;
    
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
  
  // Generate dungeon and call the insert callback
  async generateAndInsert() {
    if (!this.dungeonSize) return false;
    
    try {
      const generator = await this.plugin.loadDungeonGenerator();
      
      // Build config overrides (only include non-null values)
      const overrides = {};
      for (const [key, val] of Object.entries(this.configOverrides)) {
        if (val !== null) overrides[key] = val;
      }
      
      const result = generator.generateDungeon(this.dungeonSize, undefined, overrides);
      
      await this.onInsert(this.mapName, result.cells, result.objects, {
        distancePerCell: this.distancePerCell,
        distanceUnit: this.distanceUnit,
        preset: this.dungeonSize,
        configOverrides: overrides,
        roomCount: result.metadata.roomCount,
        doorCount: result.metadata.doorCount
      });
      this.close();
      return true;
    } catch (err) {
      console.error('[Windrose] Dungeon generation failed:', err);
      alert('Failed to generate dungeon: ' + err.message);
      return false;
    }
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
        this.updateVisualizer();
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
    const chevron = advancedHeader.createSpan({ cls: 'dmt-dungeon-advanced-chevron', text: 'â–¶' });
    advancedHeader.createSpan({ text: 'Advanced Options' });
    
    const advancedContent = advancedContainer.createDiv({ cls: 'dmt-dungeon-advanced-content' });
    advancedContent.style.display = 'none';
    
    advancedHeader.onclick = () => {
      this.advancedOpen = !this.advancedOpen;
      advancedContent.style.display = this.advancedOpen ? 'block' : 'none';
      chevron.textContent = this.advancedOpen ? 'â–¼' : 'â–¶';
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
      
      return { slider, valueDisplay };
    };
    
    // Percentage formatter
    const pct = (v) => `${Math.round(v * 100)}%`;
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
    corridorSelect.value = 'straight';
    
    corridorSelect.addEventListener('change', (e) => {
      this.configOverrides.corridorStyle = e.target.value;
      this.updateVisualizer();
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
      await this.generateAndInsert();
    };
    
    // Handle Enter key to submit (if size is selected)
    contentEl.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && this.dungeonSize) {
        e.preventDefault();
        await this.generateAndInsert();
      }
    });
  }
  
  onClose() {
    if (this.visualizer) {
      this.visualizer.destroy();
      this.visualizer = null;
    }
    this.contentEl.empty();
  }
}