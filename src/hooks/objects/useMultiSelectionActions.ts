/**
 * useMultiSelectionActions.ts
 *
 * Rotate / duplicate / delete for a multi-selection of objects and text
 * labels. The edits themselves are pure functions over the active layer so
 * they can be tested without a map context.
 */

import { useCallback } from 'preact/hooks';
import type { MapObject } from '#types/objects/object.types';
import type { TextLabel } from '#types/objects/note.types';
import type { MapType } from '#types/core/map.types';
import type { SelectedItem } from '#types/contexts/context.types';
import { useMapState, useMapOperations } from '../../context/MapContext';
import { useMapSelection } from '../../context/MapSelectionContext';
import { getActiveLayer } from '../../persistence/layerAccessor';
import { findDuplicateTarget, generateObjectId } from '../../objects/objectOperations';
import { rotateByIncrement } from '../../drawing/rotationOperations';

/** The parts of a layer a selection edit reads */
export interface SelectionLayerContent {
  objects?: MapObject[] | null;
  textLabels?: TextLabel[] | null;
}

export interface SelectionEdit {
  objects: MapObject[];
  textLabels: TextLabel[];
}

export interface RotateSelectionResult extends SelectionEdit {
  /** Per-item rotation updates for updateSelectedItemsData */
  updates: Array<{ id: string; rotation: number | undefined }>;
}

export interface DuplicateSelectionResult extends SelectionEdit {
  newSelectedItems: SelectedItem[];
  /** Objects with no free spot to land on */
  skippedObjects: number;
}

