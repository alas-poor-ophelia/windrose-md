/**
 * dungeonGenerator.js
 * 
 * Pure procedural dungeon generation module for Windrose MapDesigner.
 * Implements a four-phase pipeline:
 *   1. Room Generation - scatter rooms with collision detection (monte carlo problem)
 *   2. Connection Graph - determine which rooms connect (via MST algorithm)
 *   3. Corridor Carving - create paths between connected rooms (a nightmare)
 *   4. Cell Generation - convert to Windrose cell format
 * 
 */

// =============================================================================
// PRESETS
// =============================================================================

const DUNGEON_PRESETS = {
  small: {
    // "Tight Lair" - cramped goblin den, linear flow, get in and get out
    gridWidth: 20,
    gridHeight: 20,
    roomCount: { min: 3, max: 5 },
    roomSize: { minWidth: 3, maxWidth: 5, minHeight: 3, maxHeight: 5 },
    padding: 1,
    corridorWidth: 1,
    corridorStyle: 'straight',
    circleChance: 0.15,
    complexRoomChance: 0.1,
    loopChance: 0,
    doorChance: 0.7,
    secretDoorChance: 0.05,
    wideCorridorChance: 0,
    diagonalCorridorChance: 0
  },
  medium: {
    // "Complex" - classic dungeon, multiple paths, exploration, some grand halls
    gridWidth: 40,
    gridHeight: 40,
    roomCount: { min: 8, max: 12 },
    roomSize: { minWidth: 4, maxWidth: 8, minHeight: 4, maxHeight: 8 },
    padding: 2,
    corridorWidth: 1,
    corridorStyle: 'straight',
    circleChance: 0.3,
    complexRoomChance: 0.15,
    loopChance: 0.15,
    doorChance: 0.7,
    secretDoorChance: 0.05,
    wideCorridorChance: 0.25,
    diagonalCorridorChance: 0.5
  },
  large: {
    // "Grand" - fortress/temple scale, grand corridors, many chambers, sprawling
    gridWidth: 60,
    gridHeight: 60,
    roomCount: { min: 10, max: 15 },
    roomSize: { minWidth: 4, maxWidth: 10, minHeight: 4, maxHeight: 10 },
    padding: 3,
    corridorWidth: 1,
    corridorStyle: 'straight',
    circleChance: 0.3,
    complexRoomChance: 0.15,
    loopChance: 0.08,
    doorChance: 0.7,
    secretDoorChance: 0.05,
    wideCorridorChance: 0.5,
    diagonalCorridorChance: 0.5
  }
};

// =============================================================================
// DUNGEON STYLES
// Styles are overlay configurations applied on top of size presets.
// They define the "flavor" of the dungeon independent of its size.
// =============================================================================

const DUNGEON_STYLES = {
  classic: {
    // Default balanced dungeon - no overrides needed
    name: 'Classic',
    description: 'Balanced mix of rooms and corridors',
    overrides: {
      waterChance: 0.15,
      diagonalCorridorChance: 0.5
    }
  },
  cavern: {
    name: 'Cavern',
    description: 'Natural cave system with organic passages',
    overrides: {
      circleChance: 0.6,
      complexRoomChance: 0.05,
      corridorStyle: 'organic',
      doorChance: 0,
      secretDoorChance: 0,
      loopChance: 0.2,
      roomSizeBias: 0.3,
      waterChance: 0.35,
      diagonalCorridorChance: 0.7  // More organic paths
    }
  },
  fortress: {
    name: 'Fortress',
    description: 'Military structure with wide corridors and many doors',
    overrides: {
      circleChance: 0,
      complexRoomChance: 0.25,
      corridorStyle: 'straight',
      doorChance: 0.95,
      secretDoorChance: 0.02,
      wideCorridorChance: 0.7,
      roomSizeBias: -0.2,
      waterChance: 0.05,
      diagonalCorridorChance: 0.2  // Military = more ordered
    }
  },
  crypt: {
    name: 'Crypt',
    description: 'Tight passages with hidden chambers',
    overrides: {
      circleChance: 0.1,
      complexRoomChance: 0.1,
      corridorStyle: 'straight',
      doorChance: 0.5,
      secretDoorChance: 0.2,
      loopChance: 0.02,
      wideCorridorChance: 0,
      roomSizeBias: -0.4,
      waterChance: 0.20,
      diagonalCorridorChance: 0.3
    }
  }
};

const DEFAULT_FLOOR_COLOR = '#c4a57b';
const DEFAULT_WATER_COLOR = '#4a90d9';
const DEFAULT_WATER_OPACITY = 0.6;

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate a random integer with bias toward min or max.
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value  
 * @param {number} bias - Bias from -1 (favor min/compact) to 1 (favor max/spacious), 0 = uniform
 */
function biasedRandomInt(min, max, bias = 0) {
  if (bias === 0) return randomInt(min, max);
  
  // Use power curve to skew distribution
  // bias > 0: skew toward max (spacious)
  // bias < 0: skew toward min (compact)
  const t = Math.random();
  const exponent = bias > 0 ? 1 / (1 + bias * 2) : 1 + Math.abs(bias) * 2;
  const skewed = Math.pow(t, exponent);
  
  return Math.floor(min + skewed * (max - min + 1));
}

function rectanglesOverlap(a, b, padding = 0) {
  return !(
    a.x + a.width + padding <= b.x ||
    b.x + b.width + padding <= a.x ||
    a.y + a.height + padding <= b.y ||
    b.y + b.height + padding <= a.y
  );
}

function getRoomCenter(room) {
  if (room.shape === 'circle') {
    return {
      x: Math.floor(room.x + room.radius),
      y: Math.floor(room.y + room.radius)
    };
  }
  return {
    x: Math.floor(room.x + room.width / 2),
    y: Math.floor(room.y + room.height / 2)
  };
}

function cellKey(x, y) {
  return `${x},${y}`;
}

function isCellInRoom(x, y, room) {
  if (x < room.x || x >= room.x + room.width ||
      y < room.y || y >= room.y + room.height) {
    return false;
  }
  
  if (room.shape === 'circle') {
    const centerX = room.x + room.radius;
    const centerY = room.y + room.radius;
    const dx = x + 0.5 - centerX;
    const dy = y + 0.5 - centerY;
    return dx * dx + dy * dy <= room.radius * room.radius;
  }
  
  if (room.shape === 'composite') {
    // Check if cell is in any of the room's parts
    return room.parts.some(part => 
      x >= part.x && x < part.x + part.width &&
      y >= part.y && y < part.y + part.height
    );
  }
  
  return true;
}

/**
 * Check if cell is in room's RECTANGULAR bounds only.
 * Used for door detection to avoid circular room corner issues.
 */
function isCellInRoomRect(x, y, room) {
  return x >= room.x && x < room.x + room.width &&
         y >= room.y && y < room.y + room.height;
}

