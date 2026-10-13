/**
 * fogOperations.ts
 * Pure fog-of-war reducers: every function takes a MapLayer (or MapData for
 * initializeFogOfWar) and returns a new one. Re-exported from layerAccessor.ts
 * so existing importers do not change.
 */

import type { IGeometry } from '#types/core/geometry.types';
import type {
  MapData,
  MapLayer,
  LayerId,
  FoggedCell,
  FogState,
  FogBounds
} from '#types/core/map.types';

import { updateLayer } from './layerAccessor';

/**
 * Initialize fog of war for a layer (first use)
 * Creates the fogOfWar structure with empty foggedCells array
 */
function initializeFogOfWar(mapData: MapData, layerId: LayerId): MapData {
  return updateLayer(mapData, layerId, {
    fogOfWar: {
      enabled: true,
      foggedCells: [],
      texture: null
    }
  });
}

/**
 * Check if a cell is fogged
 */
function isCellFogged(layer: MapLayer, col: number, row: number): boolean {
  if (!layer.fogOfWar || !layer.fogOfWar.enabled) return false;
  return layer.fogOfWar.foggedCells.some(c => c.col === col && c.row === row);
}

/**
 * Add fog to a single cell
 */
function fogCell(layer: MapLayer, col: number, row: number): MapLayer {
  if (!layer.fogOfWar) return layer;
  if (isCellFogged(layer, col, row)) return layer; // Already fogged
  
  return {
    ...layer,
    fogOfWar: {
      ...layer.fogOfWar,
      foggedCells: [...layer.fogOfWar.foggedCells, { col, row }]
    }
  };
}

/**
 * Remove fog from a single cell (reveal it)
 */
function revealCell(layer: MapLayer, col: number, row: number): MapLayer {
  if (!layer.fogOfWar) return layer;
  
  return {
    ...layer,
    fogOfWar: {
      ...layer.fogOfWar,
      foggedCells: layer.fogOfWar.foggedCells.filter(
        c => !(c.col === col && c.row === row)
      )
    }
  };
}

/**
 * Normalize rectangle corners and apply a fog operation to cells within bounds.
 */
function modifyRectangleFog(
  layer: MapLayer,
  startCol: number,
  startRow: number,
  endCol: number,
  endRow: number,
  operation: 'fog' | 'reveal'
): MapLayer {
  if (!layer.fogOfWar) return layer;

  const minCol = Math.min(startCol, endCol);
  const maxCol = Math.max(startCol, endCol);
  const minRow = Math.min(startRow, endRow);
  const maxRow = Math.max(startRow, endRow);

  if (operation === 'reveal') {
    return {
      ...layer,
      fogOfWar: {
        ...layer.fogOfWar,
        foggedCells: layer.fogOfWar.foggedCells.filter(c =>
          c.col < minCol || c.col > maxCol || c.row < minRow || c.row > maxRow
        )
      }
    };
  }

  // fog: add cells not already fogged
  const existingSet = new Set(
    layer.fogOfWar.foggedCells.map(c => `${c.col},${c.row}`)
  );
  const newCells: FoggedCell[] = [];
  for (let col = minCol; col <= maxCol; col++) {
    for (let row = minRow; row <= maxRow; row++) {
      if (!existingSet.has(`${col},${row}`)) {
        newCells.push({ col, row });
      }
    }
  }
  if (newCells.length === 0) return layer;
  return {
    ...layer,
    fogOfWar: {
      ...layer.fogOfWar,
      foggedCells: [...layer.fogOfWar.foggedCells, ...newCells]
    }
  };
}

function fogRectangle(layer: MapLayer, startCol: number, startRow: number, endCol: number, endRow: number): MapLayer {
  return modifyRectangleFog(layer, startCol, startRow, endCol, endRow, 'fog');
}

function revealRectangle(layer: MapLayer, startCol: number, startRow: number, endCol: number, endRow: number): MapLayer {
  return modifyRectangleFog(layer, startCol, startRow, endCol, endRow, 'reveal');
}

/**
 * Add fog to all cells within bounds
 */
function fogAll(layer: MapLayer, bounds: FogBounds): MapLayer {
  if (!layer.fogOfWar) return layer;

  const allCells: FoggedCell[] = [];
  for (let col = 0; col < bounds.maxCol; col++) {
    for (let row = 0; row < bounds.maxRow; row++) {
      allCells.push({ col, row });
    }
  }
  
  return {
    ...layer,
    fogOfWar: {
      ...layer.fogOfWar,
      foggedCells: allCells
    }
  };
}

/**
 * Fog all painted cells on a layer
 * For unbounded maps where we only want to fog cells that have been drawn
 */
function fogPaintedCells(layer: MapLayer, geometry: IGeometry): MapLayer {
  if (!layer.fogOfWar) return layer;
  if (layer.cells.length === 0) return layer;
  if (typeof geometry.cellToOffsetCoords !== 'function') {
    console.warn('[fogPaintedCells] Invalid geometry provided');
    return layer;
  }
  
  const existingFogged = new Set(
    layer.fogOfWar.foggedCells.map(c => `${c.col},${c.row}`)
  );
  
  const newCells: FoggedCell[] = [];
  for (const cell of layer.cells) {
    const { col, row } = geometry.cellToOffsetCoords(cell);
    const key = `${col},${row}`;
    if (!existingFogged.has(key)) {
      newCells.push({ col, row });
      existingFogged.add(key);
    }
  }
  
  if (newCells.length === 0) return layer;
  
  return {
    ...layer,
    fogOfWar: {
      ...layer.fogOfWar,
      foggedCells: [...layer.fogOfWar.foggedCells, ...newCells]
    }
  };
}

/**
 * Remove all fog from a layer (reveal everything)
 */
function revealAll(layer: MapLayer): MapLayer {
  if (!layer.fogOfWar) return layer;
  
  return {
    ...layer,
    fogOfWar: {
      ...layer.fogOfWar,
      foggedCells: []
    }
  };
}

/**
 * Toggle fog visibility without changing fogged cells
 */
function toggleFogVisibility(layer: MapLayer): MapLayer {
  if (!layer.fogOfWar) return layer;
  
  return {
    ...layer,
    fogOfWar: {
      ...layer.fogOfWar,
      enabled: !layer.fogOfWar.enabled
    }
  };
}

/**
 * Set fog visibility explicitly
 */
function setFogVisibility(layer: MapLayer, enabled: boolean): MapLayer {
  if (!layer.fogOfWar) return layer;
  
  return {
    ...layer,
    fogOfWar: {
      ...layer.fogOfWar,
      enabled
    }
  };
}

/**
 * Check if a layer has any fog data (regardless of visibility)
 */
function hasFogData(layer: MapLayer): boolean {
  return layer.fogOfWar != null && layer.fogOfWar.foggedCells.length > 0;
}

/**
 * Get fog state summary for UI display
 */
function getFogState(layer: MapLayer): FogState {
  if (!layer.fogOfWar) {
    return { initialized: false, enabled: false, cellCount: 0 };
  }
  return {
    initialized: true,
    enabled: layer.fogOfWar.enabled,
    cellCount: layer.fogOfWar.foggedCells.length
  };
}

export {
  initializeFogOfWar, isCellFogged, fogCell, revealCell,
  fogRectangle, revealRectangle, fogAll, fogPaintedCells, revealAll,
  toggleFogVisibility, setFogVisibility, hasFogData, getFogState
};
