/**
 * useToolState.js
 * 
 * Manages tool selection and color/opacity state for DungeonMapTracker.
 * Extracts related state into a cohesive unit for better organization.
 * 
 * State managed:
 * - currentTool: Active drawing/interaction tool
 * - selectedObjectType: Object type for placement tool
 * - selectedColor: Active color for painting
 * - selectedOpacity: Opacity for painting (0-1)
 * - isColorPickerOpen: Whether color picker UI is visible
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { DEFAULT_COLOR } = await requireModuleByName("colorOperations.ts");

/**
 * Hook for managing tool and color state
 * 
 * @param {Object} options - Configuration options
 * @param {string} [options.initialTool='draw'] - Initial tool selection
 * @param {string} [options.initialColor=DEFAULT_COLOR] - Initial color
 * @param {number} [options.initialOpacity=1] - Initial opacity (0-1)
 * @returns {Object} Tool state and actions
 */
function useToolState(options = {}) {
  const {
    initialTool = 'draw',
    initialColor = DEFAULT_COLOR,
    initialOpacity = 1
  } = options;

  // Tool selection state
  const [currentTool, setCurrentTool] = dc.useState(initialTool);
  const [selectedObjectType, setSelectedObjectType] = dc.useState(null);
  
  // Color and opacity state
  const [selectedColor, setSelectedColor] = dc.useState(initialColor);
  const [selectedOpacity, setSelectedOpacity] = dc.useState(initialOpacity);
  const [isColorPickerOpen, setIsColorPickerOpen] = dc.useState(false);

  // Grouped state object for easy destructuring
  const toolState = {
    currentTool,
    selectedObjectType,
    selectedColor,
    selectedOpacity,
    isColorPickerOpen
  };

  // Grouped actions object
  const toolActions = {
    setCurrentTool,
    setSelectedObjectType,
    setSelectedColor,
    setSelectedOpacity,
    setIsColorPickerOpen
  };

  return {
    // Grouped access
    toolState,
    toolActions,
    
    // Direct access (for convenience when only a few values needed)
    currentTool,
    selectedObjectType,
    selectedColor,
    selectedOpacity,
    isColorPickerOpen,
    setCurrentTool,
    setSelectedObjectType,
    setSelectedColor,
    setSelectedOpacity,
    setIsColorPickerOpen
  };
}

return { useToolState };