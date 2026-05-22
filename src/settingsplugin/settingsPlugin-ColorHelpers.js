return `// settingsPlugin-ColorHelpers.js
// Color palette resolution helpers - transforms raw settings into resolved color list
// This file is concatenated into the settings plugin template by the assembler

/**
 * Color palette resolution helpers
 * Transform raw settings into resolved color list
 */
const ColorHelpers = {
  /**
   * Get all resolved colors (built-in + custom, with overrides applied)
   * @param {Object} settings - Plugin settings
   * @returns {Array} Resolved color array with isBuiltIn, isModified flags
   */
  getResolved(settings) {
    const { colorPaletteOverrides = {}, customPaletteColors = [] } = settings;
    
    const resolvedBuiltIns = BUILT_IN_COLORS
      .filter(c => !colorPaletteOverrides[c.id]?.hidden)
      .map((c, index) => {
        const override = colorPaletteOverrides[c.id];
        if (override) {
          const { hidden, ...overrideProps } = override;
          return { 
            ...c, 
            ...overrideProps, 
            order: override.order ?? index,
            isBuiltIn: true, 
            isModified: true 
          };
        }
        return { ...c, order: index, isBuiltIn: true, isModified: false };
      });
    
    const resolvedCustom = customPaletteColors.map((c, index) => ({
      ...c,
      order: c.order ?? (100 + index),
      isCustom: true,
      isBuiltIn: false
    }));
    
    return [...resolvedBuiltIns, ...resolvedCustom].sort((a, b) => a.order - b.order);
  },
  
  /**
   * Get hidden color IDs
   * @param {Object} settings - Plugin settings
   * @returns {Set} Set of hidden color IDs
   */
  getHidden(settings) {
    const { colorPaletteOverrides = {} } = settings;
    return new Set(
      Object.entries(colorPaletteOverrides)
        .filter(([id, override]) => override.hidden)
        .map(([id]) => id)
    );
  }
};`;