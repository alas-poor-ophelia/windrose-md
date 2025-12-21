// settingsPlugin-IconHelpers.js
// Icon helpers for setting Lucide icons with fallback
// This file is concatenated into the settings plugin template by the assembler

/**
 * Icon helpers
 */
const IconHelpers = {
  /**
   * Set icon on element with fallback
   * @param {HTMLElement} el - Target element
   * @param {string} iconId - Lucide icon ID
   */
  set(el, iconId) {
    if (typeof setIcon !== 'undefined') {
      setIcon(el, iconId);
    } else {
      // Fallback: create a simple text representation
      const icons = {
        'pencil': '✎',
        'eye': '👁',
        'eye-off': '🚫',
        'rotate-ccw': '↺',
        'trash-2': '🗑',
        'grip-vertical': '⋮⋮',
        'x': '✕',
        'search': '🔍'
      };
      el.textContent = icons[iconId] || '?';
    }
  }
};