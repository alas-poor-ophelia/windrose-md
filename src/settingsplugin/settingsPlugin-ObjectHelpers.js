return `// settingsPlugin-ObjectHelpers.js
// Object resolution helpers - transforms raw settings into resolved object/category lists
// This file is concatenated into the settings plugin template by the assembler

/**
 * Object resolution helpers
 * Transform raw settings into resolved object/category lists
 */
const ObjectHelpers = {
  /**
   * Get all resolved object types (built-in + custom, with overrides applied)
   * @param {Object} settings - Plugin settings
   * @returns {Array} Resolved object array with isBuiltIn, isModified flags
   */
  getResolved(settings) {
    const { objectOverrides = {}, customObjects = [] } = settings;
    
    const resolvedBuiltIns = BUILT_IN_OBJECTS
      .filter(obj => !objectOverrides[obj.id]?.hidden)
      .map((obj, index) => {
        const override = objectOverrides[obj.id];
        const defaultOrder = index * 10;
        if (override) {
          const { hidden, ...overrideProps } = override;
          return { 
            ...obj, 
            ...overrideProps, 
            order: override.order ?? defaultOrder, 
            isBuiltIn: true, 
            isModified: true 
          };
        }
        return { ...obj, order: defaultOrder, isBuiltIn: true, isModified: false };
      });
    
    const resolvedCustom = customObjects.map((obj, index) => ({
      ...obj,
      order: obj.order ?? (1000 + index * 10),
      isCustom: true,
      isBuiltIn: false
    }));
    
    return [...resolvedBuiltIns, ...resolvedCustom];
  },
  
  /**
   * Get all resolved categories (built-in + custom, sorted by order)
   * @param {Object} settings - Plugin settings
   * @returns {Array} Sorted category array with isBuiltIn flag
   */
  getCategories(settings) {
    const { customCategories = [] } = settings;
    
    const resolvedBuiltIns = BUILT_IN_CATEGORIES.map(c => ({
      ...c,
      isBuiltIn: true,
      order: CATEGORY_ORDER[c.id] ?? 50
    }));
    
    const resolvedCustom = customCategories.map(c => ({
      ...c,
      isCustom: true,
      isBuiltIn: false,
      order: c.order ?? 100
    }));
    
    return [...resolvedBuiltIns, ...resolvedCustom].sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  },
  
  /**
   * Get hidden built-in objects
   * @param {Object} settings - Plugin settings
   * @returns {Array} Hidden objects with isBuiltIn, isHidden flags
   */
  getHidden(settings) {
    const { objectOverrides = {} } = settings;
    return BUILT_IN_OBJECTS
      .filter(obj => objectOverrides[obj.id]?.hidden)
      .map(obj => ({ ...obj, isBuiltIn: true, isHidden: true }));
  },
  
  /**
   * Get all categories including notes (for dropdowns)
   * @param {Object} settings - Plugin settings
   * @returns {Array} All categories
   */
  getAllCategories(settings) {
    const { customCategories = [] } = settings;
    const builtIn = BUILT_IN_CATEGORIES.map(c => ({ ...c, isBuiltIn: true }));
    const custom = customCategories.map(c => ({ ...c, isCustom: true }));
    return [...builtIn, ...custom];
  },
  
  /**
   * Get default ID order for a category (for drag/drop comparison)
   * @param {string} categoryId - Category ID
   * @param {Object} settings - Plugin settings
   * @returns {Array} Array of object IDs in default order
   */
  getDefaultIdOrder(categoryId, settings) {
    const { objectOverrides = {} } = settings;
    return BUILT_IN_OBJECTS
      .filter(o => o.category === categoryId && !objectOverrides[o.id]?.hidden)
      .map(o => o.id);
  },

  /**
   * Render an object's visual symbol into a container element
   * Handles image, icon, and symbol rendering with consistent priority
   * @param {Object} obj - Object with imagePath, iconClass, or symbol
   * @param {HTMLElement} container - Container element to render into
   * @param {Object} app - Obsidian app instance (for getResourcePath)
   * @param {Object} options - Optional size configuration { width, height }
   */
  renderObjectSymbol(obj, container, app, options = {}) {
    const { width = '20px', height = '20px' } = options;

    if (obj.imagePath) {
      const imgEl = container.createEl('img', {
        cls: 'dmt-settings-object-image',
        attr: { src: app.vault.adapter.getResourcePath(obj.imagePath), alt: obj.label }
      });
      imgEl.style.width = width;
      imgEl.style.height = height;
      imgEl.style.objectFit = 'contain';
    } else if (obj.iconClass && RPGAwesomeHelpers.isValid(obj.iconClass)) {
      const iconInfo = RPGAwesomeHelpers.getInfo(obj.iconClass);
      const iconSpan = container.createEl('span', { cls: 'ra' });
      iconSpan.textContent = iconInfo.char;
    } else {
      container.textContent = obj.symbol || '?';
    }
  }
};`;