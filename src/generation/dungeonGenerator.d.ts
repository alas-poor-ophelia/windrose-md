export interface DungeonRoom {
  id: number | string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: string;
}

export interface CellCoord {
  x: number;
  y: number;
}

export interface DungeonCell extends CellCoord {
  color: string;
  segments?: Record<string, boolean>;
  opacity?: number;
}

export interface WallEdge {
  x: number;
  y: number;
  side: string;
  color: string;
}

export interface DungeonObject {
  id: string;
  type: string;
  position: CellCoord;
  rotation?: number;
}

export interface CorridorResult {
  cells: DungeonCell[];
  byConnection: Array<{ cells: DungeonCell[]; orderedPath: CellCoord[]; width: number; hasDiagonals?: boolean }>;
}

export interface DungeonResult {
  cells: DungeonCell[];
  objects: DungeonObject[];
  edges: WallEdge[];
  metadata: {
    rooms: DungeonRoom[];
    connections: Array<[number, number]>;
    gridWidth: number;
    gridHeight: number;
    roomCount: number;
    doorCount: number;
    secretDoorCount: number;
    hasWideCorridors: boolean;
    hasDiagonalCorridors: boolean;
    entryRoomId?: number;
    exitRoomId?: number;
    waterRoomIds: number[];
    corridorResult: CorridorResult;
    doorPositions: CellCoord[];
    style: string;
  };
}

export interface DungeonPreset {
  gridWidth: number;
  gridHeight: number;
  roomCount: { min: number; max: number };
  roomSize: { minWidth: number; maxWidth: number; minHeight: number; maxHeight: number };
  padding: number;
  corridorWidth: number;
  corridorStyle: string;
  circleChance: number;
  complexRoomChance: number;
  loopChance: number;
  doorChance: number;
  secretDoorChance: number;
  wideCorridorChance: number;
  diagonalCorridorChance: number;
}

export function isAtCorridorIntersection(
  pos: CellCoord,
  corridorCellSet: Set<string>,
  rooms: DungeonRoom[]
): boolean;
export function isCellAdjacentToRoomForOpening(
  x: number,
  y: number,
  room: DungeonRoom
): boolean;
export function isCellInRoom(x: number, y: number, room: DungeonRoom): boolean;
export function calculateRoomOpeningWidth(
  doorPos: CellCoord,
  room: DungeonRoom,
  carvedCellSet: Set<string>,
  alignment: string,
  corridorCellSet: Set<string> | null
): { width: number; cells: CellCoord[] };
export function generateWallEdgesForCells(
  cells: CellCoord[],
  alignment: string
): WallEdge[];
export function generateAllRoomBoundaryEdges(
  rooms: DungeonRoom[],
  corridorCellSet: Set<string>,
  doorPositions: CellCoord[]
): WallEdge[];
export function generateDungeon(
  presetName?: string,
  color?: string,
  configOverrides?: Partial<DungeonPreset> & Record<string, unknown>
): DungeonResult;

export const DUNGEON_PRESETS: Record<string, DungeonPreset>;
export const DUNGEON_STYLES: Record<string, { name: string; overrides: Partial<DungeonPreset> }>;
export const DEFAULT_FLOOR_COLOR: string;
export const DEFAULT_WATER_COLOR: string;
export const DEFAULT_WATER_OPACITY: number;
export const DIAGONAL_SEGMENTS: Record<string, Record<string, boolean>>;