function generateObjectId() {
  return 'obj-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// =============================================================================
// COMPOSITE ROOM GENERATION (L and T shapes)
// =============================================================================

/**
 * Generate an L-shaped room from two overlapping rectangles.
 * The L can be in any of 4 orientations.
 * @param {number} x - Base x position
 * @param {number} y - Base y position  
 * @param {Object} roomSize - {minWidth, maxWidth, minHeight, maxHeight}
 * @param {number} bias - Room size bias (-1 to 1)
 * @returns {Object} Room with shape='composite' and parts array
 */
function generateLShapedRoom(x, y, roomSize, bias = 0) {
  // Generate two rectangles that will form the L
  // First rectangle is the "stem", second is the "foot"
  const stemWidth = biasedRandomInt(roomSize.minWidth, roomSize.maxWidth, bias);
  const stemHeight = biasedRandomInt(Math.max(roomSize.minHeight, 4), roomSize.maxHeight + 2, bias);
  
  const footWidth = biasedRandomInt(roomSize.minWidth, roomSize.maxWidth + 2, bias);
  const footHeight = biasedRandomInt(Math.max(2, Math.floor(roomSize.minHeight / 2)), Math.floor(roomSize.maxHeight / 2) + 1, bias);
  
  // Choose orientation (which corner the L bends toward)
  const orientation = randomInt(0, 3);
  
  let parts;
  switch (orientation) {
    case 0: // └ shape - foot extends right from bottom of stem
      parts = [
        { x: x, y: y, width: stemWidth, height: stemHeight },
        { x: x + stemWidth - Math.min(2, stemWidth - 1), y: y + stemHeight - footHeight, width: footWidth, height: footHeight }
      ];
      break;
    case 1: // ┘ shape - foot extends left from bottom of stem
      parts = [
        { x: x + footWidth - Math.min(2, footWidth - 1), y: y, width: stemWidth, height: stemHeight },
        { x: x, y: y + stemHeight - footHeight, width: footWidth, height: footHeight }
      ];
      break;
    case 2: // ┐ shape - foot extends left from top of stem  
      parts = [
        { x: x + footWidth - Math.min(2, footWidth - 1), y: y + footHeight - Math.min(2, footHeight - 1), width: stemWidth, height: stemHeight },
        { x: x, y: y, width: footWidth, height: footHeight }
      ];
      break;
    case 3: // ┌ shape - foot extends right from top of stem
    default:
      parts = [
        { x: x, y: y + footHeight - Math.min(2, footHeight - 1), width: stemWidth, height: stemHeight },
        { x: x + stemWidth - Math.min(2, stemWidth - 1), y: y, width: footWidth, height: footHeight }
      ];
      break;
  }
  
  // Calculate bounding box
  const minX = Math.min(...parts.map(p => p.x));
  const minY = Math.min(...parts.map(p => p.y));
  const maxX = Math.max(...parts.map(p => p.x + p.width));
  const maxY = Math.max(...parts.map(p => p.y + p.height));
  
  // Normalize parts to be relative to bounding box origin
  const normalizedParts = parts.map(p => ({
    x: p.x - minX + x,
    y: p.y - minY + y,
    width: p.width,
    height: p.height
  }));
  
  return {
    x: x,
    y: y,
    width: maxX - minX,
    height: maxY - minY,
    shape: 'composite',
    compositeType: 'L',
    parts: normalizedParts
  };
}

/**
 * Generate a T-shaped room from two overlapping rectangles.
 * The T can be in any of 4 orientations.
 * @param {number} x - Base x position
 * @param {number} y - Base y position
 * @param {Object} roomSize - {minWidth, maxWidth, minHeight, maxHeight}
 * @param {number} bias - Room size bias (-1 to 1)
 * @returns {Object} Room with shape='composite' and parts array
 */
function generateTShapedRoom(x, y, roomSize, bias = 0) {
  // T-shape needs a minimum size to look good
  const stemWidth = biasedRandomInt(Math.max(2, roomSize.minWidth - 1), Math.max(3, roomSize.maxWidth - 2), bias);
  const stemHeight = biasedRandomInt(Math.max(roomSize.minHeight, 4), roomSize.maxHeight + 2, bias);
  
  const capWidth = biasedRandomInt(roomSize.minWidth + 2, roomSize.maxWidth + 4, bias);
  const capHeight = biasedRandomInt(2, Math.floor(roomSize.maxHeight / 2) + 1, bias);
  
  // Choose orientation
  const orientation = randomInt(0, 3);
  
  let parts;
  const stemOffset = Math.floor((capWidth - stemWidth) / 2);
  
  switch (orientation) {
    case 0: // ┴ shape - cap on bottom
      parts = [
        { x: x + stemOffset, y: y, width: stemWidth, height: stemHeight },
        { x: x, y: y + stemHeight - Math.min(2, capHeight), width: capWidth, height: capHeight }
      ];
      break;
    case 1: // ┬ shape - cap on top
      parts = [
        { x: x + stemOffset, y: y + capHeight - Math.min(2, capHeight), width: stemWidth, height: stemHeight },
        { x: x, y: y, width: capWidth, height: capHeight }
      ];
      break;
    case 2: // ┤ shape - cap on left (rotated T)
      parts = [
        { x: x + capHeight - Math.min(2, capHeight), y: y + stemOffset, width: stemHeight, height: stemWidth },
        { x: x, y: y, width: capHeight, height: capWidth }
      ];
      break;
    case 3: // ├ shape - cap on right (rotated T)
    default:
      parts = [
        { x: x, y: y + stemOffset, width: stemHeight, height: stemWidth },
        { x: x + stemHeight - Math.min(2, capHeight), y: y, width: capHeight, height: capWidth }
      ];
      break;
  }
  
  // Calculate bounding box
  const minX = Math.min(...parts.map(p => p.x));
  const minY = Math.min(...parts.map(p => p.y));
  const maxX = Math.max(...parts.map(p => p.x + p.width));
  const maxY = Math.max(...parts.map(p => p.y + p.height));
  
  // Normalize parts to bounding box origin
  const normalizedParts = parts.map(p => ({
    x: p.x - minX + x,
    y: p.y - minY + y,
    width: p.width,
    height: p.height
  }));
  
  return {
    x: x,
    y: y,
    width: maxX - minX,
    height: maxY - minY,
    shape: 'composite',
    compositeType: 'T',
    parts: normalizedParts
  };
}

/**
 * Generate a composite (L or T shaped) room.
 * 70% chance of L-shape, 30% chance of T-shape.
 * @param {number} x - Base x position
 * @param {number} y - Base y position
 * @param {Object} roomSize - {minWidth, maxWidth, minHeight, maxHeight}
 * @param {number} bias - Room size bias
 * @returns {Object} Composite room
 */
function generateCompositeRoom(x, y, roomSize, bias = 0) {
  if (Math.random() < 0.7) {
    return generateLShapedRoom(x, y, roomSize, bias);
  } else {
    return generateTShapedRoom(x, y, roomSize, bias);
  }
}

// =============================================================================
// PHASE 1: ROOM GENERATION
// =============================================================================

function generateRooms(config) {
  const {
    gridWidth,
    gridHeight,
    roomCount,
    roomSize,
    padding,
    circleChance = 0,
    complexRoomChance = 0,
    roomSizeBias = 0
  } = config;
  
  const targetCount = randomInt(roomCount.min, roomCount.max);
  const rooms = [];
  const maxAttempts = targetCount * 50;
  let attempts = 0;
  
  while (rooms.length < targetCount && attempts < maxAttempts) {
    attempts++;
    
    // Determine room type: circle, composite (L/T), or rectangle
    const roll = Math.random();
    const isCircle = roll < circleChance;
    const isComposite = !isCircle && roll < circleChance + complexRoomChance;
    
    let newRoom;
    
    if (isCircle) {
      const minRadius = Math.floor(Math.min(roomSize.minWidth, roomSize.minHeight) / 2);
      const maxRadius = Math.floor(Math.max(roomSize.maxWidth, roomSize.maxHeight) / 2);
      const radius = biasedRandomInt(Math.max(2, minRadius), Math.max(3, maxRadius), roomSizeBias);
      const diameter = radius * 2;
      
      const margin = padding + 1;
      const maxX = gridWidth - diameter - margin;
      const maxY = gridHeight - diameter - margin;
      
      if (maxX < margin || maxY < margin) continue;
      
      const x = randomInt(margin, maxX);
      const y = randomInt(margin, maxY);
      
      newRoom = {
        id: rooms.length,
        x, y,
        width: diameter,
        height: diameter,
        shape: 'circle',
        radius
      };
    } else if (isComposite) {
      // Generate composite room, then check if it fits
      const margin = padding + 1;
      
      // Estimate max bounds for composite (they can be larger than normal rooms)
      const estimatedMaxSize = roomSize.maxWidth + roomSize.maxHeight;
      const maxX = gridWidth - estimatedMaxSize - margin;
      const maxY = gridHeight - estimatedMaxSize - margin;
      
      if (maxX < margin || maxY < margin) continue;
      
      const x = randomInt(margin, maxX);
      const y = randomInt(margin, maxY);
      
      newRoom = generateCompositeRoom(x, y, roomSize, roomSizeBias);
      newRoom.id = rooms.length;
      
      // Verify the room fits within grid bounds
      if (newRoom.x + newRoom.width > gridWidth - margin ||
          newRoom.y + newRoom.height > gridHeight - margin) {
        continue;
      }
    } else {
      const width = biasedRandomInt(roomSize.minWidth, roomSize.maxWidth, roomSizeBias);
      const height = biasedRandomInt(roomSize.minHeight, roomSize.maxHeight, roomSizeBias);
      
      const margin = padding + 1;
      const maxX = gridWidth - width - margin;
      const maxY = gridHeight - height - margin;
      
      if (maxX < margin || maxY < margin) continue;
      
      const x = randomInt(margin, maxX);
      const y = randomInt(margin, maxY);
      
      newRoom = {
        id: rooms.length,
        x, y,
        width,
        height,
        shape: 'rectangle'
      };
    }
    
    const hasOverlap = rooms.some(existing => 
      rectanglesOverlap(newRoom, existing, padding)
    );
    
    if (!hasOverlap) {
      rooms.push(newRoom);
    }
  }
  
  return rooms;
}

// =============================================================================
// PHASE 2: CONNECTION GRAPH (MST)
// =============================================================================

function getRoomDistance(roomA, roomB) {
  const centerA = getRoomCenter(roomA);
  const centerB = getRoomCenter(roomB);
  const dx = centerB.x - centerA.x;
  const dy = centerB.y - centerA.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function buildConnectionGraph(rooms, loopChance = 0) {
  if (rooms.length < 2) return [];
  
  const connections = [];
  const connectedIndices = new Set([0]);
  const unconnectedIndices = new Set(rooms.map((_, i) => i).filter(i => i !== 0));
  
  const allEdges = [];
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      allEdges.push({
        i, j,
        distance: getRoomDistance(rooms[i], rooms[j])
      });
    }
  }
  
  allEdges.sort((a, b) => a.distance - b.distance);
  
  const mstEdges = new Set();
  
  while (unconnectedIndices.size > 0) {
    let bestEdge = null;
    let bestDistance = Infinity;
    
    for (const edge of allEdges) {
      const iConnected = connectedIndices.has(edge.i);
      const jConnected = connectedIndices.has(edge.j);
      
      if (iConnected === jConnected) continue;
      
      if (edge.distance < bestDistance) {
        bestDistance = edge.distance;
        bestEdge = edge;
      }
    }
    
    if (bestEdge) {
      connections.push([rooms[bestEdge.i], rooms[bestEdge.j]]);
      mstEdges.add(bestEdge);
      
      const newConnected = connectedIndices.has(bestEdge.i) ? bestEdge.j : bestEdge.i;
      connectedIndices.add(newConnected);
      unconnectedIndices.delete(newConnected);
    } else {
      break;
    }
  }
  
  if (loopChance > 0) {
    for (const edge of allEdges) {
      if (mstEdges.has(edge)) continue;
      if (Math.random() < loopChance) {
        connections.push([rooms[edge.i], rooms[edge.j]]);
      }
    }
  }
  
  return connections;
}

