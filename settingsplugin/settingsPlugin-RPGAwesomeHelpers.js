// settingsPlugin-RPGAwesomeHelpers.js
// RPGAwesome icon helpers for the icon picker UI
// This file is concatenated into the settings plugin template by the assembler

/**
 * RPGAwesome icon helpers
 */
const RPGAwesomeHelpers = {
  /**
   * Get icons filtered by category
   * @param {string} categoryId - Category ID or 'all'
   * @returns {Array} Array of { iconClass, char, label, category }
   */
  getByCategory(categoryId) {
    const icons = Object.entries(RA_ICONS).map(([iconClass, data]) => ({
      iconClass,
      ...data
    }));
    
    if (categoryId === 'all') return icons;
    return icons.filter(i => i.category === categoryId);
  },
  
  /**
   * Search icons by label
   * @param {string} query - Search query
   * @returns {Array} Matching icons
   */
  search(query) {
    const q = query.toLowerCase().trim();
    if (!q) return this.getByCategory('all');
    
    return Object.entries(RA_ICONS)
      .filter(([iconClass, data]) => 
        iconClass.toLowerCase().includes(q) || 
        data.label.toLowerCase().includes(q)
      )
      .map(([iconClass, data]) => ({ iconClass, ...data }));
  },
  
  /**
   * Get sorted categories for tab display
   * @returns {Array} Array of { id, label, order }
   */
  getCategories() {
    return [...RA_CATEGORIES].sort((a, b) => a.order - b.order);
  },
  
  /**
   * Validate an icon class exists
   * @param {string} iconClass - Icon class to validate
   * @returns {boolean}
   */
  isValid(iconClass) {
    return iconClass && RA_ICONS.hasOwnProperty(iconClass);
  },
  
  /**
   * Get icon info
   * @param {string} iconClass - Icon class
   * @returns {Object|null} Icon data or null
   */
  getInfo(iconClass) {
    return RA_ICONS[iconClass] || null;
  }
};