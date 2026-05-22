/**
 * useAlignmentMode.ts
 *
 * Manages the alignment mode lifecycle: entering/exiting alignment mode,
 * tracking offsets, and coordinating with the settings modal.
 * Extracted from DungeonMapTracker.tsx.
 *
 * Note: useImageAlignment.ts handles the drag mechanics within alignment mode.
 * This hook handles the mode toggle and settings modal coordination.
 */

import type { MapData } from '#types/core/map.types';

import { useCallback, useState } from 'preact/hooks';

interface UseAlignmentModeOptions {
  mapData: MapData | null;
  updateMapData: (data: MapData) => void;
  setShowSettingsModal: (v: boolean) => void;
}

interface UseAlignmentModeResult {
  isAlignmentMode: boolean;
  alignmentOffsetX: number;
  alignmentOffsetY: number;
  returningFromAlignment: boolean;
  setReturningFromAlignment: (v: boolean) => void;
  handleOpenAlignmentMode: (currentX: number, currentY: number) => void;
  handleAlignmentOffsetChange: (newX: number, newY: number) => void;
  handleAlignmentGridSizeChange: (newSize: number) => void;
  handleAlignmentApply: (finalX: number, finalY: number) => void;
  handleAlignmentCancel: (originalX: number, originalY: number) => void;
}

function useAlignmentMode({ mapData, updateMapData, setShowSettingsModal }: UseAlignmentModeOptions): UseAlignmentModeResult {
  const [isAlignmentMode, setIsAlignmentMode] = useState(false);
  const [alignmentOffsetX, setAlignmentOffsetX] = useState(0);
  const [alignmentOffsetY, setAlignmentOffsetY] = useState(0);
  const [returningFromAlignment, setReturningFromAlignment] = useState(false);

  const handleOpenAlignmentMode = useCallback((currentX: number, currentY: number) => {
    setAlignmentOffsetX(currentX);
    setAlignmentOffsetY(currentY);
    setIsAlignmentMode(true);
    setShowSettingsModal(false);
  }, []);

  const handleAlignmentOffsetChange = useCallback((newX: number, newY: number) => {
    setAlignmentOffsetX(newX);
    setAlignmentOffsetY(newY);

    if (mapData && mapData.backgroundImage) {
      updateMapData({
        ...mapData,
        backgroundImage: {
          ...mapData.backgroundImage,
          offsetX: newX,
          offsetY: newY
        }
      });
    }
  }, [mapData, updateMapData]);

  const handleAlignmentGridSizeChange = useCallback((newSize: number) => {
    if (mapData && mapData.backgroundImage) {
      updateMapData({
        ...mapData,
        backgroundImage: {
          ...mapData.backgroundImage,
          imageGridSize: newSize
        }
      });
    }
  }, [mapData, updateMapData]);

  const handleAlignmentApply = useCallback((_finalX: number, _finalY: number) => {
    setIsAlignmentMode(false);
    setReturningFromAlignment(true);
    setShowSettingsModal(true);
  }, []);

  const handleAlignmentCancel = useCallback((originalX: number, originalY: number) => {
    setAlignmentOffsetX(originalX);
    setAlignmentOffsetY(originalY);

    if (mapData && mapData.backgroundImage) {
      updateMapData({
        ...mapData,
        backgroundImage: {
          ...mapData.backgroundImage,
          offsetX: originalX,
          offsetY: originalY
        }
      });
    }

    setIsAlignmentMode(false);
    setReturningFromAlignment(true);
    setShowSettingsModal(true);
  }, [mapData, updateMapData]);

  return {
    isAlignmentMode,
    alignmentOffsetX, alignmentOffsetY,
    returningFromAlignment, setReturningFromAlignment,
    handleOpenAlignmentMode,
    handleAlignmentOffsetChange, handleAlignmentGridSizeChange,
    handleAlignmentApply, handleAlignmentCancel
  };
}

export { useAlignmentMode };