/**
 * HexGeometry.ts
 * 
 * Handles all hex-specific geometric calculations and rendering.
 * Extends BaseGeometry to implement the standard geometry interface
 * for hexagonal grid-based maps.
 * 
 * COORDINATE SYSTEMS:
 * - Axial coordinates (q, r): Integer hex indices using axial coordinate system
 *   Used internally for hex math. Storage uses {q, r, color}.
 * 
 * - Point coordinates (x, y): API format where x=q, y=r
 *   Used for cross-geometry polymorphism with GridGeometry.
 * 
 * - Offset coordinates (col, row): Integer indices in rectangular space
 *   Used for bounds checking and rectangular iteration.
 * 
 * - World coordinates (worldX, worldY): Float pixel coordinates
 *   Used for positioning and measurements.
 * 
 * - Screen coordinates (screenX, screenY): Pixel coordinates on canvas
 *   Used for rendering with viewport transforms.
 * 
 * API CONSISTENCY:
 * - worldToGrid() returns Point {x, y} where x=q, y=r
 * - Collection methods return Point[] for polymorphism with GridGeometry
 * - Storage uses native {q, r, color} format (handled by cellAccessor)
 * 
 * @extends BaseGeometry
 */

// Type-only imports
import type {
  Point,
  WorldCoords,
  ScreenCoords,
  OffsetCoords,
  GridBounds,
  BoundingBox,
  GridStyle,
  DistanceOptions,
  Cell
} from '#types/core/geometry.types';
import type { HexBounds } from '#types/core/map.types';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const { BaseGeometry } = await requireModuleByName("BaseGeometry.ts") as {
  BaseGeometry: new () => InstanceType<typeof BaseGeometryClass>
};

const { axialToOffset, offsetToAxial, isWithinOffsetBounds } = await requireModuleByName("offsetCoordinates.js") as {
  axialToOffset: (q: number, r: number, orientation: string) => OffsetCoords;
  offsetToAxial: (col: number, row: number, orientation: string) => { q: number; r: number };
  isWithinOffsetBounds: (col: number, row: number, maxCol: number, maxRow: number) => boolean;
};

// Type for BaseGeometry class
declare class BaseGeometryClass {
  worldToScreen(worldX: number, worldY: number, offsetX: number, offsetY: number, zoom: number): ScreenCoords;
  screenToWorld(screenX: number, screenY: number, zoom: number): WorldCoords;
}

/** Axial coordinate pair */
interface AxialCoords {
  q: number;
  r: number;
}

/** Visible hex range */
interface VisibleHexRange {
  minQ: number;
  maxQ: number;
  minR: number;
  maxR: number;
}

class HexGeometry extends BaseGeometry {
  hexSize: number;
  orientation: 'flat' | 'pointy';
  bounds: HexBounds | null;
  sqrt3: number;
  width: number;
  height: number;
  horizSpacing: number;
  vertSpacing: number;

  /**
   * @param hexSize - Radius from hex center to vertex in pixels
   * @param orientation - Either 'flat' or 'pointy'
   * @param bounds - Optional bounds {maxCol, maxRow} in offset coordinates
   */
  constructor(hexSize: number, orientation: 'flat' | 'pointy' = 'flat', bounds: HexBounds | null = null) {
    super();
    this.hexSize = hexSize;
    this.orientation = orientation;
    this.bounds = bounds;
    
    // Precalculate commonly used values
    this.sqrt3 = Math.sqrt(3);
    
    // Layout constants depend on orientation
    if (orientation === 'flat') {
      this.width = hexSize * 2;
      this.height = hexSize * this.sqrt3;
      this.horizSpacing = hexSize * 1.5;
      this.vertSpacing = hexSize * this.sqrt3;
    } else {
      this.width = hexSize * this.sqrt3;
      this.height = hexSize * 2;
      this.horizSpacing = hexSize * this.sqrt3;
      this.vertSpacing = hexSize * 1.5;
    }
  }
  
