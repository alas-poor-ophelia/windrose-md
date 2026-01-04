/**
 * React Context Type Definitions
 * Path: types/contexts/context.types.ts
 * 
 * Context value shapes for MapSettingsContext, MapSelectionContext, etc.
 * Populated during Tier 6a (Context component) migration.
 */

import type { MapObject } from '../objects/object.types';
import type { TextLabel } from '../objects/note.types';
import type { IGeometry, Point } from '../core/geometry.types';
import type { MapData } from '../core/map.types';
import type { Cell } from '../core/cell.types';

// ===========================================
// Context Types - YAGNI Pattern
// ===========================================
//
// Context value types are defined inline in their respective component files.
// Hooks provide full type inference, so explicit imports are rarely needed.
//
// If you need to type a variable explicitly, import from the component:
//   import type { MapSettingsContextValue } from 'context/MapSettingsContext';
//   import type { MapSelectionContextValue } from 'context/MapSelectionContext';
//   import type { EventHandlerContextValue } from 'context/EventHandlerContext';
//
// ===========================================

// ===========================================
// MapContext (Main)
// ===========================================

/** Edge info from geometry */
export interface EdgeInfo {
  x: number;
  y: number;
  side: string;
}

/** Edge type for edge drawing */
export interface Edge {
  x: number;
  y: number;
  side: string;
  color: string;
  opacity?: number;
}

/** Extended geometry interface with grid-specific methods */
export interface ExtendedGeometry extends IGeometry {
  cellSize: number;
  screenToEdge?: (worldX: number, worldY: number, threshold: number) => EdgeInfo | null;
}

/** MapStateContext value shape */
export interface MapStateContextValue {
  geometry: ExtendedGeometry | null;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  mapData: MapData | null;
  screenToGrid: (clientX: number, clientY: number) => Point | null;
  screenToWorld: (clientX: number, clientY: number) => { worldX: number; worldY: number } | null;
  getClientCoords: (e: PointerEvent | MouseEvent | TouchEvent) => { clientX: number; clientY: number };
  currentTool?: string;
  GridGeometry?: new (cellSize: number) => ExtendedGeometry;
}

/** MapOperationsContext value shape */
export interface MapOperationsContextValue {
  onCellsChange: (cells: Cell[], skipHistory?: boolean) => void;
  onObjectsChange: (objects: MapObject[]) => void;
  onTextLabelsChange: (labels: TextLabel[]) => void;
  onEdgesChange: (edges: Edge[], skipHistory?: boolean) => void;
  onNotePinsChange?: (pins: unknown[]) => void;
  onMapDataUpdate?: (updater: (data: MapData | null) => MapData | null) => void;
  getTextLabelAtPosition: (labels: TextLabel[], worldX: number, worldY: number, ctx: CanvasRenderingContext2D | null) => TextLabel | null;
  removeTextLabel: (labels: TextLabel[], id: string) => TextLabel[];
  getObjectAtPosition: (objects: MapObject[], x: number, y: number) => MapObject | null;
  removeObjectAtPosition: (objects: MapObject[], x: number, y: number) => MapObject[];
  removeObjectsInRectangle: (objects: MapObject[], x1: number, y1: number, x2: number, y2: number) => MapObject[];
  getNotePinAtPosition?: (pins: unknown[], worldX: number, worldY: number, cellSize: number) => unknown | null;
}