// =============================================================================
// PHASE 3: CORRIDOR CARVING
// =============================================================================

/**
 * Check if a cell is adjacent to a room (but not inside it).
 * Used to detect if a corridor runs along a room's wall.
 */
function isCellAdjacentToRoom(x, y, room) {
  if (isCellInRoomRect(x, y, room)) return false;
  
  return isCellInRoomRect(x - 1, y, room) ||
         isCellInRoomRect(x + 1, y, room) ||
         isCellInRoomRect(x, y - 1, room) ||
         isCellInRoomRect(x, y + 1, room);
}

/**
 * Try to find an offset path that avoids adjacency issues.
 * Creates a 3-segment "Z-shape" path by offsetting the elbow point.
 */
function tryOffsetPath(centerA, centerB, width, startOffset, endOffset, allRooms, roomA, roomB) {
  const dx = centerB.x - centerA.x;
  const dy = centerB.y - centerA.y;
  const xDir = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const yDir = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  
  // Try various elbow offsets
  const offsets = [2, -2, 3, -3, 4, -4];
  
  for (const offset of offsets) {
    // Try horizontal-first with offset elbow
    const elbowX = centerB.x + offset;
    const elbowY = centerA.y;
    
    if (isOffsetPathClear(centerA, centerB, elbowX, elbowY, width, startOffset, endOffset, allRooms, roomA, roomB, xDir, yDir)) {
      return carveOffsetPath(centerA, centerB, elbowX, elbowY, width, startOffset, endOffset, xDir, yDir, true);
    }
    
    // Try vertical-first with offset elbow
    const elbowX2 = centerA.x;
    const elbowY2 = centerB.y + offset;
    
    if (isOffsetPathClear(centerA, centerB, elbowX2, elbowY2, width, startOffset, endOffset, allRooms, roomA, roomB, xDir, yDir)) {
      return carveOffsetPath(centerA, centerB, elbowX2, elbowY2, width, startOffset, endOffset, xDir, yDir, false);
    }
  }
  
  return null; // No clear offset found
}

/**
 * Check if an offset path would be clear of adjacency issues.
 */
function isOffsetPathClear(centerA, centerB, elbowX, elbowY, width, startOffset, endOffset, allRooms, roomA, roomB, xDir, yDir) {
  const corridorCells = [];
  
  // Segment 1: centerA to elbow
  const seg1Horizontal = (elbowY === centerA.y);
  if (seg1Horizontal) {
    const dir = elbowX > centerA.x ? 1 : -1;
    for (let x = centerA.x; x !== elbowX + dir; x += dir) {
      for (let w = startOffset; w <= endOffset; w++) {
        corridorCells.push({ x, y: centerA.y + w });
      }
    }
  } else {
    const dir = elbowY > centerA.y ? 1 : -1;
    for (let y = centerA.y; y !== elbowY + dir; y += dir) {
      for (let w = startOffset; w <= endOffset; w++) {
        corridorCells.push({ x: centerA.x + w, y });
      }
    }
  }
  
  // Segment 2: elbow to centerB
  if (seg1Horizontal) {
    // Second segment is vertical
    const dir = centerB.y > elbowY ? 1 : -1;
    for (let y = elbowY; y !== centerB.y + dir; y += dir) {
      for (let w = startOffset; w <= endOffset; w++) {
        corridorCells.push({ x: elbowX + w, y });
      }
    }
  } else {
    // Second segment is horizontal
    const dir = centerB.x > elbowX ? 1 : -1;
    for (let x = elbowX; x !== centerB.x + dir; x += dir) {
      for (let w = startOffset; w <= endOffset; w++) {
        corridorCells.push({ x, y: elbowY + w });
      }
    }
  }
  
  // Check if path runs alongside source or dest room
  if (runsAlongsideRoom(corridorCells, roomA)) return false;
  if (runsAlongsideRoom(corridorCells, roomB)) return false;
  
  // Check adjacency to other rooms
  for (const room of allRooms) {
    if (room.id === roomA.id || room.id === roomB.id) continue;
    
    let adjacentCount = 0;
    for (const cell of corridorCells) {
      if (isCellInRoomRect(cell.x, cell.y, roomA)) continue;
      if (isCellInRoomRect(cell.x, cell.y, roomB)) continue;
      
      if (isCellAdjacentToRoom(cell.x, cell.y, room)) {
        adjacentCount++;
        if (adjacentCount > 1) return false;
      }
    }
  }
  
  return true;
}

/**
 * Carve a path with a specified elbow point.
 */
function carveOffsetPath(centerA, centerB, elbowX, elbowY, width, startOffset, endOffset, xDir, yDir, horizontalFirst) {
  const cells = [];
  const orderedPath = [];
  
  if (horizontalFirst) {
    // Horizontal to elbow
    const hDir = elbowX > centerA.x ? 1 : elbowX < centerA.x ? -1 : 0;
    if (hDir !== 0) {
      for (let x = centerA.x; x !== elbowX + hDir; x += hDir) {
        orderedPath.push({ x, y: centerA.y });
        for (let w = startOffset; w <= endOffset; w++) {
          cells.push({ x, y: centerA.y + w });
        }
      }
    }
    
    // Vertical from elbow to centerB.y
    const vDir = centerB.y > elbowY ? 1 : centerB.y < elbowY ? -1 : 0;
    if (vDir !== 0) {
      for (let y = elbowY; y !== centerB.y + vDir; y += vDir) {
        orderedPath.push({ x: elbowX, y });
        for (let w = startOffset; w <= endOffset; w++) {
          cells.push({ x: elbowX + w, y });
        }
      }
    }
    
    // Horizontal from elbowX to centerB.x (if needed)
    const hDir2 = centerB.x > elbowX ? 1 : centerB.x < elbowX ? -1 : 0;
    if (hDir2 !== 0 && elbowX !== centerB.x) {
      for (let x = elbowX + hDir2; x !== centerB.x + hDir2; x += hDir2) {
        orderedPath.push({ x, y: centerB.y });
        for (let w = startOffset; w <= endOffset; w++) {
          cells.push({ x, y: centerB.y + w });
        }
      }
    }
  } else {
    // Vertical to elbow
    const vDir = elbowY > centerA.y ? 1 : elbowY < centerA.y ? -1 : 0;
    if (vDir !== 0) {
      for (let y = centerA.y; y !== elbowY + vDir; y += vDir) {
        orderedPath.push({ x: centerA.x, y });
        for (let w = startOffset; w <= endOffset; w++) {
          cells.push({ x: centerA.x + w, y });
        }
      }
    }
    
    // Horizontal from elbow to centerB.x
    const hDir = centerB.x > elbowX ? 1 : centerB.x < elbowX ? -1 : 0;
    if (hDir !== 0) {
      for (let x = elbowX; x !== centerB.x + hDir; x += hDir) {
        orderedPath.push({ x, y: elbowY });
        for (let w = startOffset; w <= endOffset; w++) {
          cells.push({ x, y: elbowY + w });
        }
      }
    }
    
    // Vertical from elbowY to centerB.y (if needed)
    const vDir2 = centerB.y > elbowY ? 1 : centerB.y < elbowY ? -1 : 0;
    if (vDir2 !== 0 && elbowY !== centerB.y) {
      for (let y = elbowY + vDir2; y !== centerB.y + vDir2; y += vDir2) {
        orderedPath.push({ x: centerB.x, y });
        for (let w = startOffset; w <= endOffset; w++) {
          cells.push({ x: centerB.x + w, y });
        }
      }
    }
  }
  
  return { cells, orderedPath, width };
}

