// Type declaration shim for objectPlacer.js
// The actual implementation is in objectPlacer.js with JSDoc annotations.

export interface CellPosition {
  x: number;
  y: number;
}

export interface PlacementZones {
  center: CellPosition[];
  corners: CellPosition[];
  walls: CellPosition[];
  doorAdjacent: CellPosition[];
  scattered: CellPosition[];
}

export interface CategoryWeights {
  monster: number;
  empty: number;
  feature: number;
  trap: number;
}

export interface RoomLike {
  id?: number | string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: string;
}

export interface PlacedObject {
  id: string;
  type: string;
  position: CellPosition;
  [key: string]: unknown;
}

export interface RoomAssignment {
  category: string;
  [key: string]: unknown;
}

export interface CorridorResult {
  cells: CellPosition[];
  byConnection: unknown[];
}

export interface RoomTemplate {
  name: string;
  objects: Array<{
    type: string;
    count: { min: number; max: number };
    placement: string;
    [key: string]: unknown;
  }>;
  minRoomSize: number;
}

export function rollWeightedCategory(weights: CategoryWeights): keyof CategoryWeights;
export function normalizeWeights(weights: CategoryWeights): CategoryWeights;
export function getObjectBudget(roomSize: number, densityMultiplier?: number): number;
export function identifyPlacementZones(
  roomCells: CellPosition[],
  room: RoomLike,
  doorPositions?: CellPosition[]
): PlacementZones;
export function selectValidTemplate(roomSize: number): RoomTemplate | null;
export function stockDungeon(
  rooms: RoomLike[],
  corridorResult: CorridorResult,
  doorPositions: CellPosition[],
  style?: string,
  config?: Record<string, unknown>,
  options?: { entryRoomId?: number | string; exitRoomId?: number | string; waterRoomIds?: (number | string)[] }
): { objects: PlacedObject[]; roomAssignments: Record<string | number, RoomAssignment> };

export const STYLE_OBJECT_POOLS: Record<string, Record<string, unknown[]>>;
export const ROOM_TEMPLATES: Record<string, RoomTemplate>;
