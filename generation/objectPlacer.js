/**
 * objectPlacer.js
 *
 * Dungeon stocking module for Windrose MapDesigner.
 * Places objects (monsters, traps, treasure, features) in generated dungeons
 * using B/X-style random tables with configurable weights.
 */

// =============================================================================
// TYPE DEFINITIONS (JSDoc)
// =============================================================================

/**
 * @typedef {Object} CellPosition
 * @property {number} x - Grid X coordinate
 * @property {number} y - Grid Y coordinate
 */

/**
 * @typedef {Object} PlacementZones
 * @property {CellPosition[]} center - Center area cells
 * @property {CellPosition[]} corners - Corner cells
 * @property {CellPosition[]} walls - Wall-adjacent cells
 * @property {CellPosition[]} doorAdjacent - Cells near doors (excluded from placement)
 * @property {CellPosition[]} scattered - All valid cells for random placement
 */

/**
 * @typedef {Object} PlacementContext
 * @property {string} [category] - Room category ('monster', 'trap', 'feature', 'empty')
 * @property {boolean} [isTreasure] - Whether this is a treasure object
 * @property {string} [templateName] - Template name if using a room template
 * @property {boolean} [isCorridor] - Whether placed in a corridor
 */

/**
 * @typedef {Object} PlacedObject
 * @property {string} id - Unique object ID
 * @property {string} type - Object type ID
 * @property {CellPosition} position - Grid position
 * @property {{width: number, height: number}} size - Object size in cells
 * @property {string} alignment - Cell alignment
 * @property {number} scale - Render scale
 * @property {number} rotation - Rotation in degrees
 * @property {string} label - Display label
 * @property {string} [customTooltip] - Tooltip text (if applicable)
 */

/**
 * @typedef {Object} RoomDefinition
 * @property {number} id - Room ID
 * @property {number} x - Top-left X
 * @property {number} y - Top-left Y
 * @property {number} width - Room width
 * @property {number} height - Room height
 * @property {string} [shape] - Room shape ('rectangle', 'circle', 'composite')
 */

// =============================================================================
// CONSTANTS
// =============================================================================

const ROOM_CATEGORIES = {
  MONSTER: 'monster',
  EMPTY: 'empty',
  FEATURE: 'feature',
  TRAP: 'trap'
};

/**
 * Default stocking configuration based on B/X D&D.
 * Monster: 33%, Empty: 33%, Feature: 17%, Trap: 17%
 */
const STOCKING_CONFIG = {
  categoryWeights: {
    monster: 0.33,
    empty: 0.33,
    feature: 0.17,
    trap: 0.17
  },
  // Secondary treasure roll by category (B/X style)
  treasureChance: {
    monster: 0.50,  // Monster rooms: 3-in-6 treasure
    trap: 0.33,     // Trap rooms: 2-in-6 treasure (bait)
    empty: 0.17,    // Empty rooms: 1-in-6 hidden treasure
    feature: 0.0    // Feature rooms don't get secondary treasure
  },
  // Room size thresholds (in cells)
  sizeThresholds: {
    small: 6,   // 3-6 cells: 1-2 objects
    medium: 15  // 7-15 cells: 2-4 objects, 16+: 4-6 objects
  },
  // Corridor trap settings
  corridorTrapRatio: 0.6  // 60% of traps go in corridors
};

// =============================================================================
// STYLE-SPECIFIC OBJECT POOLS
// =============================================================================

const STYLE_OBJECT_POOLS = {
  classic: {
    monsters: ['monster', 'guard'],
    treasures: ['chest', 'sack'],
    features: ['table', 'chair', 'statue', 'crate', 'altar'],
    traps: ['trap', 'pit', 'hazard']
  },
  cavern: {
    monsters: ['monster'],
    treasures: ['chest', 'sack'],
    features: ['plant', 'flower', 'fountain', 'statue'],
    traps: ['pit', 'hazard']
  },
  fortress: {
    monsters: ['monster', 'guard', 'guard'],  // Weighted toward guards
    treasures: ['chest', 'crate'],
    features: ['table', 'chair', 'bed', 'anvil', 'statue', 'crate'],
    traps: ['trap', 'pit']
  },
  crypt: {
    monsters: ['monster', 'boss-alt'],  // Undead theme
    treasures: ['chest', 'sack'],
    features: ['coffin', 'altar', 'statue', 'cage'],
    traps: ['trap', 'hazard', 'poison']
  }
};