function carveCorridorBetween(roomA, roomB, width = 1, allRooms = []) {
  const centerA = getRoomCenter(roomA);
  const centerB = getRoomCenter(roomB);
  
  const cells = [];
  const orderedPath = [];
  
  // Calculate width offsets for corridor spreading
  const startOffset = -Math.floor((width - 1) / 2);
  const endOffset = Math.floor(width / 2);
  
  // Determine direction
  const dx = centerB.x - centerA.x;
  const dy = centerB.y - centerA.y;
  const xDir = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const yDir = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  
  // Check both L-orientations for adjacency issues
  const horizontalFirstBad = wouldRunAdjacentToRoom(
    centerA, centerB, true, allRooms, roomA, roomB, width
  );
  const verticalFirstBad = wouldRunAdjacentToRoom(
    centerA, centerB, false, allRooms, roomA, roomB, width
  );
  
  // If BOTH orientations are bad, try using a 3-segment path with offset elbow
  if (horizontalFirstBad && verticalFirstBad) {
    const offsetResult = tryOffsetPath(centerA, centerB, width, startOffset, endOffset, allRooms, roomA, roomB);
    if (offsetResult) {
      return offsetResult;
    }
  }
  
  // Prefer horizontal-first randomly, but avoid adjacency issues
  let horizontalFirst;
  if (horizontalFirstBad && !verticalFirstBad) {
    horizontalFirst = false;
  } else if (verticalFirstBad && !horizontalFirstBad) {
    horizontalFirst = true;
  } else {
    horizontalFirst = Math.random() < 0.5;
  }
  
  if (horizontalFirst) {
    // Horizontal from A's center.x toward B's center.x, then vertical to B's center
    for (let x = centerA.x; x !== centerB.x + xDir; x += xDir || 1) {
      if (xDir === 0) break;
      orderedPath.push({ x, y: centerA.y });
      for (let w = startOffset; w <= endOffset; w++) {
        cells.push({ x, y: centerA.y + w });
      }
    }
    
    // Vertical segment at B's x
    const yStart = xDir === 0 ? centerA.y : centerA.y + yDir;
    for (let y = yStart; y !== centerB.y + yDir; y += yDir || 1) {
      if (yDir === 0) break;
      orderedPath.push({ x: centerB.x, y });
      for (let w = startOffset; w <= endOffset; w++) {
        cells.push({ x: centerB.x + w, y });
      }
    }
  } else {
    // Vertical from A's center.y toward B's center.y, then horizontal to B's center
    for (let y = centerA.y; y !== centerB.y + yDir; y += yDir || 1) {
      if (yDir === 0) break;
      orderedPath.push({ x: centerA.x, y });
      for (let w = startOffset; w <= endOffset; w++) {
        cells.push({ x: centerA.x + w, y });
      }
    }
    
    // Horizontal segment at B's y
    const xStart = yDir === 0 ? centerA.x : centerA.x + xDir;
    for (let x = xStart; x !== centerB.x + xDir; x += xDir || 1) {
      if (xDir === 0) break;
      orderedPath.push({ x, y: centerB.y });
      for (let w = startOffset; w <= endOffset; w++) {
        cells.push({ x, y: centerB.y + w });
      }
    }
  }
  
  // Ensure we include both endpoints
  if (orderedPath.length === 0 || 
      (orderedPath[orderedPath.length - 1].x !== centerB.x || 
       orderedPath[orderedPath.length - 1].y !== centerB.y)) {
    orderedPath.push({ x: centerB.x, y: centerB.y });
    for (let w = startOffset; w <= endOffset; w++) {
      cells.push({ x: centerB.x + w, y: centerB.y });
      cells.push({ x: centerB.x, y: centerB.y + w });
    }
  }
  
  return { cells, orderedPath, width };
}

/**
 * Check if corridor cells run alongside a room (adjacent but outside) for more than 1 cell.
 * This catches cases like a corridor running along a room's wall before entering it.
 */
function runsAlongsideRoom(corridorCells, room) {
  let adjacentOutsideCount = 0;
  
  for (const cell of corridorCells) {
    // Skip cells that are INSIDE the room (those are fine - it's the entry)
    if (isCellInRoomRect(cell.x, cell.y, room)) continue;
    
    // Check if this cell is adjacent to the room
    if (isCellAdjacentToRoom(cell.x, cell.y, room)) {
      adjacentOutsideCount++;
      if (adjacentOutsideCount > 1) {
        return true;
      }
    }
  }
  
  return false;
}

function wouldRunAdjacentToRoom(centerA, centerB, horizontalFirst, allRooms, roomA, roomB, width = 1) {
  const dx = centerB.x - centerA.x;
  const dy = centerB.y - centerA.y;
  const xDir = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const yDir = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  
  // Width offsets (must match carveCorridorBetween)
  const startOffset = -Math.floor((width - 1) / 2);
  const endOffset = Math.floor(width / 2);
  
  // Collect ALL corridor cells 
  const corridorCells = [];
  
  if (horizontalFirst) {
    // First segment: horizontal at centerA.y
    if (xDir !== 0) {
      for (let x = centerA.x; x !== centerB.x + xDir; x += xDir) {
        for (let w = startOffset; w <= endOffset; w++) {
          corridorCells.push({ x, y: centerA.y + w });
        }
      }
    }
    // Second segment: vertical at centerB.x (starts at centerA.y + yDir to skip elbow)
    if (yDir !== 0) {
      const yStart = xDir === 0 ? centerA.y : centerA.y + yDir;
      for (let y = yStart; y !== centerB.y + yDir; y += yDir) {
        for (let w = startOffset; w <= endOffset; w++) {
          corridorCells.push({ x: centerB.x + w, y });
        }
      }
    }
  } else {
    // First segment: vertical at centerA.x
    if (yDir !== 0) {
      for (let y = centerA.y; y !== centerB.y + yDir; y += yDir) {
        for (let w = startOffset; w <= endOffset; w++) {
          corridorCells.push({ x: centerA.x + w, y });
        }
      }
    }
    // Second segment: horizontal at centerB.y (starts at centerA.x + xDir to skip elbow)
    if (xDir !== 0) {
      const xStart = yDir === 0 ? centerA.x : centerA.x + xDir;
      for (let x = xStart; x !== centerB.x + xDir; x += xDir) {
        for (let w = startOffset; w <= endOffset; w++) {
          corridorCells.push({ x, y: centerB.y + w });
        }
      }
    }
  }
  
  // Check if path runs alongside source or dest room
  if (runsAlongsideRoom(corridorCells, roomA)) {
    return true;
  }
  if (runsAlongsideRoom(corridorCells, roomB)) {
    return true;
  }
  
  // Check each corridor cell for adjacency to OTHER rooms
  for (const room of allRooms) {
    if (room.id === roomA.id || room.id === roomB.id) continue;
    
    let adjacentCount = 0;
    for (const cell of corridorCells) {
      // Skip cells inside source or dest rooms
      if (isCellInRoomRect(cell.x, cell.y, roomA)) continue;
      if (isCellInRoomRect(cell.x, cell.y, roomB)) continue;
      
      if (isCellAdjacentToRoom(cell.x, cell.y, room)) {
        adjacentCount++;
        if (adjacentCount > 1) {
          return true;
        }
      }
    }
  }
  
  return false;
}

function carveCorridors(connections, corridorWidth = 1, allRooms = [], corridorStyle = 'straight') {
  const allCorridorCells = [];
  const corridorsByConnection = [];
  
  for (const [roomA, roomB] of connections) {
    let result = carveCorridorBetween(roomA, roomB, corridorWidth, allRooms);
    
    // Apply wobble for organic style
    if (corridorStyle === 'organic') {
      result = addCorridorWobble(result, allRooms, roomA, roomB);
    }
    
    allCorridorCells.push(...result.cells);
    corridorsByConnection.push({
      roomA,
      roomB,
      cells: result.cells,
      orderedPath: result.orderedPath,
      width: result.width
    });
  }
  
  return { cells: allCorridorCells, byConnection: corridorsByConnection };
}

// =============================================================================
// ORGANIC CORRIDOR GENERATION (Wobble/Wander)
// =============================================================================

/**
 * Check if a wobble at position (x,y) would cause adjacency issues.
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {Array} allRooms - All rooms in the dungeon
 * @param {Object} roomA - Source room (allowed to be adjacent)
 * @param {Object} roomB - Dest room (allowed to be adjacent)
 * @param {Set} existingCells - Set of "x,y" keys for existing corridor cells
 * @returns {boolean} True if wobble would cause issues
 */
function wouldWobbleCauseIssues(x, y, allRooms, roomA, roomB, existingCells) {
  // Check adjacency to rooms other than source/dest
  for (const room of allRooms) {
    if (room.id === roomA.id || room.id === roomB.id) continue;
    
    // Don't wobble into another room
    if (isCellInRoomRect(x, y, room)) return true;
    
    // Don't wobble adjacent to another room
    if (isCellAdjacentToRoom(x, y, room)) return true;
  }
  
  return false;
}

/**
 * Determine the direction of a path segment (horizontal, vertical, or turning).
 * @param {Object} prev - Previous point {x, y}
 * @param {Object} curr - Current point {x, y}
 * @param {Object} next - Next point {x, y}
 * @returns {string} 'horizontal', 'vertical', or 'turn'
 */
function getSegmentDirection(prev, curr, next) {
  if (!prev || !next) return 'end';
  
  const fromPrev = { dx: curr.x - prev.x, dy: curr.y - prev.y };
  const toNext = { dx: next.x - curr.x, dy: next.y - curr.y };
  
  // Check if direction changes (it's a turn)
  if ((fromPrev.dx !== 0 && toNext.dy !== 0) || (fromPrev.dy !== 0 && toNext.dx !== 0)) {
    return 'turn';
  }
  
  if (fromPrev.dx !== 0 || toNext.dx !== 0) return 'horizontal';
  if (fromPrev.dy !== 0 || toNext.dy !== 0) return 'vertical';
  
  return 'unknown';
}

/**
 * Find straight runs in the ordered path (sequences of 4+ cells in same direction).
 * @param {Array} orderedPath - Array of {x, y} points
 * @returns {Array} Array of {startIdx, endIdx, direction} for each straight run
 */
