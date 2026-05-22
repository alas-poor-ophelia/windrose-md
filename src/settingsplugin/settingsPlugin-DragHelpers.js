return `// settingsPlugin-DragHelpers.js
// Drag and drop helpers for reordering objects in the settings UI
// This file is concatenated into the settings plugin template by the assembler

/**
 * Drag and drop helpers
 */
const DragHelpers = {
  /**
   * Find element to insert before during drag operation
   * @param {HTMLElement} container - Container element
   * @param {number} y - Mouse Y position
   * @returns {HTMLElement|undefined} Element to insert before
   */
  getAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.dmt-settings-object-row:not(.dmt-dragging)')];
    
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }
};`;