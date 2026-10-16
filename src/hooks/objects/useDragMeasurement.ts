/**
 * useDragMeasurement.ts
 *
 * "Measure movement" toggle for a single selected object: while the toggle is
 * on and the selection is being dragged, reports the distance from where the
 * drag started to where the object is now.
 */

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { MapData, MapType } from '#types/core/map.types';
import type { IGeometry, Point } from '#types/core/geometry.types';
import type { SelectedItem } from '#types/contexts/context.types';
import type { MapDistanceOverrides } from '#types/hooks/distanceMeasurement.types';
import type { PluginSettings } from '#types/settings/settings.types';
import { getActiveLayer } from '../../persistence/layerAccessor';
import { formatDistance, getEffectiveDistanceSettings } from '../../drawing/distanceOperations';
import { getSettings } from '../../core/settingsAccessor';

/**
 * Format the drag distance between two cells, or null when nothing has moved.
 * Pure: everything it reads is passed in.
 */
export function computeMeasureDistance(
  origin: Point,
  target: Point,
  geometry: Pick<IGeometry, 'getCellDistance'>,
  mapType: MapType,
  globalSettings: Partial<PluginSettings> | null | undefined,
  overrides: MapDistanceOverrides | null | undefined
): string | null {
  if (origin.x === target.x && origin.y === target.y) return null;
  const settings = getEffectiveDistanceSettings(mapType, globalSettings, overrides ?? null);
  const dist = geometry.getCellDistance(origin.x, origin.y, target.x, target.y, { diagonalRule: settings.gridDiagonalRule });
  return formatDistance(dist, settings.distancePerCell, settings.distanceUnit, settings.displayFormat);
}

export interface DragMeasurementOptions {
  selectedItem: SelectedItem | null;
  isDraggingSelection: boolean;
  mapData: MapData | null;
  geometry: Pick<IGeometry, 'getCellDistance'> | null;
  distanceOverrides?: MapDistanceOverrides | null;
}

export interface DragMeasurementResult {
  /** Whether the measure toggle is on */
  measureMovement: boolean;
  toggleMeasureMovement: () => void;
  /** Cell the drag started from (null when not measuring a drag) */
  measureOrigin: Point | null;
  /** Current cell of the dragged object (null when not measuring a drag) */
  measureTarget: Point | null;
  /** Formatted distance, or null when there is nothing to show */
  formattedMeasureDistance: string | null;
}

export function useDragMeasurement({
  selectedItem, isDraggingSelection, mapData, geometry, distanceOverrides
}: DragMeasurementOptions): DragMeasurementResult {
  const [measureMovement, setMeasureMovement] = useState(false);
  const measureOriginRef = useRef<Point | null>(null);

  useEffect(() => {
    setMeasureMovement(false);
    measureOriginRef.current = null;
  }, [selectedItem?.id]);

  // The origin is latched on the first render of a drag, before the drag has
  // moved the object, and cleared on the first render after it ends.
  if (isDraggingSelection && measureMovement && selectedItem?.type === 'object' && selectedItem.data && !measureOriginRef.current) {
    measureOriginRef.current = { x: selectedItem.data.position.x, y: selectedItem.data.position.y };
  }
  if (!isDraggingSelection) {
    measureOriginRef.current = null;
  }

  const toggleMeasureMovement = useCallback(() => {
    setMeasureMovement(prev => !prev);
  }, []);

  const origin = measureOriginRef.current;
  let measureTarget: Point | null = null;
  if (measureMovement && isDraggingSelection && origin && selectedItem?.id != null && selectedItem.id !== '' && mapData) {
    const obj = getActiveLayer(mapData).objects?.find(o => o.id === selectedItem.id);
    measureTarget = obj ? obj.position : null;
  }

  const formattedMeasureDistance = origin && measureTarget && geometry
    ? computeMeasureDistance(origin, measureTarget, geometry, mapData?.mapType ?? 'grid', getSettings() ?? {}, distanceOverrides)
    : null;

  return { measureMovement, toggleMeasureMovement, measureOrigin: origin, measureTarget, formattedMeasureDistance };
}
