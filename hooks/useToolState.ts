/**
 * useToolState.ts
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

// Type-only imports
import type {
  ToolId,
  UseToolStateOptions,
  UseToolStateResult,
  ToolStateValues,
  ToolStateActions
} from '#types/tools/tool.types';
import type { ObjectTypeId } from '#types/objects/object.types';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const { DEFAULT_COLOR } = await requireModuleByName("colorOperations.ts") as {
  DEFAULT_COLOR: string
};

/**
 * Hook for managing tool and color state
 */
function useToolState(options: UseToolStateOptions = {}): UseToolStateResult {
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
  const toolState: ToolStateValues = {
    currentTool,
    selectedObjectType,
    selectedColor,
    selectedOpacity,
    isColorPickerOpen
  };

  // Grouped actions object
  const toolActions: ToolStateActions = {
    setCurrentTool,
    setSelectedObjectType,
    setSelectedColor,
    setSelectedOpacity,
    setIsColorPickerOpen
  };

  return {
    toolState,
    toolActions,
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