function findStraightRuns(orderedPath) {
  const runs = [];
  if (orderedPath.length < 4) return runs;
  
  let runStart = 0;
  let runDirection = null;
  
  for (let i = 1; i < orderedPath.length; i++) {
    const prev = orderedPath[i - 1];
    const curr = orderedPath[i];
    
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const direction = dx !== 0 ? 'horizontal' : 'vertical';
    
    if (direction !== runDirection) {
      // End previous run if it was long enough
      if (runDirection && i - runStart >= 4) {
        runs.push({ startIdx: runStart, endIdx: i - 1, direction: runDirection });
      }
      runStart = i - 1;
      runDirection = direction;
    }
  }
  
  // Check final run
  if (runDirection && orderedPath.length - runStart >= 4) {
    runs.push({ startIdx: runStart, endIdx: orderedPath.length - 1, direction: runDirection });
  }
  
  return runs;
}

/**
 * Apply wobble to a straight corridor, making it more organic.
 * @param {Object} corridorResult - Result from carveCorridorBetween
 * @param {Array} allRooms - All rooms for collision checking
 * @param {Object} roomA - Source room
 * @param {Object} roomB - Destination room
 * @returns {Object} Modified corridor result with wobbled path
 */
function addCorridorWobble(corridorResult, allRooms, roomA, roomB) {
  const { orderedPath, width } = corridorResult;
  
  // Don't wobble very short corridors
  if (orderedPath.length < 6) return corridorResult;
  
  // Find straight runs that are candidates for wobble
  const runs = findStraightRuns(orderedPath);
  if (runs.length === 0) return corridorResult;
  
  // Create a mutable copy of the path
  const wobbledPath = orderedPath.map(p => ({ ...p }));
  
  // Build set of existing cells for self-intersection check
  const existingCells = new Set(corridorResult.cells.map(c => `${c.x},${c.y}`));
  
  // Wobble settings
  const wobbleChance = 0.25; // Chance to start a wobble
  const wobblePersist = 0.7; // Chance to continue wobbling in same direction
  
  for (const run of runs) {
    // Don't wobble the first 2 or last 2 cells of a run (keep entries/exits clean)
    const safeStart = run.startIdx + 2;
    const safeEnd = run.endIdx - 2;
    
    if (safeEnd <= safeStart) continue;
    
    let currentWobble = 0; // -1, 0, or 1
    
    for (let i = safeStart; i <= safeEnd; i++) {
      const point = wobbledPath[i];
      
      // Decide whether to change wobble state
      if (currentWobble === 0) {
        // Maybe start wobbling
        if (Math.random() < wobbleChance) {
          currentWobble = Math.random() < 0.5 ? 1 : -1;
        }
      } else {
        // Maybe stop or continue wobbling
        if (Math.random() > wobblePersist) {
          currentWobble = 0;
        }
      }
      
      if (currentWobble !== 0) {
        // Calculate the wobbled position
        let newX = point.x;
        let newY = point.y;
        
        if (run.direction === 'horizontal') {
          newY = point.y + currentWobble;
        } else {
          newX = point.x + currentWobble;
        }
        
        // Check if wobble is safe
        if (!wouldWobbleCauseIssues(newX, newY, allRooms, roomA, roomB, existingCells)) {
          point.x = newX;
          point.y = newY;
        } else {
          // Can't wobble here, reset wobble state
          currentWobble = 0;
        }
      }
    }
  }
  
  // Rebuild cells from wobbled path, filling diagonal gaps
  const newCells = rebuildCellsFromPath(wobbledPath, width, allRooms, roomA, roomB);
  
  return {
    cells: newCells,
    orderedPath: wobbledPath,
    width
  };
}

/**
 * Check if adding a fill cell at (x,y) would cause issues with room adjacency.
 * @returns {boolean} True if fill would cause problems
 */
function wouldFillCauseIssues(x, y, allRooms, roomA, roomB) {
  for (const room of allRooms) {
    if (room.id === roomA.id || room.id === roomB.id) continue;
    
    // Don't fill into another room
    if (isCellInRoomRect(x, y, room)) return true;
    
    // Don't fill adjacent to another room
    if (isCellAdjacentToRoom(x, y, room)) return true;
  }
  return false;
}

/**
 * Rebuild the full cells array from a (possibly wobbled) centerline path.
 * Fills in diagonal gaps to ensure all cells are orthogonally connected.
 * @param {Array} path - Array of {x, y} centerline points
 * @param {number} width - Corridor width
 * @param {Array} allRooms - All rooms for fill safety checking
 * @param {Object} roomA - Source room
 * @param {Object} roomB - Destination room
 * @returns {Array} Array of {x, y} cells
 */
function rebuildCellsFromPath(path, width, allRooms = [], roomA = null, roomB = null) {
  const cellSet = new Set();
  const cells = [];
  
  const startOffset = -Math.floor((width - 1) / 2);
  const endOffset = Math.floor(width / 2);
  
  /**
   * Add a cell and its width expansion to the cell set
   */
  const addCellWithWidth = (x, y, expandDir) => {
    if (expandDir === 'vertical' || expandDir === 'both') {
      for (let w = startOffset; w <= endOffset; w++) {
        const key = `${x},${y + w}`;
        if (!cellSet.has(key)) {
          cellSet.add(key);
          cells.push({ x: x, y: y + w });
        }
      }
    }
    if (expandDir === 'horizontal' || expandDir === 'both') {
      for (let w = startOffset; w <= endOffset; w++) {
        const key = `${x + w},${y}`;
        if (!cellSet.has(key)) {
          cellSet.add(key);
          cells.push({ x: x + w, y: y });
        }
      }
    }
  };
  
  for (let i = 0; i < path.length; i++) {
    const curr = path[i];
    const prev = path[i - 1];
    const next = path[i + 1];
    
    // Check for diagonal step from prev to curr - need to fill the gap
    if (prev) {
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      
      if (dx !== 0 && dy !== 0) {
        // Diagonal step detected - add fill cell(s) to connect orthogonally
        // Two options: (prev.x, curr.y) or (curr.x, prev.y)
        const fill1 = { x: prev.x, y: curr.y };
        const fill2 = { x: curr.x, y: prev.y };
        
        // Check which fills are safe
        const fill1Safe = !roomA || !wouldFillCauseIssues(fill1.x, fill1.y, allRooms, roomA, roomB);
        const fill2Safe = !roomA || !wouldFillCauseIssues(fill2.x, fill2.y, allRooms, roomA, roomB);
        
        // Add safe fill(s) - prefer adding both for a smoother corner if both are safe
        if (fill1Safe && fill2Safe) {
          // Add both for a nice filled corner
          addCellWithWidth(fill1.x, fill1.y, 'both');
          addCellWithWidth(fill2.x, fill2.y, 'both');
        } else if (fill1Safe) {
          addCellWithWidth(fill1.x, fill1.y, 'both');
        } else if (fill2Safe) {
          addCellWithWidth(fill2.x, fill2.y, 'both');
        }
        // If neither is safe, we skip the fill - corridor may have a gap
        // but this shouldn't happen often since we validate wobbles
      }
    }
    
    // Determine segment direction for width expansion
    let direction = 'both'; // Default: expand in both directions for corners
    
    if (prev && next) {
      const fromPrev = { dx: curr.x - prev.x, dy: curr.y - prev.y };
      const toNext = { dx: next.x - curr.x, dy: next.y - curr.y };
      
      // If moving horizontally, expand vertically
      if (fromPrev.dx !== 0 && toNext.dx !== 0 && fromPrev.dy === 0 && toNext.dy === 0) {
        direction = 'vertical';
      }
      // If moving vertically, expand horizontally
      else if (fromPrev.dy !== 0 && toNext.dy !== 0 && fromPrev.dx === 0 && toNext.dx === 0) {
        direction = 'horizontal';
      }
    } else if (prev) {
      direction = (prev.x !== curr.x) ? 'vertical' : 'horizontal';
    } else if (next) {
      direction = (next.x !== curr.x) ? 'vertical' : 'horizontal';
    }
    
    // Add cells for this path point
    addCellWithWidth(curr.x, curr.y, direction);
  }
  
  return cells;
}

// =============================================================================
// DIAGONAL CORRIDOR GENERATION
// =============================================================================

/**
 * Segment mapping for diagonal directions.
 * Each diagonal direction fills 4 segments (matching CORNER_SEGMENT_FILL pattern).
 */
const DIAGONAL_SEGMENTS = {
  // NE direction (moving right and up) - matches TR corner
  ne: { nw: true, n: true, ne: true, e: true },
  // SE direction (moving right and down) - matches BR corner
  se: { ne: true, e: true, se: true, s: true },
  // SW direction (moving left and down) - matches BL corner
  sw: { se: true, s: true, sw: true, w: true },
  // NW direction (moving left and up) - matches TL corner
  nw: { sw: true, w: true, nw: true, n: true }
};

/**
 * Determine the primary diagonal direction from one point to another.
 * @param {number} dx - X difference (positive = moving right)
 * @param {number} dy - Y difference (positive = moving down)
 * @returns {string|null} Diagonal direction ('ne', 'se', 'sw', 'nw') or null if not diagonal
 */
function getDiagonalDirection(dx, dy) {
  if (dx === 0 || dy === 0) return null;
  if (dx > 0 && dy < 0) return 'ne';  // Right and up
  if (dx > 0 && dy > 0) return 'se';  // Right and down
  if (dx < 0 && dy > 0) return 'sw';  // Left and down
  if (dx < 0 && dy < 0) return 'nw';  // Left and up
  return null;
}