// =============================================================================
// WATER ROOM PLACEMENT RULES
// =============================================================================

/**
 * Water room object placement configuration.
 * Water rooms have restricted object placement - objects must be on shores/edges.
 */
const WATER_PLACEMENT_RULES = {
  // Objects allowed on island/center (30% chance of center feature)
  centerFeatures: ['fountain', 'statue'],
  // Objects allowed on shore (outer ring of room)
  shoreObjects: ['chest', 'monster', 'sack'],
  // Objects excluded from water rooms entirely
  excluded: ['table', 'chair', 'bed', 'coffin', 'book', 'crate', 'trap', 'pit', 'guard'],
  // Budget reduction factor for water rooms
  budgetDivisor: 12,
  // Chance of placing a center feature (island)
  centerFeatureChance: 0.3,
  // Cavern style allows monsters in deep water (aquatic creatures)
  deepWaterMonsterStyles: ['cavern']
};

// =============================================================================
// ROOM TEMPLATES
// =============================================================================

const ROOM_TEMPLATES = {
  library: {
    name: 'Library',
    objects: [
      { type: 'book', count: { min: 2, max: 4 }, placement: 'walls' },
      { type: 'table', count: { min: 0, max: 1 }, placement: 'center' }
    ],
    minRoomSize: 9
  },
  storage: {
    name: 'Storage',
    objects: [
      { type: 'crate', count: { min: 2, max: 5 }, placement: 'scattered' },
      { type: 'sack', count: { min: 0, max: 2 }, placement: 'corners' }
    ],
    minRoomSize: 6
  },
  shrine: {
    name: 'Shrine',
    objects: [
      { type: 'altar', count: { min: 1, max: 1 }, placement: 'center' },
      { type: 'statue', count: { min: 0, max: 2 }, placement: 'flanking' }
    ],
    minRoomSize: 9
  },
  barracks: {
    name: 'Barracks',
    objects: [
      { type: 'bed', count: { min: 2, max: 4 }, placement: 'walls' },
      { type: 'table', count: { min: 0, max: 1 }, placement: 'center' },
      { type: 'chest', count: { min: 0, max: 1 }, placement: 'corners' }
    ],
    minRoomSize: 12
  },
  treasury: {
    name: 'Treasury',
    objects: [
      { type: 'chest', count: { min: 2, max: 4 }, placement: 'walls' },
      { type: 'sack', count: { min: 0, max: 2 }, placement: 'scattered' }
    ],
    minRoomSize: 6
  },
  guardRoom: {
    name: 'Guard Room',
    objects: [
      { type: 'guard', count: { min: 1, max: 3 }, placement: 'scattered' },
      { type: 'table', count: { min: 0, max: 1 }, placement: 'center' }
    ],
    minRoomSize: 9
  }
};

// =============================================================================
// PLACEMENT PREFERENCES
// =============================================================================

