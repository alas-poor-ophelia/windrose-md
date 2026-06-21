/**
 * useSegmentPicker.ts
 *
 * Manages the segment picker modal for touch-based segment selection.
 */

import type { IGeometry } from '#types/core/geometry.types';
import type { Cell, SegmentName } from '#types/core/cell.types';
import { isGridCell } from '#types/core/cell.types';
import type { MapData } from '#types/core/map.types';
import type { SegmentPickerCell } from '#types/hooks/drawingTools.types';

import { useState } from 'preact/hooks';
import { setSegments } from '../../geometry/core/cellAccessor';
import { getActiveLayer } from '../../persistence/layerAccessor';








interface UseSegmentPickerOptions {
  mapData: MapData | null;
  geometry: IGeometry | null;
  selectedColor: string;
  selectedOpacity: number;
  onCellsChange: (cells: Cell[], skipHistory?: boolean) => void;
}

interface UseSegmentPickerResult {
  segmentPickerOpen: boolean;
  segmentPickerCell: SegmentPickerCell | null;
  segmentPickerExistingCell: Cell | null;
  savedSegments: SegmentName[];
  rememberSegments: boolean;
  openSegmentPicker: (cellX: number, cellY: number) => void;
  closeSegmentPicker: () => void;
  applySegmentSelection: (selectedSegments: SegmentName[], shouldRemember?: boolean) => void;
}

function useSegmentPicker({
  mapData, geometry, selectedColor, selectedOpacity, onCellsChange
}: UseSegmentPickerOptions): UseSegmentPickerResult {

  const [segmentPickerOpen, setSegmentPickerOpen] = useState<boolean>(false);
  const [segmentPickerCell, setSegmentPickerCell] = useState<SegmentPickerCell | null>(null);
  const [segmentPickerExistingCell, setSegmentPickerExistingCell] = useState<Cell | null>(null);
  const [savedSegments, setSavedSegments] = useState<SegmentName[]>([]);
  const [rememberSegments, setRememberSegments] = useState<boolean>(true);

  const openSegmentPicker = (cellX: number, cellY: number): void => {
    if (!mapData || !geometry) return;

    const activeLayer = getActiveLayer(mapData);

    const existingCell = activeLayer.cells.find((c: Cell) =>
      isGridCell(c) && c.x === cellX && c.y === cellY
    );

    setSegmentPickerCell({ x: cellX, y: cellY });
    setSegmentPickerExistingCell(existingCell ?? null);
    setSegmentPickerOpen(true);
  };

  const closeSegmentPicker = (): void => {
    setSegmentPickerOpen(false);
    setSegmentPickerCell(null);
    setSegmentPickerExistingCell(null);
  };

  const applySegmentSelection = (selectedSegments: SegmentName[], shouldRemember: boolean = true): void => {
    if (!mapData || !geometry || !segmentPickerCell) return;

    if (shouldRemember) {
      setSavedSegments(selectedSegments);
      setRememberSegments(true);
    } else {
      setRememberSegments(false);
    }

    const activeLayer = getActiveLayer(mapData);

    let newCells = activeLayer.cells.filter((c: Cell) =>
      !(isGridCell(c) && c.x === segmentPickerCell.x && c.y === segmentPickerCell.y)
    );

    if (selectedSegments.length > 0) {
      const coords = { x: segmentPickerCell.x, y: segmentPickerCell.y };

      newCells = setSegments(
        newCells,
        coords,
        selectedSegments,
        selectedColor,
        selectedOpacity,
        geometry
      );
    }

    onCellsChange(newCells);

    closeSegmentPicker();
  };

  return {
    segmentPickerOpen, segmentPickerCell, segmentPickerExistingCell,
    savedSegments, rememberSegments,
    openSegmentPicker, closeSegmentPicker, applySegmentSelection
  };
}

export { useSegmentPicker };