/**
 * Check if rooms are positioned to allow a clean diagonal path.
 * Diagonals work best when rooms are offset both horizontally and vertically.
 * @returns {boolean} True if diagonal corridor is appropriate
 */
function canUseDiagonalCorridor(roomA, roomB, allRooms) {
  const centerA = getRoomCenter(roomA);
  const centerB = getRoomCenter(roomB);

  const dx = Math.abs(centerB.x - centerA.x);
  const dy = Math.abs(centerB.y - centerA.y);

  // Need at least 3 cells of offset in both directions for a visible diagonal
  if (dx < 3 || dy < 3) return false;

  // Check if diagonal path would cross another room
  const diagonalDir = getDiagonalDirection(centerB.x - centerA.x, centerB.y - centerA.y);
  if (!diagonalDir) return false;

  // Sample points along diagonal path
  const steps = Math.min(dx, dy);
  const stepX = (centerB.x - centerA.x) / steps;
  const stepY = (centerB.y - centerA.y) / steps;

  for (let i = 1; i < steps; i++) {
    const testX = Math.round(centerA.x + stepX * i);
    const testY = Math.round(centerA.y + stepY * i);

    for (const room of allRooms) {
      if (room.id === roomA.id || room.id === roomB.id) continue;
      if (isCellInRoomRect(testX, testY, room)) return false;
    }
  }

  return true;
}

/**
 * Create a segment cell for diagonal corridor.
 * @param {number} x - Cell X coordinate
 * @param {number} y - Cell Y coordinate
 * @param {string} diagonalDir - Diagonal direction ('ne', 'se', 'sw', 'nw')
 * @param {string} color - Cell color
 * @returns {Object} Cell with segments property
 */
function createDiagonalSegmentCell(x, y, diagonalDir, color) {
  return {
    x,
    y,
    color,
    segments: { ...DIAGONAL_SEGMENTS[diagonalDir] }
  };
}

/**
 * Carve a diagonal corridor between two rooms.
 * Uses segment cells for 45-degree paths, transitioning to full cells at room boundaries.
 * @param {Object} roomA - Source room
 * @param {Object} roomB - Destination room
 * @param {number} width - Corridor width (1 or 2)
 * @param {Array} allRooms - All rooms for collision checking
 * @param {string} color - Floor color
 * @returns {Object} { cells: Array, orderedPath: Array, width: number, hasDiagonals: boolean }
 */
function carveDiagonalCorridor(roomA, roomB, width, allRooms, color) {
  const centerA = getRoomCenter(roomA);
  const centerB = getRoomCenter(roomB);

  const dx = centerB.x - centerA.x;
  const dy = centerB.y - centerA.y;
  const xDir = dx > 0 ? 1 : -1;
  const yDir = dy > 0 ? 1 : -1;
  const diagonalDir = getDiagonalDirection(dx, dy);

  const cells = [];
  const orderedPath = [];
  const cellSet = new Set();

  const addCell = (cell) => {
    const key = cellKey(cell.x, cell.y);
    if (!cellSet.has(key)) {
      cellSet.add(key);
      cells.push(cell);
    }
  };

  let currentX = centerA.x;
  let currentY = centerA.y;

  // Phase 1: Exit room A with orthogonal cells
  while (isCellInRoomRect(currentX, currentY, roomA) ||
         isCellInRoomRect(currentX + xDir, currentY, roomA)) {
    orderedPath.push({ x: currentX, y: currentY });
    addCell({ x: currentX, y: currentY, color });
    if (width === 2) {
      // Add adjacent cell for width
      if (dy !== 0) addCell({ x: currentX + 1, y: currentY, color });
      else addCell({ x: currentX, y: currentY + 1, color });
    }
    currentX += xDir;
    if (currentX === centerB.x) break;
  }

  // Phase 2: Diagonal corridor with full cells at diagonal positions and segment cells in crooks
  // Crooks fill the triangular gaps between diagonal full cells with wedge-shaped segments
  const diagonalSteps = Math.min(Math.abs(centerB.x - currentX), Math.abs(centerB.y - currentY));

  // Crook segment patterns based on diagonal direction
  // Each direction needs specific segment wedges to create smooth 45° walls
  const CROOK_SEGMENTS = {
    se: { horizontal: 'sw', vertical: 'ne' },
    nw: { horizontal: 'ne', vertical: 'sw' },
    ne: { horizontal: 'nw', vertical: 'se' },
    sw: { horizontal: 'se', vertical: 'nw' }
  };
  const crookPattern = CROOK_SEGMENTS[diagonalDir];

  for (let i = 0; i < diagonalSteps; i++) {
    // Check if we're entering room B - add entry crook and stop diagonal
    if (isCellInRoomRect(currentX, currentY, roomB)) {
      // Add diagonal segment at room entry to smooth the diagonal wall termination
      addCell(createDiagonalSegmentCell(currentX, currentY, diagonalDir, color));
      break;
    }

    orderedPath.push({ x: currentX, y: currentY });

    // Place full cell at diagonal position
    addCell({ x: currentX, y: currentY, color });

    // Place segment cells in the crooks (triangular gaps)
    // Horizontal crook: adjacent in x direction
    addCell(createDiagonalSegmentCell(currentX + xDir, currentY, crookPattern.horizontal, color));
    // Vertical crook: adjacent in y direction
    addCell(createDiagonalSegmentCell(currentX, currentY + yDir, crookPattern.vertical, color));

    if (width === 2) {
      // Width 2: Add parallel diagonal track
      // Full cell on parallel diagonal
      const parallelX = (diagonalDir === 'ne' || diagonalDir === 'se') ? currentX + 1 : currentX - 1;
      const parallelY = (diagonalDir === 'se' || diagonalDir === 'sw') ? currentY + 1 : currentY - 1;
      addCell({ x: parallelX, y: parallelY, color });
    }

    currentX += xDir;
    currentY += yDir;
  }

  // Transition crook: fill the gap where diagonal meets orthogonal
  if (diagonalSteps > 0 && !isCellInRoomRect(currentX, currentY, roomB)) {
    const remainingX = centerB.x - currentX;
    const remainingY = centerB.y - currentY;

    if (remainingX !== 0 && remainingY === 0) {
      // Continuing horizontally only - add vertical crook behind current position
      addCell(createDiagonalSegmentCell(currentX - xDir, currentY, crookPattern.vertical, color));
    } else if (remainingY !== 0 && remainingX === 0) {
      // Continuing vertically only - add horizontal crook behind current position
      addCell(createDiagonalSegmentCell(currentX, currentY - yDir, crookPattern.horizontal, color));
    }
  }

  // Phase 3: Finish with orthogonal to room B center
  while (currentX !== centerB.x || currentY !== centerB.y) {
    orderedPath.push({ x: currentX, y: currentY });
    addCell({ x: currentX, y: currentY, color });
    if (width === 2) {
      if (currentX !== centerB.x) addCell({ x: currentX, y: currentY + 1, color });
      else addCell({ x: currentX + 1, y: currentY, color });
    }

    if (currentX !== centerB.x) currentX += xDir;
    else if (currentY !== centerB.y) currentY += yDir;
    else break;
  }

  // Add final cell
  orderedPath.push({ x: centerB.x, y: centerB.y });
  addCell({ x: centerB.x, y: centerB.y, color });

  return {
    cells,
    orderedPath,
    width,
    hasDiagonals: true
  };
}

/**
 * Carve corridors with diagonal style option.
 * @param {Array} connections - Room connection pairs
 * @param {number} corridorWidth - Base corridor width
 * @param {Array} allRooms - All rooms
 * @param {string} corridorStyle - 'straight', 'organic', or 'diagonal'
 * @param {number} diagonalChance - Probability of using diagonal (0-1)
 * @param {string} color - Floor color
 * @returns {Object} { cells: Array, byConnection: Array }
 */
function carveCorridorsWithDiagonals(connections, corridorWidth, allRooms, corridorStyle, diagonalChance, color) {
  const allCorridorCells = [];
  const corridorsByConnection = [];

  for (const [roomA, roomB] of connections) {
    let result;
    let usedDiagonal = false;

    // Try diagonal if style allows and rooms are suitable
    if (corridorStyle === 'diagonal' || (corridorStyle !== 'organic' && diagonalChance > 0)) {
      const tryDiagonal = corridorStyle === 'diagonal' || Math.random() < diagonalChance;

      if (tryDiagonal && canUseDiagonalCorridor(roomA, roomB, allRooms)) {
        result = carveDiagonalCorridor(roomA, roomB, corridorWidth, allRooms, color);
        usedDiagonal = true;
      }
    }

    // Fall back to standard corridor
    if (!usedDiagonal) {
      result = carveCorridorBetween(roomA, roomB, corridorWidth, allRooms);

      // Apply wobble for organic style
      if (corridorStyle === 'organic') {
        result = addCorridorWobble(result, allRooms, roomA, roomB);
      }
    }

    allCorridorCells.push(...result.cells);
    corridorsByConnection.push({
      roomA,
      roomB,
      cells: result.cells,
      orderedPath: result.orderedPath,
      width: result.width,
      hasDiagonals: usedDiagonal
    });
  }

  return { cells: allCorridorCells, byConnection: corridorsByConnection };
}

