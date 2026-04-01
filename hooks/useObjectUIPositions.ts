/**
 * useObjectUIPositions.ts
 *
 * Button position calculations for object UI overlays.
 * Extracted from useObjectInteractions.ts (Phase 4.1).
 */

import type { IGeometry } from '#types/core/geometry.types';
import type { MapData } from '#types/core/map.types';
import type { MapObject } from '#types/objects/object.types';
import type { ButtonPosition } from '#types/hooks/objectInteractions.types';
import type { MapStateContextValue, MapSelectionContextValue } from '#types/contexts/context.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

interface ScreenPositionResult {
  screenX: number;
  screenY: number;
  objectWidth: number;
  objectHeight: number;
}

const { calculateObjectScreenPosition: calculateScreenPos } = await requireModuleByName("screenPositionUtils.ts") as {
  calculateObjectScreenPosition: (object: MapObject, canvas: HTMLCanvasElement, mapData: MapData, geometry: IGeometry) => ScreenPositionResult | null;
};

const { getActiveLayer } = await requireModuleByName("layerAccessor.ts") as {
  getActiveLayer: (mapData: MapData) => { objects: MapObject[] };
};

const { useMapState } = await requireModuleByName("MapContext.tsx") as {
  useMapState: () => MapStateContextValue;
};

const { useMapSelection } = await requireModuleByName("MapSelectionContext.tsx") as {
  useMapSelection: () => MapSelectionContextValue;
};

const useObjectUIPositions = (): {
  calculateLabelButtonPosition: () => ButtonPosition;
  calculateLinkNoteButtonPosition: () => ButtonPosition;
  calculateResizeButtonPosition: () => ButtonPosition;
  calculateObjectColorButtonPosition: () => ButtonPosition;
} => {
  const { geometry, canvasRef, mapData } = useMapState();
  const { selectedItem } = useMapSelection();

  const calculateLabelButtonPosition = dc.useCallback((): ButtonPosition => {
    if (selectedItem?.type !== 'object' || !mapData || !canvasRef.current) {
      return { x: 0, y: 0 };
    }

    const object = getActiveLayer(mapData).objects.find((obj: MapObject) => obj.id === selectedItem.id);
    if (!object) return { x: 0, y: 0 };

    const pos = calculateScreenPos(object, canvasRef.current, mapData, geometry!);
    if (!pos) return { x: 0, y: 0 };

    const { screenX, screenY, objectWidth, objectHeight } = pos;
    const buttonOffset = 4;

    const buttonX = screenX + (objectWidth / 2) + buttonOffset;
    const buttonY = screenY - (objectHeight / 2) - buttonOffset - 22;

    return { x: buttonX, y: buttonY };
  }, [selectedItem, mapData, canvasRef, geometry]
  );

  const calculateLinkNoteButtonPosition = dc.useCallback((): ButtonPosition => {
    if (selectedItem?.type !== 'object' || !mapData || !canvasRef.current) {
      return { x: 0, y: 0 };
    }

    const object = getActiveLayer(mapData).objects.find((obj: MapObject) => obj.id === selectedItem.id);
    if (!object) return { x: 0, y: 0 };

    const pos = calculateScreenPos(object, canvasRef.current, mapData, geometry!);
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

  const calculateResizeButtonPosition = dc.useCallback((): ButtonPosition => {
    if (selectedItem?.type !== 'object' || !mapData || !canvasRef.current) {
      return { x: 0, y: 0 };
    }

    const object = getActiveLayer(mapData).objects.find((obj: MapObject) => obj.id === selectedItem.id);
    if (!object) return { x: 0, y: 0 };

    const pos = calculateScreenPos(object, canvasRef.current, mapData, geometry!);
    if (!pos) return { x: 0, y: 0 };

    const { screenX, screenY, objectWidth, objectHeight } = pos;
    const buttonOffset = 4;
    const buttonSize = 44;

    const buttonX = screenX - (objectWidth / 2) - buttonOffset - buttonSize;
    const buttonY = screenY - (objectHeight / 2) - buttonOffset - 22;

    return { x: buttonX, y: buttonY };
  }, [selectedItem, mapData, canvasRef, geometry]
  );

  const calculateObjectColorButtonPosition = dc.useCallback((): ButtonPosition => {
    if (selectedItem?.type !== 'object' || !mapData || !canvasRef.current) {
      return { x: 0, y: 0 };
    }

    const object = getActiveLayer(mapData).objects.find((obj: MapObject) => obj.id === selectedItem.id);
    if (!object) return { x: 0, y: 0 };

    const pos = calculateScreenPos(object, canvasRef.current, mapData, geometry!);
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

return { useObjectUIPositions };