const PLACEMENT_PREFERENCES = {
  // Monsters can be anywhere
  monster: ['scattered', 'center'],
  guard: ['scattered', 'center'],
  boss: ['center'],
  'boss-alt': ['center'],

  // Treasure near walls/corners
  chest: ['corners', 'walls'],
  sack: ['corners', 'walls', 'scattered'],

  // Furniture has specific preferences
  altar: ['center'],
  statue: ['corners', 'walls', 'center'],
  table: ['center'],
  chair: ['center', 'scattered'],
  bed: ['walls', 'corners'],
  coffin: ['walls', 'center'],
  book: ['walls'],
  crate: ['corners', 'walls', 'scattered'],
  cauldron: ['center'],
  fountain: ['center'],
  anvil: ['walls', 'corners'],
  cage: ['walls', 'corners'],

  // Nature
  plant: ['corners', 'scattered'],
  flower: ['scattered'],

  // Hazards
  trap: ['center', 'scattered'],
  pit: ['center'],
  hazard: ['scattered'],
  poison: ['scattered']
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateObjectId() {
  return 'obj-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

function cellKey(x, y) {
  return `${x},${y}`;
}

/**
 * Select a random item from an array.
 */
function selectFromPool(pool) {
  if (!pool || pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Roll a weighted category selection.
 * @param {Object} weights - Object with category names as keys and weights as values
 * @returns {string} Selected category name
 */
function rollWeightedCategory(weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);

  if (total === 0) return ROOM_CATEGORIES.EMPTY;

  let roll = Math.random() * total;

  for (const [category, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return category;
  }

  return entries[entries.length - 1][0];
}

/**
 * Normalize weights to sum to 1.0.
 */
function normalizeWeights(weights) {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (sum === 0) {
    return {
      monster: 0.25,
      empty: 0.25,
      feature: 0.25,
      trap: 0.25
    };
  }

  const normalized = {};
  for (const [key, val] of Object.entries(weights)) {
    normalized[key] = val / sum;
  }
  return normalized;
}

// =============================================================================
// TOOLTIP GENERATION
// =============================================================================

/**
 * Object type labels for display.
 */
const OBJECT_LABELS = {
  // Monsters
  monster: 'Monster',
  guard: 'Guard',
  boss: 'Boss',
  'boss-alt': 'Boss',

  // Treasures
  chest: 'Chest',
  sack: 'Sack',
  crate: 'Crate',

  // Furniture
  altar: 'Altar',
  statue: 'Statue',
  table: 'Table',
  chair: 'Chair',
  bed: 'Bed',
  coffin: 'Coffin',
  book: 'Bookshelf',
  cauldron: 'Cauldron',
  fountain: 'Fountain',
  anvil: 'Anvil',
  cage: 'Cage',

  // Nature
  plant: 'Plant',
  flower: 'Flowers',

  // Hazards
  trap: 'Trap',
  pit: 'Pit',
  hazard: 'Hazard',
  poison: 'Poison'
};

/**
 * Get display label for an object type.
 * @param {string} objectType - The object type ID
 * @returns {string} Human-readable label
 */
function getObjectLabel(objectType) {
  return OBJECT_LABELS[objectType] || objectType.charAt(0).toUpperCase() + objectType.slice(1);
}

/**
 * Generate contextual tooltip for a placed object.
 * @param {string} objectType - The object type ID
 * @param {Object} context - Placement context
 * @param {string} context.category - Room category (monster, trap, feature, empty)
 * @param {boolean} context.isTreasure - Whether this is a treasure object
 * @param {string} context.templateName - Template name if applicable
 * @param {boolean} context.isCorridor - Whether placed in corridor
 * @returns {string} Tooltip text
 */
function getObjectTooltip(objectType, context = {}) {
  const { category, isTreasure, templateName, isCorridor } = context;

  // Corridor traps
  if (isCorridor) {
    return 'Corridor trap';
  }

  // Treasure objects get special tooltips based on room category
  if (isTreasure) {
    if (category === 'monster') {
      return 'Guarded treasure';
    }
    if (category === 'trap') {
      return 'Trapped treasure (bait)';
    }
    if (category === 'empty') {
      return 'Hidden treasure';
    }
  }

  // Monster category
  if (category === 'monster') {
    if (objectType === 'guard') {
      return 'Guard post';
    }
    return 'Monster lair';
  }

  // Trap category
  if (category === 'trap') {
    return 'Trapped area';
  }

  // Feature category with template
  if (templateName) {
    return `${templateName} furnishing`;
  }

  // Feature category without template
  if (category === 'feature') {
    return 'Room feature';
  }

  // Default
  return null;
}

// =============================================================================
// ROOM ANALYSIS
// =============================================================================

/**
 * Get all cells belonging to a room.
 */
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

/**
 * Check if a cell is inside a room (respects shape).
 */
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
    return room.parts.some(part =>
      x >= part.x && x < part.x + part.width &&
      y >= part.y && y < part.y + part.height
    );
  }

  return true;
}

/**
 * Calculate object budget based on room size and density multiplier.
 */
function getObjectBudget(roomSize, densityMultiplier = 1.0) {
  let base;

  if (roomSize <= STOCKING_CONFIG.sizeThresholds.small) {
    // Small rooms: 1-2 objects
    base = randomInt(1, 2);
  } else if (roomSize <= STOCKING_CONFIG.sizeThresholds.medium) {
    // Medium rooms: 2-4 objects
    base = randomInt(2, 4);
  } else {
    // Large rooms: 4-6 objects
    base = randomInt(4, 6);
  }

  return Math.max(1, Math.round(base * densityMultiplier));
}

// =============================================================================
// PLACEMENT ZONE IDENTIFICATION
// =============================================================================

/**
 * Identify placement zones within a room.
 * @param {Array} roomCells - All cells in the room
 * @param {Object} room - Room object with bounds
 * @param {Array} doorPositions - Door positions to avoid
 * @returns {Object} Zones: center, corners, walls, scattered, doorAdjacent
 */
function identifyPlacementZones(roomCells, room, doorPositions = []) {
  const zones = {
    center: [],
    corners: [],
    walls: [],
    doorAdjacent: [],
    scattered: []
  };

  // Build door position set for quick lookup
  const doorCells = new Set(doorPositions.map(d => cellKey(d.x, d.y)));
  const doorAdjacentCells = new Set();

  // Mark cells adjacent to doors
  for (const door of doorPositions) {
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      doorAdjacentCells.add(cellKey(door.x + dx, door.y + dy));
    }
  }

  // Calculate room bounds for zone classification
  const minX = room.x;
  const maxX = room.x + room.width - 1;
  const minY = room.y;
  const maxY = room.y + room.height - 1;

  // Classify each cell
  for (const cell of roomCells) {
    const key = cellKey(cell.x, cell.y);

    // Skip door cells and adjacent cells
    if (doorCells.has(key)) {
      zones.doorAdjacent.push(cell);
      continue;
    }
    if (doorAdjacentCells.has(key)) {
      zones.doorAdjacent.push(cell);
      continue;
    }

    const isCorner = isCornerCell(cell, minX, maxX, minY, maxY);
    const isWall = isWallCell(cell, minX, maxX, minY, maxY);
    const isCenter = !isWall;

    if (isCorner) {
      zones.corners.push(cell);
    } else if (isWall) {
      zones.walls.push(cell);
    } else if (isCenter) {
      zones.center.push(cell);
    }

    // All valid cells go in scattered
    zones.scattered.push(cell);
  }

  return zones;
}

/**
 * Check if a cell is in a corner of the room.
 */
function isCornerCell(cell, minX, maxX, minY, maxY) {
  const nearLeft = cell.x <= minX + 1;
  const nearRight = cell.x >= maxX - 1;
  const nearTop = cell.y <= minY + 1;
  const nearBottom = cell.y >= maxY - 1;

  return (nearLeft || nearRight) && (nearTop || nearBottom);
}

/**
 * Check if a cell is along a wall (edge) but not a corner.
 */
function isWallCell(cell, minX, maxX, minY, maxY) {
  return cell.x === minX || cell.x === maxX ||
         cell.y === minY || cell.y === maxY;
}

// =============================================================================
// OBJECT PLACEMENT
// =============================================================================

/**
 * Place a single object at a valid position.
 * @param {PlacementZones} zones - Placement zones
 * @param {string} objectType - Object type ID
 * @param {Set<string>} occupiedCells - Set of occupied cell keys
 * @param {string|null} preferredZone - Preferred zone ('center', 'corners', 'walls', 'scattered')
 * @param {PlacementContext} context - Placement context for tooltip generation
 * @returns {PlacedObject|null} Object definition or null if no valid position
 */
function placeObject(zones, objectType, occupiedCells, preferredZone = null, context = {}) {
  // Determine zone preference order
  const preferences = preferredZone
    ? [preferredZone, 'scattered']
    : (PLACEMENT_PREFERENCES[objectType] || ['scattered']);

  for (const zoneName of preferences) {
    const zone = zones[zoneName];
    if (!zone || zone.length === 0) continue;

    // Find available cells in this zone
    const available = zone.filter(cell => !occupiedCells.has(cellKey(cell.x, cell.y)));
    if (available.length === 0) continue;

    // Select a random cell
    const cell = available[Math.floor(Math.random() * available.length)];
    occupiedCells.add(cellKey(cell.x, cell.y));

    // Generate label and tooltip
    const label = getObjectLabel(objectType);
    const customTooltip = getObjectTooltip(objectType, context);

    const obj = {
      id: generateObjectId(),
      type: objectType,
      position: { x: cell.x, y: cell.y },
      size: { width: 1, height: 1 },
      alignment: 'center',
      scale: 1,
      rotation: 0,
      label
    };

    // Only add customTooltip if we have one
    if (customTooltip) {
      obj.customTooltip = customTooltip;
    }

    return obj;
  }

  return null;
}

/**
 * Place multiple objects from a pool.
 * @param {PlacementZones} zones - Placement zones
 * @param {string[]} pool - Object type pool to select from
 * @param {number} count - Number of objects to place
 * @param {Set<string>} occupiedCells - Set of occupied cell keys
 * @param {string|null} preferredZone - Optional preferred zone
 * @param {PlacementContext} context - Placement context for tooltip generation
 * @returns {PlacedObject[]} Placed objects
 */
function placeObjects(zones, pool, count, occupiedCells, preferredZone = null, context = {}) {
  const placed = [];

  for (let i = 0; i < count; i++) {
    const objectType = selectFromPool(pool);
    if (!objectType) continue;

    const obj = placeObject(zones, objectType, occupiedCells, preferredZone, context);
    if (obj) {
      placed.push(obj);
    }
  }

  return placed;
}

// =============================================================================
// ROOM TEMPLATES
// =============================================================================

/**
 * Select a valid template for the given room size.
 */
function selectValidTemplate(roomSize) {
  const validTemplates = Object.entries(ROOM_TEMPLATES)
    .filter(([, template]) => roomSize >= template.minRoomSize);

  if (validTemplates.length === 0) return null;

  const [, template] = validTemplates[Math.floor(Math.random() * validTemplates.length)];
  return template;
}

/**
 * @typedef {Object} TemplateObjectSpec
 * @property {string} type - Object type ID
 * @property {{min: number, max: number}} count - Count range
 * @property {string} placement - Preferred placement zone
 */

/**
 * @typedef {Object} RoomTemplate
 * @property {string} name - Template display name
 * @property {TemplateObjectSpec[]} objects - Objects to place
 * @property {number} minRoomSize - Minimum room size for this template
 */

/**
 * Apply a room template, placing all its objects.
 * @param {RoomTemplate} template - Room template definition
 * @param {PlacementZones} zones - Placement zones
 * @param {Set<string>} occupiedCells - Set of occupied cell keys
 * @returns {PlacedObject[]} Placed objects
 */
function applyRoomTemplate(template, zones, occupiedCells) {
  const placed = [];
  const context = { category: 'feature', templateName: template.name };

  for (const spec of template.objects) {
    const count = randomInt(spec.count.min, spec.count.max);

    for (let i = 0; i < count; i++) {
      const obj = placeObject(zones, spec.type, occupiedCells, spec.placement, context);
      if (obj) {
        placed.push(obj);
      }
    }
  }

  return placed;
}

// =============================================================================
// CORRIDOR TRAP PLACEMENT
// =============================================================================

/**
 * Find cells that are only in corridors (not in any room).
 */
function findCorridorOnlyCells(corridorCells, rooms) {
  return corridorCells.filter(cell => {
    for (const room of rooms) {
      if (isCellInRoom(cell.x, cell.y, room)) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Select a position for a corridor trap.
 */
function selectCorridorTrapPosition(corridorCells, occupiedCells) {
  const available = corridorCells.filter(cell =>
    !occupiedCells.has(cellKey(cell.x, cell.y))
  );

  if (available.length === 0) return null;

  return available[Math.floor(Math.random() * available.length)];
}

// =============================================================================
// WATER ROOM OBJECT PLACEMENT
// =============================================================================

/**
 * Identify shore cells (outer ring) vs deep water cells (center) in a room.
 * Shore cells are any cells on the edge of the room or within 1 cell of the edge.
 * @param {Array} roomCells - All cells in the room
 * @param {Object} room - Room object with bounds
 * @returns {Object} { shore: CellPosition[], deepWater: CellPosition[] }
 */
function identifyWaterZones(roomCells, room) {
  const shore = [];
  const deepWater = [];

  const minX = room.x;
  const maxX = room.x + room.width - 1;
  const minY = room.y;
  const maxY = room.y + room.height - 1;

  for (const cell of roomCells) {
    // Shore = outer ring (edge or 1 cell from edge)
    const distFromEdge = Math.min(
      cell.x - minX,
      maxX - cell.x,
      cell.y - minY,
      maxY - cell.y
    );

    if (distFromEdge <= 1) {
      shore.push(cell);
    } else {
      deepWater.push(cell);
    }
  }

  return { shore, deepWater };
}

/**
 * Stock a water room with appropriate objects.
 * Water rooms have special placement rules:
 * - Most objects on shore only (outer ring)
 * - 30% chance of center island feature
 * - Reduced object budget
 * - Cavern style allows aquatic monsters in deep water
 *
 * @param {Object} room - Room definition
 * @param {Array} roomCells - All cells in the room
 * @param {Object} roomDoors - Door positions in this room
 * @param {string} style - Dungeon style
 * @param {Set<string>} occupiedCells - Set of occupied cell keys
 * @returns {Object} { objects: PlacedObject[], assignment: { category, isWater: true } }
 */
function stockWaterRoom(room, roomCells, roomDoors, style, occupiedCells) {
  const objects = [];
  const waterZones = identifyWaterZones(roomCells, room);

  // Calculate reduced budget for water rooms
  const budget = Math.max(1, Math.floor(roomCells.length / WATER_PLACEMENT_RULES.budgetDivisor));

  // Build door-adjacent exclusion set
  const doorAdjacentCells = new Set();
  for (const door of roomDoors) {
    doorAdjacentCells.add(cellKey(door.x, door.y));
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      doorAdjacentCells.add(cellKey(door.x + dx, door.y + dy));
    }
  }

  // Filter shore cells to exclude door-adjacent
  const availableShore = waterZones.shore.filter(
    cell => !doorAdjacentCells.has(cellKey(cell.x, cell.y))
  );

  // 30% chance of center island feature (fountain or statue)
  if (waterZones.deepWater.length > 0 && Math.random() < WATER_PLACEMENT_RULES.centerFeatureChance) {
    const centerCells = waterZones.deepWater.filter(
      cell => !occupiedCells.has(cellKey(cell.x, cell.y))
    );
    if (centerCells.length > 0) {
      const cell = centerCells[Math.floor(Math.random() * centerCells.length)];
      const featureType = selectFromPool(WATER_PLACEMENT_RULES.centerFeatures);
      occupiedCells.add(cellKey(cell.x, cell.y));
      objects.push({
        id: generateObjectId(),
        type: featureType,
        position: { x: cell.x, y: cell.y },
        size: { width: 1, height: 1 },
        alignment: 'center',
        scale: 1,
        rotation: 0,
        label: getObjectLabel(featureType),
        customTooltip: 'Island feature'
      });
    }
  }

  // Cavern style: chance of aquatic monster in deep water
  if (WATER_PLACEMENT_RULES.deepWaterMonsterStyles.includes(style)) {
    if (waterZones.deepWater.length > 0 && Math.random() < 0.3) {
      const deepCells = waterZones.deepWater.filter(
        cell => !occupiedCells.has(cellKey(cell.x, cell.y))
      );
      if (deepCells.length > 0) {
        const cell = deepCells[Math.floor(Math.random() * deepCells.length)];
        occupiedCells.add(cellKey(cell.x, cell.y));
        objects.push({
          id: generateObjectId(),
          type: 'monster',
          position: { x: cell.x, y: cell.y },
          size: { width: 1, height: 1 },
          alignment: 'center',
          scale: 1,
          rotation: 0,
          label: getObjectLabel('monster'),
          customTooltip: 'Aquatic creature'
        });
      }
    }
  }

  // Place remaining objects on shore
  const shorePool = WATER_PLACEMENT_RULES.shoreObjects;
  for (let i = 0; i < budget && availableShore.length > 0; i++) {
    const available = availableShore.filter(
      cell => !occupiedCells.has(cellKey(cell.x, cell.y))
    );
    if (available.length === 0) break;

    const cell = available[Math.floor(Math.random() * available.length)];
    const objectType = selectFromPool(shorePool);
    occupiedCells.add(cellKey(cell.x, cell.y));

    objects.push({
      id: generateObjectId(),
      type: objectType,
      position: { x: cell.x, y: cell.y },
      size: { width: 1, height: 1 },
      alignment: 'center',
      scale: 1,
      rotation: 0,
      label: getObjectLabel(objectType),
      customTooltip: 'Shore placement'
    });
  }

  return {
    objects,
    assignment: { category: 'water', isWater: true, hasSecondaryTreasure: false }
  };
}

// =============================================================================
// MAIN STOCKING FUNCTION
// =============================================================================

/**
 * Stock a dungeon with objects using B/X-style random tables.
 *
 * @param {Array} rooms - Generated rooms
 * @param {Object} corridorResult - Corridor generation result (cells, byConnection)
 * @param {Array} doorPositions - Door positions (to avoid placement)
 * @param {string} style - Dungeon style ('classic', 'cavern', 'fortress', 'crypt')
 * @param {Object} config - Stocking configuration
 * @param {Object} options - Additional options (entryRoomId, exitRoomId, waterRoomIds)
 * @returns {Object} { objects: MapObject[], roomAssignments: {} }
 */
function stockDungeon(rooms, corridorResult, doorPositions, style = 'classic', config = {}, options = {}) {
  const stockedObjects = [];
  const roomAssignments = {};
  const occupiedCells = new Set();

  // Get style-specific object pool
  const objectPool = STYLE_OBJECT_POOLS[style] || STYLE_OBJECT_POOLS.classic;

  // Build water room lookup set
  const waterRoomSet = new Set(options.waterRoomIds || []);

  // Merge config with defaults
  const categoryWeights = normalizeWeights({
    monster: config.monsterWeight ?? STOCKING_CONFIG.categoryWeights.monster,
    empty: config.emptyWeight ?? STOCKING_CONFIG.categoryWeights.empty,
    feature: config.featureWeight ?? STOCKING_CONFIG.categoryWeights.feature,
    trap: config.trapWeight ?? STOCKING_CONFIG.categoryWeights.trap
  });

  const densityMultiplier = config.objectDensity ?? 1.0;
  const useTemplates = config.useTemplates !== false;
  const corridorTrapChance = config.corridorTrapChance ?? 0.1;

  // Mark existing object positions as occupied (doors, stairs)
  for (const door of doorPositions) {
    occupiedCells.add(cellKey(door.x, door.y));
  }

  // Stock each room
  for (const room of rooms) {
    // Skip entry/exit rooms (they have stairs)
    if (room.id === options.entryRoomId || room.id === options.exitRoomId) {
      roomAssignments[room.id] = { category: 'entry_exit', hasSecondaryTreasure: false };
      continue;
    }

    // Get room cells for zone identification
    const roomCells = getRoomCells(room);

    // Filter door positions to just this room
    const roomDoors = doorPositions.filter(d =>
      d.x >= room.x && d.x < room.x + room.width &&
      d.y >= room.y && d.y < room.y + room.height
    );

    // Handle water rooms specially
    if (waterRoomSet.has(room.id)) {
      const waterResult = stockWaterRoom(room, roomCells, roomDoors, style, occupiedCells);
      stockedObjects.push(...waterResult.objects);
      roomAssignments[room.id] = waterResult.assignment;
      continue;
    }

    // Roll room category for non-water rooms
    const category = rollWeightedCategory(categoryWeights);
    roomAssignments[room.id] = { category, hasSecondaryTreasure: false };

    const roomSize = roomCells.length;
    const zones = identifyPlacementZones(roomCells, room, roomDoors);

    // Calculate object budget
    const objectBudget = getObjectBudget(roomSize, densityMultiplier);

    // Place objects based on category
    switch (category) {
      case ROOM_CATEGORIES.MONSTER: {
        // Place monsters (60% of budget)
        const monsterCount = Math.max(1, Math.ceil(objectBudget * 0.6));
        const monsterContext = { category: 'monster' };
        const monsters = placeObjects(zones, objectPool.monsters, monsterCount, occupiedCells, null, monsterContext);
        stockedObjects.push(...monsters);

        // Secondary treasure roll (B/X: 3-in-6 for monster rooms)
        if (Math.random() < STOCKING_CONFIG.treasureChance.monster) {
          roomAssignments[room.id].hasSecondaryTreasure = true;
          const treasureCount = Math.max(1, Math.floor(objectBudget * 0.3));
          const treasureContext = { category: 'monster', isTreasure: true };
          const treasure = placeObjects(zones, objectPool.treasures, treasureCount, occupiedCells, 'corners', treasureContext);
          stockedObjects.push(...treasure);
        }
        break;
      }

      case ROOM_CATEGORIES.TRAP: {
        // Place trap(s)
        const trapCount = randomInt(1, 2);
        const trapContext = { category: 'trap' };
        const traps = placeObjects(zones, objectPool.traps, trapCount, occupiedCells, null, trapContext);
        stockedObjects.push(...traps);

        // Secondary treasure roll (B/X: 2-in-6 for trap rooms - it's bait!)
        if (Math.random() < STOCKING_CONFIG.treasureChance.trap) {
          roomAssignments[room.id].hasSecondaryTreasure = true;
          const treasureContext = { category: 'trap', isTreasure: true };
          const treasure = placeObjects(zones, objectPool.treasures, 1, occupiedCells, 'center', treasureContext);
          stockedObjects.push(...treasure);
        }
        break;
      }

      case ROOM_CATEGORIES.FEATURE: {
        // 50% chance to use a template if room is large enough
        if (useTemplates && Math.random() < 0.5 && roomSize >= 9) {
          const template = selectValidTemplate(roomSize);
          if (template) {
            const templateObjects = applyRoomTemplate(template, zones, occupiedCells);
            stockedObjects.push(...templateObjects);
            roomAssignments[room.id].template = template.name;
            break;
          }
        }

        // Otherwise place random features
        const featureCount = objectBudget;
        const featureContext = { category: 'feature' };
        const features = placeObjects(zones, objectPool.features, featureCount, occupiedCells, null, featureContext);
        stockedObjects.push(...features);
        break;
      }

      case ROOM_CATEGORIES.EMPTY:
      default: {
        // Usually empty, but small chance of hidden treasure (B/X: 1-in-6)
        if (Math.random() < STOCKING_CONFIG.treasureChance.empty) {
          roomAssignments[room.id].hasSecondaryTreasure = true;
          const treasureContext = { category: 'empty', isTreasure: true };
          const treasure = placeObjects(zones, objectPool.treasures, 1, occupiedCells, 'corners', treasureContext);
          stockedObjects.push(...treasure);
        }
        break;
      }
    }
  }

  // Place corridor traps
  if (corridorTrapChance > 0 && corridorResult && corridorResult.cells) {
    const corridorOnlyCells = findCorridorOnlyCells(corridorResult.cells, rooms);

    // Calculate corridor trap count based on corridor length and chance
    const corridorTrapCount = Math.floor(corridorOnlyCells.length * corridorTrapChance / 10);

    for (let i = 0; i < corridorTrapCount; i++) {
      const cell = selectCorridorTrapPosition(corridorOnlyCells, occupiedCells);
      if (cell) {
        occupiedCells.add(cellKey(cell.x, cell.y));
        const trapType = selectFromPool(objectPool.traps);
        stockedObjects.push({
          id: generateObjectId(),
          type: trapType,
          position: { x: cell.x, y: cell.y },
          size: { width: 1, height: 1 },
          alignment: 'center',
          scale: 1,
          rotation: 0,
          label: getObjectLabel(trapType),
          customTooltip: 'Corridor trap'
        });
      }
    }
  }

  return {
    objects: stockedObjects,
    roomAssignments
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

return {
  // Main entry point
  stockDungeon,

  // Constants
  ROOM_CATEGORIES,
  STOCKING_CONFIG,
  STYLE_OBJECT_POOLS,
  ROOM_TEMPLATES,
  PLACEMENT_PREFERENCES,

  // Utilities (exported for testing)
  rollWeightedCategory,
  normalizeWeights,
  getObjectBudget,
  identifyPlacementZones,
  selectValidTemplate,
  applyRoomTemplate,
  placeObject,
  placeObjects,
  findCorridorOnlyCells,

  // Re-exports from dungeonGenerator needed by stockDungeon
  getRoomCells,
  isCellInRoom
};
