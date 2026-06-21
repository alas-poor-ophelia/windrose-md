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
  UseToolStateOptions,
  UseToolStateResult,
  ToolStateValues,
  ToolStateActions
} from '#types/tools/tool.types';

import { useCallback, useEffect, useState } from 'preact/hooks';
import { DEFAULT_COLOR } from '../../drawing/colorOperations';


/**
 * Hook for managing tool and color state
 */
function useToolState(options: UseToolStateOptions = {}): UseToolStateResult {
  const {
    initialTool = 'select',
    initialColor = DEFAULT_COLOR,
    initialOpacity = 1,
    mapData = null,
    updateMapData = null
  } = options;

  // Tool selection state
  const [currentTool, setCurrentTool] = useState(initialTool);
  const [selectedObjectType, setSelectedObjectType] = useState<string | null>(null);

  // Color and opacity state
  const [selectedColor, setSelectedColor] = useState(initialColor);
  const [selectedOpacity, setSelectedOpacity] = useState(initialOpacity);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);

  // Freeform placement mode (tool modifier)
  const [freeformPlacementMode, setFreeformPlacementMode] = useState(false);

  // Initialize opacity from mapData when loaded
  useEffect(() => {
    if (!mapData) return;
    if (mapData.lastSelectedOpacity !== undefined) {
      setSelectedOpacity(mapData.lastSelectedOpacity);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mapData?.lastSelectedOpacity is the correct granular dep; full mapData resets opacity continuously
  }, [mapData?.lastSelectedOpacity]);

  // Handler to update opacity and persist to mapData
  const handleOpacityChange = useCallback((newOpacity: number) => {
    setSelectedOpacity(newOpacity);
    if (updateMapData && mapData) {
      updateMapData({
        ...mapData,
        lastSelectedOpacity: newOpacity
      });
    }
  }, [updateMapData, mapData]);

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
    setIsColorPickerOpen,
    freeformPlacementMode,
    setFreeformPlacementMode,
    handleOpacityChange
  };
}

export { useToolState };