  /**
   * Convert world coordinates to axial hex coordinates
   */
  worldToHex(worldX: number, worldY: number): AxialCoords {
    if (this.orientation === 'flat') {
      const q = (worldX * (2/3)) / this.hexSize;
      const r = ((-worldX / 3) + (this.sqrt3 / 3) * worldY) / this.hexSize;
      return this.roundHex(q, r);
    } else {
      const q = ((this.sqrt3 / 3) * worldX - (1/3) * worldY) / this.hexSize;
      const r = ((2/3) * worldY) / this.hexSize;
      return this.roundHex(q, r);
    }
  }
  
  /**
   * Convert world coordinates to grid coordinates (Point API)
   * Returns {x, y} where x=q, y=r for API consistency with GridGeometry
   */
  worldToGrid(worldX: number, worldY: number): Point {
    const { q, r } = this.worldToHex(worldX, worldY);
    return { x: q, y: r };
  }
  
  /**
   * Round fractional hex coordinates to nearest integer hex
   * Uses cube coordinate rounding for accuracy
   */
  roundHex(q: number, r: number): AxialCoords {
    const x = q;
    const z = r;
    const y = -x - z;
    
    let rx = Math.round(x);
    let ry = Math.round(y);
    let rz = Math.round(z);
    
    const xDiff = Math.abs(rx - x);
    const yDiff = Math.abs(ry - y);
    const zDiff = Math.abs(rz - z);
    
    if (xDiff > yDiff && xDiff > zDiff) {
      rx = -ry - rz;
    } else if (yDiff > zDiff) {
      ry = -rx - rz;
    } else {
      rz = -rx - ry;
    }
    
    return { q: rx, r: rz };
  }
  
  /**
   * Convert axial hex coordinates to world coordinates (hex center)
   */
  hexToWorld(q: number, r: number): WorldCoords {
    if (this.orientation === 'flat') {
      const worldX = this.hexSize * (3/2) * q;
      const worldY = this.hexSize * (this.sqrt3 / 2 * q + this.sqrt3 * r);
      return { worldX, worldY };
    } else {
      const worldX = this.hexSize * (this.sqrt3 * q + this.sqrt3 / 2 * r);
      const worldY = this.hexSize * (3/2) * r;
      return { worldX, worldY };
    }
  }
  
  /**
   * Alias for hexToWorld - provides consistent API with GridGeometry
   */
  gridToWorld(x: number, y: number): WorldCoords {
    return this.hexToWorld(x, y);
  }
  
  /**
   * Get the center point of a hex in world coordinates
   */
  getHexCenter(q: number, r: number): WorldCoords {
    return this.hexToWorld(q, r);
  }
  
  /**
   * Alias for getHexCenter with Point API naming
   */
  getCellCenter(x: number, y: number): WorldCoords {
    return this.hexToWorld(x, y);
  }
  
  /**
   * Convert offset coordinates to world coordinates
   */
  offsetToWorld(col: number, row: number): WorldCoords {
    const { q, r } = offsetToAxial(col, row, this.orientation);
    return this.hexToWorld(q, r);
  }
  
  /**
   * Get the six vertices of a hex in world coordinates
   */
  getHexVertices(q: number, r: number): WorldCoords[] {
    const center = this.hexToWorld(q, r);
    const vertices: WorldCoords[] = [];
    
    const angleOffset = this.orientation === 'flat' ? 0 : 30;
    
    for (let i = 0; i < 6; i++) {
      const angleDeg = 60 * i + angleOffset;
      const angleRad = (Math.PI / 180) * angleDeg;
      vertices.push({
        worldX: center.worldX + this.hexSize * Math.cos(angleRad),
        worldY: center.worldY + this.hexSize * Math.sin(angleRad)
      });
    }
    
    return vertices;
  }
  
  /**
   * Snap world coordinates to the nearest hex center
   */
  snapToHexCenter(worldX: number, worldY: number): WorldCoords {
    const { q, r } = this.worldToHex(worldX, worldY);
    return this.getHexCenter(q, r);
  }
  
  /**
   * Alias for snapToHexCenter
   */
  snapToCellCenter(worldX: number, worldY: number): WorldCoords {
    return this.snapToHexCenter(worldX, worldY);
  }
  
