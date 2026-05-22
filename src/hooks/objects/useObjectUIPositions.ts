/**
 * useObjectUIPositions.ts
 *
 * Button position calculations for object UI overlays.
 * Extracted from useObjectInteractions.ts (Phase 4.1).
 */

import type { MapObject } from '#types/objects/object.types';
import type { ButtonPosition } from '#types/hooks/objectInteractions.types';

import { useCallback } from 'preact/hooks';
import { calculateObjectScreenPosition as calculateScreenPos } from '../../objects/screenPositionUtils';
import { getActiveLayer } from '../../persistence/layerAccessor';
import { useMapState } from '../../context/MapContext';
import { useMapSelection } from '../../context/MapSelectionContext';













const useObjectUIPositions = (): {
  calculateLabelButtonPosition: () => ButtonPosition;
  calculateLinkNoteButtonPosition: () => ButtonPosition;
  calculateResizeButtonPosition: () => ButtonPosition;
  calculateObjectColorButtonPosition: () => ButtonPosition;
} => {
  const { geometry, canvasRef, mapData } = useMapState();
  const { selectedItem } = useMapSelection();

  const calculateLabelButtonPosition = useCallback((): ButtonPosition => {
    if (selectedItem?.type !== 'object' || !mapData || !canvasRef.current) {
      return { x: 0, y: 0 };
    }

    const object = getActiveLayer(mapData).objects.find((obj: MapObject) => obj.id === selectedItem.id);
    if (!object) return { x: 0, y: 0 };

    if (!geometry) return { x: 0, y: 0 };
    const pos = calculateScreenPos(object, canvasRef.current, mapData, geometry);
    if (!pos) return { x: 0, y: 0 };

    const { screenX, screenY, objectWidth, objectHeight } = pos;
    const buttonOffset = 4;

    const buttonX = screenX + (objectWidth / 2) + buttonOffset;
    const buttonY = screenY - (objectHeight / 2) - buttonOffset - 22;

    return { x: buttonX, y: buttonY };
  }, [selectedItem, mapData, canvasRef, geometry]
  );

  const calculateLinkNoteButtonPosition = useCallback((): ButtonPosition => {
    if (selectedItem?.type !== 'object' || !mapData || !canvasRef.current) {
      return { x: 0, y: 0 };
    }

    const object = getActiveLayer(mapData).objects.find((obj: MapObject) => obj.id === selectedItem.id);
    if (!object) return { x: 0, y: 0 };

    if (!geometry) return { x: 0, y: 0 };
    const pos = calculateScreenPos(object, canvasRef.current, mapData, geometry);
    if (!pos) return { x: 0, y: 0 };

    const { screenX, screenY, objectWidth, objectHeight } = pos;
    const buttonOffset = 4;
    const buttonHeight = 44;
    const minSpacing = 8;

    let buttonY = screenY + (objectHeight / 2) + buttonOffset;

    const addEditNoteButtonBottom = screenY - (objectHeight / 2) - buttonOffset - 22 + buttonHeight;

    if (buttonY - 22 < addEditNoteButtonBottom + minSpacing) {
      buttonY = addEditNoteButtonBottom + minSpacing + 22;
    }

    const buttonX = screenX + (objectWidth / 2) + buttonOffset;

    return { x: buttonX, y: buttonY - 22 };
  }, [selectedItem, mapData, canvasRef, geometry]
  );

  const calculateResizeButtonPosition = useCallback((): ButtonPosition => {
    if (selectedItem?.type !== 'object' || !mapData || !canvasRef.current) {
      return { x: 0, y: 0 };
    }

    const object = getActiveLayer(mapData).objects.find((obj: MapObject) => obj.id === selectedItem.id);
    if (!object) return { x: 0, y: 0 };

    if (!geometry) return { x: 0, y: 0 };
    const pos = calculateScreenPos(object, canvasRef.current, mapData, geometry);
    if (!pos) return { x: 0, y: 0 };

    const { screenX, screenY, objectWidth, objectHeight } = pos;
    const buttonOffset = 4;
    const buttonSize = 44;

    const buttonX = screenX - (objectWidth / 2) - buttonOffset - buttonSize;
    const buttonY = screenY - (objectHeight / 2) - buttonOffset - 22;

    return { x: buttonX, y: buttonY };
  }, [selectedItem, mapData, canvasRef, geometry]
  );

  const calculateObjectColorButtonPosition = useCallback((): ButtonPosition => {
    if (selectedItem?.type !== 'object' || !mapData || !canvasRef.current) {
      return { x: 0, y: 0 };
    }

    const object = getActiveLayer(mapData).objects.find((obj: MapObject) => obj.id === selectedItem.id);
    if (!object) return { x: 0, y: 0 };

    if (!geometry) return { x: 0, y: 0 };
    const pos = calculateScreenPos(object, canvasRef.current, mapData, geometry);
    if (!pos) return { x: 0, y: 0 };

    const { screenX, screenY, objectWidth, objectHeight } = pos;
    const buttonOffset = 4;
    const buttonSize = 44;
    const buttonHeight = 44;
    const minSpacing = 8;

    let buttonY = screenY + (objectHeight / 2) + buttonOffset;

    const resizeButtonBottom = screenY - (objectHeight / 2) - buttonOffset - 22 + buttonHeight;

    if (buttonY - 22 < resizeButtonBottom + minSpacing) {
      buttonY = resizeButtonBottom + minSpacing + 22;
    }

    const buttonX = screenX - (objectWidth / 2) - buttonOffset - buttonSize;

    return { x: buttonX, y: buttonY - 22 };
  }, [selectedItem, mapData, canvasRef, geometry]
  );

  return {
    calculateLabelButtonPosition,
    calculateLinkNoteButtonPosition,
    calculateResizeButtonPosition,
    calculateObjectColorButtonPosition
  };
};

export { useObjectUIPositions };