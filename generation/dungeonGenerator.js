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
    gridWidth: 25,
    gridHeight: 25,
    roomCount: { min: 4, max: 6 },
    roomSize: { minWidth: 3, maxWidth: 6, minHeight: 3, maxHeight: 6 },
    padding: 2,
    corridorWidth: 1,
    circleChance: 0.3,
    loopChance: 0.05,
    doorChance: 0.7,
    secretDoorChance: 0.05,
    wideCorridorChance: 0
  },
  medium: {
    gridWidth: 40,
    gridHeight: 40,
    roomCount: { min: 6, max: 10 },
    roomSize: { minWidth: 4, maxWidth: 8, minHeight: 4, maxHeight: 8 },
    padding: 2,
    corridorWidth: 1,
    circleChance: 0.3,
    loopChance: 0.05,
    doorChance: 0.7,
    secretDoorChance: 0.05,
    wideCorridorChance: 0
  },
  large: {
    gridWidth: 60,
    gridHeight: 60,
    roomCount: { min: 10, max: 15 },
    roomSize: { minWidth: 4, maxWidth: 10, minHeight: 4, maxHeight: 10 },
    padding: 3,
    corridorWidth: 1,
    circleChance: 0.3,
    loopChance: 0.05,
    doorChance: 0.7,
    secretDoorChance: 0.05,
    wideCorridorChance: 0.4
  }
};

const DEFAULT_FLOOR_COLOR = '#c4a57b';

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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
// PHASE 1: ROOM GENERATION
// =============================================================================