  /**
   * Calculate visible hex range for a given viewport
   */
  getVisibleHexRange(
    offsetX: number,
    offsetY: number,
    width: number,
    height: number,
    zoom: number
  ): VisibleHexRange {
    const topLeft = this.screenToWorld(-offsetX, -offsetY, zoom);
    const topRight = this.screenToWorld(width - offsetX, -offsetY, zoom);
    const bottomLeft = this.screenToWorld(-offsetX, height - offsetY, zoom);
    const bottomRight = this.screenToWorld(width - offsetX, height - offsetY, zoom);
    
    const corners = [
      this.worldToHex(topLeft.worldX, topLeft.worldY),
      this.worldToHex(topRight.worldX, topRight.worldY),
      this.worldToHex(bottomLeft.worldX, bottomLeft.worldY),
      this.worldToHex(bottomRight.worldX, bottomRight.worldY)
    ];
    
    const padding = 2;
    const minQ = Math.min(...corners.map(c => c.q)) - padding;
    const maxQ = Math.max(...corners.map(c => c.q)) + padding;
    const minR = Math.min(...corners.map(c => c.r)) - padding;
    const maxR = Math.max(...corners.map(c => c.r)) + padding;
    
    return { minQ, maxQ, minR, maxR };
  }
  
  /**
   * Convert hex coordinates to screen coordinates (for rendering)
   */
  gridToScreen(
    x: number,
    y: number,
    offsetX: number,
    offsetY: number,
    zoom: number
  ): ScreenCoords {
    const { worldX, worldY } = this.hexToWorld(x, y);
    
    const topLeftWorldX = worldX - (this.hexSize / 2);
    const topLeftWorldY = worldY - (this.hexSize / 2);
    
    return this.worldToScreen(topLeftWorldX, topLeftWorldY, offsetX, offsetY, zoom);
  }
  
  /**
   * Draw hex grid on the canvas using fill-based rendering
   */
  drawGrid(
    ctx: CanvasRenderingContext2D,
    offsetX: number,
    offsetY: number,
    width: number,
    height: number,
    zoom: number,
    style: GridStyle = {}
  ): void {
    const { lineColor = '#333333', lineWidth = 1 } = style;
    
    if (!isFinite(width) || !isFinite(height) || !isFinite(zoom) || 
        !isFinite(offsetX) || !isFinite(offsetY) || zoom <= 0) {
      console.warn('[HexGeometry.drawGrid] Invalid input values, skipping render');
      return;
    }
    
    let minCol: number, maxCol: number, minRow: number, maxRow: number;
    
    if (this.bounds) {
      minCol = 0;
      maxCol = this.bounds.maxCol - 1;
      minRow = 0;
      maxRow = this.bounds.maxRow - 1;
    } else {
      const diagonal = Math.sqrt(width * width + height * height) * 2;
      const expandedWidth = diagonal;
      const expandedHeight = diagonal;
      
      const { minQ, maxQ, minR, maxR } = this.getVisibleHexRange(
        offsetX, offsetY, expandedWidth, expandedHeight, zoom
      );
      
      const corner1 = axialToOffset(minQ, minR, this.orientation);
      const corner2 = axialToOffset(maxQ, maxR, this.orientation);
      const corner3 = axialToOffset(minQ, maxR, this.orientation);
      const corner4 = axialToOffset(maxQ, minR, this.orientation);
      
      minCol = Math.min(corner1.col, corner2.col, corner3.col, corner4.col);
      maxCol = Math.max(corner1.col, corner2.col, corner3.col, corner4.col);
      minRow = Math.min(corner1.row, corner2.row, corner3.row, corner4.row);
      maxRow = Math.max(corner1.row, corner2.row, corner3.row, corner4.row);
    }
    
    // Safety check on iteration count
    const totalHexes = (maxCol - minCol + 1) * (maxRow - minRow + 1);
    if (totalHexes > 50000 || !isFinite(totalHexes)) {
      console.warn(`[HexGeometry.drawGrid] Too many hexes to draw (${totalHexes}), aborting`);
      return;
    }
    
    // Use fill-based rendering to work around strokeStyle corruption
    ctx.fillStyle = lineColor;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    
    for (let col = minCol; col <= maxCol; col++) {
      for (let row = minRow; row <= maxRow; row++) {
        const { q, r } = offsetToAxial(col, row, this.orientation);
        
        if (!this.bounds || this.isWithinBounds(q, r)) {
          this.drawHexOutline(ctx, q, r, offsetX, offsetY, zoom, lineWidth);
        }
      }
    }
  }
  