// =============================================================================
// PHASE 3.5: DOOR DETECTION
// =============================================================================

/**
 * Find door candidates by walking corridors and detecting room boundary crossings.
 * Uses actual room shape (isCellInRoom) for accurate detection with composite/circular rooms.
 */
function findDoorCandidatesForConnection(roomA, roomB, orderedPath, corridorWidth) {
  const candidates = [];

  if (orderedPath.length < 2) return candidates;

  let prevInA = isCellInRoom(orderedPath[0].x, orderedPath[0].y, roomA);
  let prevInB = isCellInRoom(orderedPath[0].x, orderedPath[0].y, roomB);

  for (let i = 1; i < orderedPath.length; i++) {
    const curr = orderedPath[i];
    const prev = orderedPath[i - 1];

    const currInA = isCellInRoom(curr.x, curr.y, roomA);
    const currInB = isCellInRoom(curr.x, curr.y, roomB);

    // Exiting room A
    if (prevInA && !currInA) {
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      const type = (dy === 0) ? 'door-vertical' : 'door-horizontal';
      const alignment = getAlignmentFromDelta(-dx, -dy);

      addDoorsForWidth(candidates, curr, type, alignment, roomA.id, corridorWidth, dx, dy);
    }

    // Entering room B
    if (!prevInB && currInB) {
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      const type = (dy === 0) ? 'door-vertical' : 'door-horizontal';
      const alignment = getAlignmentFromDelta(dx, dy);

      addDoorsForWidth(candidates, prev, type, alignment, roomB.id, corridorWidth, dx, dy);
    }

    prevInA = currInA;
    prevInB = currInB;
  }

  return candidates;
}

function getAlignmentFromDelta(dx, dy) {
  // Handle diagonal directions first
  if (dx !== 0 && dy !== 0) {
    if (dx > 0 && dy < 0) return 'ne';
    if (dx > 0 && dy > 0) return 'se';
    if (dx < 0 && dy > 0) return 'sw';
    if (dx < 0 && dy < 0) return 'nw';
  }
  // Cardinal directions
  if (dy < 0) return 'north';
  if (dy > 0) return 'south';
  if (dx < 0) return 'west';
  if (dx > 0) return 'east';
  return 'center';
}

function addDoorsForWidth(candidates, baseCell, type, alignment, roomId, width, pathDx, pathDy) {
  const startOffset = -Math.floor((width - 1) / 2);
  const endOffset = Math.floor(width / 2);

  // Spread perpendicular to path direction
  const spreadX = pathDy !== 0; // Vertical path = spread horizontally

  for (let w = startOffset; w <= endOffset; w++) {
    candidates.push({
      x: spreadX ? baseCell.x + w : baseCell.x,
      y: spreadX ? baseCell.y : baseCell.y + w,
      type,
      alignment,
      roomId,
      scale: 1,
      isSecret: false
    });
  }
}

/**
 * Check if a cell is on the perimeter of a room (not an interior cell).
 * A perimeter cell is one where at least one orthogonal neighbor is outside the room.
 */
function isCellOnRoomPerimeter(x, y, room) {
  if (!isCellInRoom(x, y, room)) return false;

  // Check if any orthogonal neighbor is outside the room
  return !isCellInRoom(x - 1, y, room) ||
         !isCellInRoom(x + 1, y, room) ||
         !isCellInRoom(x, y - 1, room) ||
         !isCellInRoom(x, y + 1, room);
}

/**
 * Validate a door position to filter out floating doors.
 * A valid door must be adjacent to its associated room (touching from outside).
 * @param {Object} pos - Door position with x, y, roomId
 * @param {Array} rooms - All rooms to find the associated room
 * @returns {boolean} True if door position is valid
 */
function isValidDoorPosition(pos, rooms) {
  const room = rooms.find(r => r.id === pos.roomId);
  if (!room) return false;

  // Door should be adjacent to its room (touching from outside)
  // Check if any orthogonal neighbor is inside the room
  return isCellInRoom(pos.x - 1, pos.y, room) ||
         isCellInRoom(pos.x + 1, pos.y, room) ||
         isCellInRoom(pos.x, pos.y - 1, room) ||
         isCellInRoom(pos.x, pos.y + 1, room);
}

function findDoorCandidates(corridorsByConnection, rooms) {
  const allCandidates = [];
  const globalProcessed = new Set();

  for (const { roomA, roomB, orderedPath, width } of corridorsByConnection) {
    const candidates = findDoorCandidatesForConnection(roomA, roomB, orderedPath, width);

    for (const candidate of candidates) {
      const key = `${candidate.x},${candidate.y},${candidate.alignment}`;
      // Validate door position to filter out floating doors
      if (!globalProcessed.has(key) && isValidDoorPosition(candidate, rooms)) {
        allCandidates.push(candidate);
        globalProcessed.add(key);
      }
    }
  }

  return allCandidates;
}

/**
 * Group door candidates into contiguous entrance groups and apply door/secret chances.
 */