function generateRooms(config) {
  const {
    gridWidth,
    gridHeight,
    roomCount,
    roomSize,
    padding,
    circleChance = 0
  } = config;
  
  const targetCount = randomInt(roomCount.min, roomCount.max);
  const rooms = [];
  const maxAttempts = targetCount * 50;
  let attempts = 0;
  
  while (rooms.length < targetCount && attempts < maxAttempts) {
    attempts++;
    
    const isCircle = Math.random() < circleChance;
    let newRoom;
    
    if (isCircle) {
      const minRadius = Math.floor(Math.min(roomSize.minWidth, roomSize.minHeight) / 2);
      const maxRadius = Math.floor(Math.max(roomSize.maxWidth, roomSize.maxHeight) / 2);
      const radius = randomInt(Math.max(2, minRadius), Math.max(3, maxRadius));
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
    } else {
      const width = randomInt(roomSize.minWidth, roomSize.maxWidth);
      const height = randomInt(roomSize.minHeight, roomSize.maxHeight);
      
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

function carveCorridors(connections, corridorWidth = 1, allRooms = []) {
  const allCorridorCells = [];
  const corridorsByConnection = [];
  
  for (const [roomA, roomB] of connections) {
    const result = carveCorridorBetween(roomA, roomB, corridorWidth, allRooms);
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
// PHASE 3.5: DOOR DETECTION
// =============================================================================

/**
 * Find door candidates by walking corridors and detecting room boundary crossings.
 * Uses rectangular bounds to avoid circular room corner issues.
 */
function findDoorCandidatesForConnection(roomA, roomB, orderedPath, corridorWidth) {
  const candidates = [];
  
  if (orderedPath.length < 2) return candidates;
  
  let prevInA = isCellInRoomRect(orderedPath[0].x, orderedPath[0].y, roomA);
  let prevInB = isCellInRoomRect(orderedPath[0].x, orderedPath[0].y, roomB);
  
  for (let i = 1; i < orderedPath.length; i++) {
    const curr = orderedPath[i];
    const prev = orderedPath[i - 1];
    
    const currInA = isCellInRoomRect(curr.x, curr.y, roomA);
    const currInB = isCellInRoomRect(curr.x, curr.y, roomB);
    
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

function findDoorCandidates(corridorsByConnection) {
  const allCandidates = [];
  const globalProcessed = new Set();
  
  for (const { roomA, roomB, orderedPath, width } of corridorsByConnection) {
    const candidates = findDoorCandidatesForConnection(roomA, roomB, orderedPath, width);
    
    for (const candidate of candidates) {
      const key = `${candidate.x},${candidate.y},${candidate.alignment}`;
      if (!globalProcessed.has(key)) {
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

function findDoorPositions(corridorsByConnection, doorChance = 0.7, secretDoorChance = 0.05) {
  const candidates = findDoorCandidates(corridorsByConnection);
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
  return doorPositions.map(pos => ({
    id: generateObjectId(),
    type: pos.isSecret ? 'secret-door' : pos.type,
    position: { x: pos.x, y: pos.y },
    alignment: pos.alignment,
    scale: pos.scale || 1,
    rotation: (pos.type === 'door-vertical' && pos.isSecret && 
               (pos.alignment === 'east' || pos.alignment === 'west')) ? 90 : 0
  }));
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
// PHASE 4: CELL GENERATION
// =============================================================================

function generateCells(rooms, corridorCells, color = DEFAULT_FLOOR_COLOR) {
  const cellMap = new Map();
  
  // Add room cells
  for (const room of rooms) {
    for (let x = room.x; x < room.x + room.width; x++) {
      for (let y = room.y; y < room.y + room.height; y++) {
        if (isCellInRoom(x, y, room)) {
          cellMap.set(cellKey(x, y), { x, y, color });
        }
      }
    }
  }
  
  // Add corridor cells
  for (const cell of corridorCells) {
    const key = cellKey(cell.x, cell.y);
    if (!cellMap.has(key)) {
      cellMap.set(key, { x: cell.x, y: cell.y, color });
    }
  }
  
  return Array.from(cellMap.values());
}

// =============================================================================
// MAIN GENERATION FUNCTION
// =============================================================================

function generateDungeon(presetName = 'medium', color = DEFAULT_FLOOR_COLOR) {
  const config = DUNGEON_PRESETS[presetName] || DUNGEON_PRESETS.medium;
  
  // Phase 1: Generate rooms
  const rooms = generateRooms(config);
  
  // Phase 2: Build connection graph (MST with optional loops)
  const connections = buildConnectionGraph(rooms, config.loopChance || 0);
  
  // Phase 3: Carve corridors
  const useWideCorridors = Math.random() < (config.wideCorridorChance || 0);
  const corridorWidth = useWideCorridors ? 2 : (config.corridorWidth || 1);
  const corridorResult = carveCorridors(connections, corridorWidth, rooms);
  const corridorCells = corridorResult.cells;
  const corridorsByConnection = corridorResult.byConnection;
  
  // Phase 3a: Find door positions
  const doorPositions = findDoorPositions(
    corridorsByConnection, 
    config.doorChance ?? 0.7, 
    config.secretDoorChance ?? 0
  );
  const doorObjects = generateDoorObjects(doorPositions);
  
  // Phase 3b: Generate entry/exit stairs
  const { entry, exit } = findEntryExitRooms(rooms);
  const stairObjects = generateStairObjects(entry, exit);
  
  // Combine all objects
  const objects = [...doorObjects, ...stairObjects];
  
  // Phase 4: Generate cells
  const cells = generateCells(rooms, corridorCells, color);
  
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
      entryRoomId: entry?.id,
      exitRoomId: exit?.id
    }
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

return {
  generateDungeon,
  DUNGEON_PRESETS,
  DEFAULT_FLOOR_COLOR,
  
  // Individual phases
  generateRooms,
  buildConnectionGraph,
  carveCorridors,
  generateCells,
  
  // Utilities
  getRoomCenter,
  getRoomCells,
  getRoomDistance,
  isCellInRoom,
  isCellInRoomRect,
  isCellAdjacentToRoom,
  carveCorridorBetween,
  findDoorCandidates,
  findDoorPositions,
  generateDoorObjects,
  findEntryExitRooms,
  generateStairObjects
};