const defaultTextId = (): string => `text-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

/** Advance every selected object and label to the next rotation step. */
export function rotateSelection(layer: SelectionLayerContent, items: SelectedItem[]): RotateSelectionResult {
  const objects = [...(layer.objects ?? [])];
  const textLabels = [...(layer.textLabels ?? [])];

  for (const item of items) {
    if (item.type === 'object') {
      const idx = objects.findIndex(o => o.id === item.id);
      if (idx !== -1) {
        const obj = objects[idx];
        objects[idx] = { ...obj, rotation: rotateByIncrement(obj.rotation ?? 0) };
      }
    } else if (item.type === 'text') {
      const idx = textLabels.findIndex(l => l.id === item.id);
      if (idx !== -1) {
        const label = textLabels[idx];
        textLabels[idx] = { ...label, rotation: rotateByIncrement(label.rotation ?? 0) };
      }
    }
  }

  const updates = items.map(item => {
    if (item.type === 'object') {
      const obj = objects.find(o => o.id === item.id);
      return obj ? { id: item.id, rotation: obj.rotation } : null;
    }
    const label = textLabels.find(l => l.id === item.id);
    return label ? { id: item.id, rotation: label.rotation } : null;
  }).filter((x): x is { id: string; rotation: number | undefined } => x !== null);

  return { objects, textLabels, updates };
}

/**
 * Copy every selected object and label. Objects follow the single-duplicate
 * placement rules (findDuplicateTarget); labels shift one gridSize right.
 */
export function duplicateSelection(
  layer: SelectionLayerContent,
  items: SelectedItem[],
  mapType: MapType,
  gridSize: number | undefined,
  makeTextId: () => string = defaultTextId
): DuplicateSelectionResult {
  const objects = [...(layer.objects ?? [])];
  const textLabels = [...(layer.textLabels ?? [])];
  const newSelectedItems: SelectedItem[] = [];
  let skippedObjects = 0;

  for (const item of items) {
    if (item.type === 'object') {
      const sourceObj = layer.objects?.find(o => o.id === item.id);
      if (!sourceObj) continue;

      // Same placement rules as single duplicate: first free neighbour, then
      // rings; hex gets a free slot. Searching the growing list keeps copies
      // made earlier in this loop from landing on each other.
      const dest = findDuplicateTarget(objects, sourceObj, mapType);
      if (!dest) {
        skippedObjects++;
        continue;
      }

      const newId = generateObjectId();
      const newObj: MapObject = { ...sourceObj, id: newId, position: { x: dest.x, y: dest.y } };
      if (dest.slot !== undefined) newObj.slot = dest.slot;
      objects.push(newObj);
      newSelectedItems.push({ type: 'object', id: newId, data: newObj });
    } else if (item.type === 'text') {
      const sourceLabel = layer.textLabels?.find(l => l.id === item.id);
      if (!sourceLabel) continue;

      const newId = makeTextId();
      const offsetWorld = gridSize ?? 32;
      const newLabel = {
        ...sourceLabel,
        id: newId,
        position: { x: sourceLabel.position.x + offsetWorld, y: sourceLabel.position.y }
      };
      textLabels.push(newLabel);
      newSelectedItems.push({ type: 'text', id: newId, data: newLabel });
    }
  }

  return { objects, textLabels, newSelectedItems, skippedObjects };
}

/** Remove every selected object and label. */
export function deleteSelection(layer: SelectionLayerContent, items: SelectedItem[]): SelectionEdit {
  const objectIds = new Set(items.filter(i => i.type === 'object').map(i => i.id));
  const textIds = new Set(items.filter(i => i.type === 'text').map(i => i.id));
  return {
    objects: (layer.objects ?? []).filter(obj => !objectIds.has(obj.id)),
    textLabels: (layer.textLabels ?? []).filter(label => !textIds.has(label.id))
  };
}

export interface MultiSelectionActions {
  handleRotateAll: () => void;
  handleDuplicateAll: () => void;
  handleDeleteAll: () => void;
}

/**
 * @param onObjectsChange - ObjectLayer's objects callback. Objects commit with
 *   suppressHistory, then the text-label commit records the single history entry.
 */
export function useMultiSelectionActions(
  onObjectsChange: (objects: MapObject[], suppressHistory?: boolean) => void
): MultiSelectionActions {
  const { mapData } = useMapState();
  const { onTextLabelsChange } = useMapOperations();
  const { selectedItems, hasMultiSelection, selectMultiple, clearSelection, updateSelectedItemsData } = useMapSelection();

  const handleRotateAll = useCallback(() => {
    if (!hasMultiSelection || !mapData) return;
    const { objects, textLabels, updates } = rotateSelection(getActiveLayer(mapData), selectedItems);
    onObjectsChange(objects, true);
    onTextLabelsChange(textLabels, false);
    updateSelectedItemsData(updates);
  }, [hasMultiSelection, mapData, selectedItems, onObjectsChange, onTextLabelsChange, updateSelectedItemsData]);

  const handleDuplicateAll = useCallback(() => {
    if (!hasMultiSelection || !mapData) return;
    const { objects, textLabels, newSelectedItems, skippedObjects } =
      duplicateSelection(getActiveLayer(mapData), selectedItems, mapData.mapType, mapData.gridSize);
    onObjectsChange(objects, true);
    onTextLabelsChange(textLabels, false);
    if (skippedObjects > 0) {
      console.warn(`No empty space found for ${skippedObjects} duplicate(s)`);
    }
    if (newSelectedItems.length > 0) {
      selectMultiple(newSelectedItems);
    }
  }, [hasMultiSelection, mapData, selectedItems, onObjectsChange, onTextLabelsChange, selectMultiple]);

  const handleDeleteAll = useCallback(() => {
    if (!hasMultiSelection || !mapData) return;
    const { objects, textLabels } = deleteSelection(getActiveLayer(mapData), selectedItems);
    onObjectsChange(objects, true);
    onTextLabelsChange(textLabels, false);
    clearSelection();
  }, [hasMultiSelection, mapData, selectedItems, onObjectsChange, onTextLabelsChange, clearSelection]);

  return { handleRotateAll, handleDuplicateAll, handleDeleteAll };
}