function groupDoorCandidates(candidates) {
  if (candidates.length === 0) return [];
  
  // Group by roomId and alignment
  const groups = new Map();
  
  for (const door of candidates) {
    const groupKey = `${door.roomId}-${door.alignment}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey).push(door);
  }
  
  // Split non-contiguous doors into separate groups
  const finalGroups = [];
  
  for (const [, doorList] of groups) {
    // Sort by position
    doorList.sort((a, b) => {
      if (a.x !== b.x) return a.x - b.x;
      return a.y - b.y;
    });
    
    let currentGroup = [doorList[0]];
    
    for (let i = 1; i < doorList.length; i++) {
      const prev = doorList[i - 1];
      const curr = doorList[i];
      
      const isAdjacent = (Math.abs(curr.x - prev.x) <= 1 && curr.y === prev.y) ||
                         (Math.abs(curr.y - prev.y) <= 1 && curr.x === prev.x);
      
      if (isAdjacent) {
        currentGroup.push(curr);
      } else {
        finalGroups.push(currentGroup);
        currentGroup = [curr];
      }
    }
    
    finalGroups.push(currentGroup);
  }
  
  return finalGroups;
}

function findDoorPositions(corridorsByConnection, rooms, doorChance = 0.7, secretDoorChance = 0.05) {
  const candidates = findDoorCandidates(corridorsByConnection, rooms);
  const groups = groupDoorCandidates(candidates);
  
  const doorPositions = [];
  
  for (const group of groups) {
    // Roll once per entrance group
    if (Math.random() > doorChance) continue;
    
    // Roll once for secret door for this entrance
    const isSecret = Math.random() < secretDoorChance;
    
    // Mark all doors in group with same secret status
    for (const door of group) {
      doorPositions.push({
        ...door,
        isSecret,
        scale: group.length >= 2 ? 1.2 : 1 // Wider entrances = grander doors
      });
    }
  }
  
  return doorPositions;
}

function generateDoorObjects(doorPositions) {
  return doorPositions.map(pos => {
    // Calculate rotation based on alignment
    let rotation = 0;
    if (pos.alignment === 'ne' || pos.alignment === 'sw') {
      rotation = 45;
    } else if (pos.alignment === 'nw' || pos.alignment === 'se') {
      rotation = -45;
    } else if (pos.type === 'door-vertical' && pos.isSecret &&
               (pos.alignment === 'east' || pos.alignment === 'west')) {
      rotation = 90;
    }

    return {
      id: generateObjectId(),
      type: pos.isSecret ? 'secret-door' : pos.type,
      position: { x: pos.x, y: pos.y },
      alignment: pos.alignment,
      scale: pos.scale || 1,
      rotation
    };
  });
}

// =============================================================================
// PHASE 3.6: STAIR GENERATION
// =============================================================================

function getRoomCells(room) {
  const cells = [];
  for (let x = room.x; x < room.x + room.width; x++) {
    for (let y = room.y; y < room.y + room.height; y++) {
      if (isCellInRoom(x, y, room)) {
        cells.push({ x, y });
      }
    }
  }
  return cells;
}

function findEntryExitRooms(rooms) {
  if (rooms.length === 0) return { entry: null, exit: null };
  if (rooms.length === 1) return { entry: rooms[0], exit: rooms[0] };
  
  // Find topmost-leftmost room for entry (stairs down into dungeon)
  // Find bottommost-rightmost room for exit (stairs up out of dungeon)
  let entry = rooms[0];
  let exit = rooms[0];
  
  for (const room of rooms) {
    const roomCenter = getRoomCenter(room);
    const entryCenter = getRoomCenter(entry);
    const exitCenter = getRoomCenter(exit);
    
    // Entry: prefer top-left
    if (roomCenter.y < entryCenter.y || 
        (roomCenter.y === entryCenter.y && roomCenter.x < entryCenter.x)) {
      entry = room;
    }
    
    // Exit: prefer bottom-right
    if (roomCenter.y > exitCenter.y || 
        (roomCenter.y === exitCenter.y && roomCenter.x > exitCenter.x)) {
      exit = room;
    }
  }
  
  return { entry, exit };
}

function generateStairObjects(entryRoom, exitRoom) {
  const objects = [];
  
  if (entryRoom) {
    const entryCells = getRoomCells(entryRoom);
    if (entryCells.length > 0) {
      const cell = entryCells[Math.floor(Math.random() * entryCells.length)];
      objects.push({
        id: generateObjectId(),
        type: 'stairs-down',
        position: { x: cell.x, y: cell.y },
        alignment: 'center',
        scale: 1,
        rotation: 0
      });
    }
  }
  
  if (exitRoom && exitRoom !== entryRoom) {
    const exitCells = getRoomCells(exitRoom);
    if (exitCells.length > 0) {
      const cell = exitCells[Math.floor(Math.random() * exitCells.length)];
      objects.push({
        id: generateObjectId(),
        type: 'stairs-up',
        position: { x: cell.x, y: cell.y },
        alignment: 'center',
        scale: 1,
        rotation: 0
      });
    }
  }
  
  return objects;
}

// =============================================================================
// PHASE 3.7: WATER FEATURE GENERATION
// =============================================================================

/**
 * Select rooms to contain water based on waterChance.
 * Avoids entry/exit rooms.
 * @param {Array} rooms - All rooms
 * @param {number} waterChance - Probability (0-1) for each room to contain water
 * @param {number|null} entryRoomId - Entry room ID to exclude
 * @param {number|null} exitRoomId - Exit room ID to exclude
 * @returns {Array} Array of room IDs selected for water
 */
function selectWaterRooms(rooms, waterChance, entryRoomId, exitRoomId) {
  const waterRoomIds = [];

  for (const room of rooms) {
    // Skip entry/exit rooms
    if (room.id === entryRoomId || room.id === exitRoomId) continue;

    // Roll for water
    if (Math.random() < waterChance) {
      waterRoomIds.push(room.id);
    }
  }

  return waterRoomIds;
}

/**
 * Generate water cells for selected rooms.
 * Water is rendered as cells with a distinct blue color and reduced opacity.
 * @param {Array} rooms - All rooms
 * @param {Array} waterRoomIds - IDs of rooms to fill with water
 * @param {string} waterColor - Color for water cells
 * @param {number} waterOpacity - Opacity for water cells (0-1)
 * @returns {Array} Array of water cell objects {x, y, color, opacity}
 */
function generateWaterCells(rooms, waterRoomIds, waterColor, waterOpacity) {
  const waterCells = [];
  const waterRoomSet = new Set(waterRoomIds);

  for (const room of rooms) {
    if (!waterRoomSet.has(room.id)) continue;

    // Fill entire room with water
    for (let x = room.x; x < room.x + room.width; x++) {
      for (let y = room.y; y < room.y + room.height; y++) {
        if (isCellInRoom(x, y, room)) {
          waterCells.push({ x, y, color: waterColor, opacity: waterOpacity });
        }
      }
    }
  }

  return waterCells;
}

// =============================================================================
// PHASE 4: CELL GENERATION
// =============================================================================

function generateCells(rooms, corridorCells, color = DEFAULT_FLOOR_COLOR) {
  const cellMap = new Map();

  // Add room cells (always full cells)
  for (const room of rooms) {
    for (let x = room.x; x < room.x + room.width; x++) {
      for (let y = room.y; y < room.y + room.height; y++) {
        if (isCellInRoom(x, y, room)) {
          cellMap.set(cellKey(x, y), { x, y, color });
        }
      }
    }
  }

  // Add corridor cells (may include segment cells from diagonals)
  for (const cell of corridorCells) {
    const key = cellKey(cell.x, cell.y);
    const existing = cellMap.get(key);

    if (!existing) {
      // No existing cell - add corridor cell as-is (may be segment or full)
      if (cell.segments) {
        cellMap.set(key, { x: cell.x, y: cell.y, color: cell.color || color, segments: cell.segments });
      } else {
        cellMap.set(key, { x: cell.x, y: cell.y, color: cell.color || color });
      }
    } else if (cell.segments && !existing.segments) {
      // Existing is full cell, corridor has segments - keep full cell (room wins)
      // No change needed
    } else if (!cell.segments && existing.segments) {
      // Corridor is full cell, existing has segments - upgrade to full cell
      cellMap.set(key, { x: cell.x, y: cell.y, color: existing.color });
    }
    // If both have segments or both are full, existing wins (first write wins)
  }

  return Array.from(cellMap.values());
}

// =============================================================================
// MAIN GENERATION FUNCTION
// =============================================================================

function generateDungeon(presetName = 'medium', color = DEFAULT_FLOOR_COLOR, configOverrides = {}) {
  const baseConfig = DUNGEON_PRESETS[presetName] || DUNGEON_PRESETS.medium;
  
  // Apply style overrides if a style is specified
  let styleOverrides = {};
  if (configOverrides.style && DUNGEON_STYLES[configOverrides.style]) {
    styleOverrides = DUNGEON_STYLES[configOverrides.style].overrides;
  }
  
  // Merge: base preset <- style overrides <- user overrides
  // This allows user to tweak a style's defaults
  const config = { ...baseConfig, ...styleOverrides, ...configOverrides };
  
  // Phase 1: Generate rooms
  const rooms = generateRooms(config);
  
  // Phase 2: Build connection graph (MST with optional loops)
  const connections = buildConnectionGraph(rooms, config.loopChance || 0);
  
  // Phase 3: Carve corridors
  const useWideCorridors = Math.random() < (config.wideCorridorChance || 0);
  const corridorWidth = useWideCorridors ? 2 : (config.corridorWidth || 1);
  const corridorStyle = config.corridorStyle || 'straight';
  const diagonalChance = config.diagonalCorridorChance ?? 0;

  // Use diagonal-aware carving if diagonal corridors are enabled
  let corridorResult;
  if (diagonalChance > 0 || corridorStyle === 'diagonal') {
    corridorResult = carveCorridorsWithDiagonals(connections, corridorWidth, rooms, corridorStyle, diagonalChance, color);
  } else {
    corridorResult = carveCorridors(connections, corridorWidth, rooms, corridorStyle);
  }
  const corridorCells = corridorResult.cells;
  const corridorsByConnection = corridorResult.byConnection;
  
  // Phase 3a: Find door positions
  const doorPositions = findDoorPositions(
    corridorsByConnection,
    rooms,
    config.doorChance ?? 0.7,
    config.secretDoorChance ?? 0
  );
  const doorObjects = generateDoorObjects(doorPositions);
  
  // Phase 3b: Generate entry/exit stairs
  const { entry, exit } = findEntryExitRooms(rooms);
  const stairObjects = generateStairObjects(entry, exit);

  // Phase 3c: Generate water features
  const waterChance = config.waterChance ?? 0;
  const waterColor = config.waterColor ?? DEFAULT_WATER_COLOR;
  const waterOpacity = config.waterOpacity ?? DEFAULT_WATER_OPACITY;
  const waterRoomIds = selectWaterRooms(rooms, waterChance, entry?.id, exit?.id);
  const waterCells = generateWaterCells(rooms, waterRoomIds, waterColor, waterOpacity);

  // Combine all objects
  const objects = [...doorObjects, ...stairObjects];

  // Phase 4: Generate cells (floor first, then overlay water)
  const floorCells = generateCells(rooms, corridorCells, color);

  // Merge water cells - water overlays floor cells
  const cellMap = new Map();
  for (const cell of floorCells) {
    cellMap.set(cellKey(cell.x, cell.y), cell);
  }
  for (const cell of waterCells) {
    cellMap.set(cellKey(cell.x, cell.y), cell);
  }
  const cells = Array.from(cellMap.values());

  // Count secret doors for metadata
  const secretDoorCount = doorObjects.filter(o => o.type === 'secret-door').length;

  return {
    cells,
    objects,
    metadata: {
      rooms,
      connections: connections.map(([a, b]) => [a.id, b.id]),
      gridWidth: config.gridWidth,
      gridHeight: config.gridHeight,
      roomCount: rooms.length,
      doorCount: doorObjects.length,
      secretDoorCount,
      hasWideCorridors: useWideCorridors,
      hasDiagonalCorridors: corridorsByConnection.some(c => c.hasDiagonals),
      entryRoomId: entry?.id,
      exitRoomId: exit?.id,
      waterRoomIds,
      // Data for objectPlacer (dungeon stocking)
      corridorResult,
      doorPositions,
      style: config.style || 'classic'
    }
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

return {
  generateDungeon,
  DUNGEON_PRESETS,
  DUNGEON_STYLES,
  DEFAULT_FLOOR_COLOR,
  DEFAULT_WATER_COLOR,
  DEFAULT_WATER_OPACITY,
  DIAGONAL_SEGMENTS,

  // Individual phases
  generateRooms,
  buildConnectionGraph,
  carveCorridors,
  carveCorridorsWithDiagonals,
  carveDiagonalCorridor,
  generateCells,
  selectWaterRooms,
  generateWaterCells,

  // Utilities
  getRoomCenter,
  getRoomCells,
  getRoomDistance,
  isCellInRoom,
  isCellInRoomRect,
  isCellAdjacentToRoom,
  carveCorridorBetween,
  canUseDiagonalCorridor,
  getDiagonalDirection,
  findDoorCandidates,
  findDoorPositions,
  generateDoorObjects,
  findEntryExitRooms,
  generateStairObjects
};