  /**
   * Draw a line as a filled polygon (for fill-based rendering)
   * Works around strokeStyle corruption in Obsidian's Live Preview mode
   */
  drawLineAsFill(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    lineWidth: number
  ): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length === 0) return;
    
    const nx = -dy / length * (lineWidth / 2);
    const ny = dx / length * (lineWidth / 2);
    
    ctx.beginPath();
    ctx.moveTo(x1 + nx, y1 + ny);
    ctx.lineTo(x2 + nx, y2 + ny);
    ctx.lineTo(x2 - nx, y2 - ny);
    ctx.lineTo(x1 - nx, y1 - ny);
    ctx.closePath();
    ctx.fill();
  }
  
  /**
   * Draw a single hex outline using fill-based rendering
   */
  drawHexOutline(
    ctx: CanvasRenderingContext2D,
    q: number,
    r: number,
    offsetX: number,
    offsetY: number,
    zoom: number,
    lineWidth: number | null = null
  ): void {
    const vertices = this.getHexVertices(q, r);
    const width = lineWidth !== null ? lineWidth : (ctx.lineWidth || 1);
    
    const screenVertices = vertices.map(v => 
      this.worldToScreen(v.worldX, v.worldY, offsetX, offsetY, zoom)
    );
    
    for (let i = 0; i < 6; i++) {
      const v1 = screenVertices[i];
      const v2 = screenVertices[(i + 1) % 6];
      this.drawLineAsFill(ctx, v1.screenX, v1.screenY, v2.screenX, v2.screenY, width);
    }
  }
  
  /**
   * Draw a filled hex on the canvas (alias for drawCell)
   */
  drawHex(
    ctx: CanvasRenderingContext2D,
    q: number,
    r: number,
    offsetX: number,
    offsetY: number,
    zoom: number,
    color: string
  ): void {
    this.drawCell(ctx, q, r, offsetX, offsetY, zoom, color);
  }
  
  /**
   * Get the scaled hex size at current zoom
   */
  getScaledHexSize(zoom: number): number {
    return this.hexSize * zoom;
  }
  
  /**
   * Draw a filled hex on the canvas
   */
  drawCell(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    offsetX: number,
    offsetY: number,
    zoom: number,
    color: string
  ): void {
    const vertices = this.getHexVertices(x, y);
    const scaledVertices = vertices.map(v => 
      this.worldToScreen(v.worldX, v.worldY, offsetX, offsetY, zoom)
    );
    
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(scaledVertices[0].screenX, scaledVertices[0].screenY);
    for (let i = 1; i < scaledVertices.length; i++) {
      ctx.lineTo(scaledVertices[i].screenX, scaledVertices[i].screenY);
    }
    ctx.closePath();
    ctx.fill();
  }
  
  /**
   * Draw multiple cells of the same color
   */
  drawCells(
    ctx: CanvasRenderingContext2D,
    cells: Point[],
    offsetX: number,
    offsetY: number,
    zoom: number,
    color: string
  ): void {
    ctx.fillStyle = color;
    
    for (const cell of cells) {
      const vertices = this.getHexVertices(cell.x, cell.y);
      const scaledVertices = vertices.map(v => 
        this.worldToScreen(v.worldX, v.worldY, offsetX, offsetY, zoom)
      );
      
      ctx.beginPath();
      ctx.moveTo(scaledVertices[0].screenX, scaledVertices[0].screenY);
      for (let i = 1; i < scaledVertices.length; i++) {
        ctx.lineTo(scaledVertices[i].screenX, scaledVertices[i].screenY);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  
  /**
   * Get the scaled cell size at current zoom
   */
  getScaledCellSize(zoom: number): number {
    return this.hexSize * zoom;
  }
  
  /**
   * Check if coordinates are within bounds
   */
  isWithinBounds(x: number, y: number): boolean {
    if (!this.bounds) return true;
    
    const { col, row } = axialToOffset(x, y, this.orientation);
    return col >= 0 && col < this.bounds.maxCol && 
           row >= 0 && row < this.bounds.maxRow;
  }
  
  /**
   * Clamp coordinates to bounds
   */
  clampToBounds(x: number, y: number): Point {
    if (!this.bounds) return { x, y };
    
    const { col, row } = axialToOffset(x, y, this.orientation);
    const clampedCol = Math.max(0, Math.min(this.bounds.maxCol - 1, col));
    const clampedRow = Math.max(0, Math.min(this.bounds.maxRow - 1, row));
    
    const clamped = offsetToAxial(clampedCol, clampedRow, this.orientation);
    return { x: clamped.q, y: clamped.r };
  }
  
  /**
   * Convert grid coordinates to offset coordinates
   */
  toOffsetCoords(x: number, y: number): OffsetCoords {
    return axialToOffset(x, y, this.orientation);
  }
  
  /**
   * Convert a cell object to offset coordinates
   */
  cellToOffsetCoords(cell: Cell): OffsetCoords {
    if ('q' in cell) {
      return axialToOffset(cell.q, cell.r, this.orientation);
    }
    // GridCell format - x=q, y=r
    return axialToOffset(cell.x, cell.y, this.orientation);
  }
  
  /**
   * Check if this geometry has defined bounds
   */
  isBounded(): boolean {
    return this.bounds !== null;
  }
  
  /**
   * Get the bounds for this geometry
   */
  getBounds(): HexBounds | null {
    return this.bounds;
  }
  
  /**
   * Create a cell object in hex coordinate format
   * Accepts Point {x, y} where x=q, y=r
   */
  createCellObject(coords: Point, color: string): { q: number; r: number; color: string } {
    return { q: coords.x, r: coords.y, color };
  }
  
  /**
   * Check if a cell matches given coordinates
   * Accepts Point {x, y} where x=q, y=r
   */
  cellMatchesCoords(cell: Cell, coords: Point): boolean {
    if ('q' in cell) {
      return cell.q === coords.x && cell.r === coords.y;
    }
    // GridCell format
    return cell.x === coords.x && cell.y === coords.y;
  }
  
  /**
   * Get all hexes within a rectangular area
   */
  getCellsInRectangle(x1: number, y1: number, x2: number, y2: number): Point[] {
    const offset1 = axialToOffset(x1, y1, this.orientation);
    const offset2 = axialToOffset(x2, y2, this.orientation);
    
    const minCol = Math.min(offset1.col, offset2.col);
    const maxCol = Math.max(offset1.col, offset2.col);
    const minRow = Math.min(offset1.row, offset2.row);
    const maxRow = Math.max(offset1.row, offset2.row);
    
    const cells: Point[] = [];
    for (let col = minCol; col <= maxCol; col++) {
      for (let row = minRow; row <= maxRow; row++) {
        const { q, r } = offsetToAxial(col, row, this.orientation);
        
        if (this.isWithinBounds(q, r)) {
          cells.push({ x: q, y: r });
        }
      }
    }
    
    return cells;
  }
  
  /**
   * Get all hexes within a circular area
   */
  getCellsInCircle(centerX: number, centerY: number, radiusInHexes: number): Point[] {
    const cells: Point[] = [];
    
    const centerOffset = axialToOffset(centerX, centerY, this.orientation);
    const minCol = Math.floor(centerOffset.col - radiusInHexes);
    const maxCol = Math.ceil(centerOffset.col + radiusInHexes);
    const minRow = Math.floor(centerOffset.row - radiusInHexes);
    const maxRow = Math.ceil(centerOffset.row + radiusInHexes);
    
    for (let col = minCol; col <= maxCol; col++) {
      for (let row = minRow; row <= maxRow; row++) {
        const { q, r } = offsetToAxial(col, row, this.orientation);
        
        if (this.isWithinBounds(q, r)) {
          const distance = this.getHexDistance(centerX, centerY, q, r);
          if (distance <= radiusInHexes) {
            cells.push({ x: q, y: r });
          }
        }
      }
    }
    
    return cells;
  }
  
  /**
   * Get hexes along a line between two hexes
   */
  getCellsInLine(x1: number, y1: number, x2: number, y2: number): Point[] {
    const distance = this.getHexDistance(x1, y1, x2, y2);
    const cells: Point[] = [];
    
    if (distance === 0) {
      return [{ x: x1, y: y1 }];
    }
    
    for (let i = 0; i <= distance; i++) {
      const t = i / distance;
      
      const cx1 = x1;
      const cz1 = y1;
      const cy1 = -cx1 - cz1;
      
      const cx2 = x2;
      const cz2 = y2;
      const cy2 = -cx2 - cz2;
      
      const x = cx1 + (cx2 - cx1) * t;
      const y = cy1 + (cy2 - cy1) * t;
      const z = cz1 + (cz2 - cz1) * t;
      
      const rounded = this.roundHex(x, z);
      
      if (this.isWithinBounds(rounded.q, rounded.r)) {
        cells.push({ x: rounded.q, y: rounded.r });
      }
    }
    
    return cells;
  }
  
  /**
   * Get all neighboring hexes (returns Point[] for API consistency)
   */
  getNeighbors(x: number, y: number): Point[] {
    const directions = [
      { q: 1, r: 0 },
      { q: 1, r: -1 },
      { q: 0, r: -1 },
      { q: -1, r: 0 },
      { q: -1, r: 1 },
      { q: 0, r: 1 }
    ];
    
    return directions.map(dir => ({
      x: x + dir.q,
      y: y + dir.r
    }));
  }
  
  /**
   * Calculate distance between two hexes
   */
  getHexDistance(q1: number, r1: number, q2: number, r2: number): number {
    return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
  }
  
  /**
   * Alias for getHexDistance - API consistency with GridGeometry
   */
  getEuclideanDistance(x1: number, y1: number, x2: number, y2: number): number {
    return this.getHexDistance(x1, y1, x2, y2);
  }
  
  /**
   * Manhattan distance - same as hex distance for hexes
   */
  getManhattanDistance(x1: number, y1: number, x2: number, y2: number): number {
    return this.getHexDistance(x1, y1, x2, y2);
  }
  
  /**
   * Game distance - hex grids have no diagonal rules
   */
  getCellDistance(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    _options: DistanceOptions = {}
  ): number {
    return this.getHexDistance(x1, y1, x2, y2);
  }
  
  /**
   * Get the bounding box of a hex cell in world coordinates
   */
  getCellBounds(cell: Cell): BoundingBox {
    const q = 'q' in cell ? cell.q : cell.x;
    const r = 'q' in cell ? cell.r : cell.y;
    
    const center = this.hexToWorld(q, r);
    const halfWidth = this.width / 2;
    const halfHeight = this.height / 2;
    return {
      minX: center.worldX - halfWidth,
      minY: center.worldY - halfHeight,
      maxX: center.worldX + halfWidth,
      maxY: center.worldY + halfHeight
    };
  }
  
  /**
   * Get the bounding box of an object in world coordinates
   */
  getObjectBounds(obj: { position: Point; size?: { width: number; height: number } }): BoundingBox {
    const center = this.hexToWorld(obj.position.x, obj.position.y);
    const size = obj.size || { width: 1, height: 1 };
    
    const halfWidth = (this.width * size.width) / 2;
    const halfHeight = (this.height * size.height) / 2;
    return {
      minX: center.worldX - halfWidth,
      minY: center.worldY - halfHeight,
      maxX: center.worldX + halfWidth,
      maxY: center.worldY + halfHeight
    };
  }
}

// Export type for consumers
export type { HexGeometry };

return { HexGeometry };