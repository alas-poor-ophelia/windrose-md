// utils/borderCalculator.js - Smart border detection for exterior edges

// Check if a cell exists at given coordinates
function cellExists(cells, x, y) {
    return cells.some(cell => cell.x === x && cell.y === y);
  }
  
  // Calculate which borders should be drawn for a cell
  // Only returns borders where there's NO adjacent cell (exterior edges)
  function calculateBorders(cells, x, y) {
    const borders = [];
    
    // Check all 4 directions
    const adjacent = [
      { dx: 0, dy: -1, side: 'top' },
      { dx: 1, dy: 0, side: 'right' },
      { dx: 0, dy: 1, side: 'bottom' },
      { dx: -1, dy: 0, side: 'left' }
    ];
    
    for (const dir of adjacent) {
      const adjX = x + dir.dx;
      const adjY = y + dir.dy;
      
      // If there's no cell adjacent, this is an exterior edge
      if (!cellExists(cells, adjX, adjY)) {
        borders.push(dir.side);
      }
    }
    
    return borders;
  }
  
  // Build a lookup map for faster cell existence checks
  // Returns a Set with keys like "x,y"
  function buildCellLookup(cells) {
    const lookup = new Set();
    for (const cell of cells) {
      lookup.add(`${cell.x},${cell.y}`);
    }
    return lookup;
  }
  
  // Optimized version using lookup map
  function cellExistsInLookup(lookup, x, y) {
    return lookup.has(`${x},${y}`);
  }
  
  // Calculate borders using lookup map for better performance
  function calculateBordersOptimized(lookup, x, y) {
    const borders = [];
    
    const adjacent = [
      { dx: 0, dy: -1, side: 'top' },
      { dx: 1, dy: 0, side: 'right' },
      { dx: 0, dy: 1, side: 'bottom' },
      { dx: -1, dy: 0, side: 'left' }
    ];
    
    for (const dir of adjacent) {
      const adjX = x + dir.dx;
      const adjY = y + dir.dy;
      
      if (!cellExistsInLookup(lookup, adjX, adjY)) {
        borders.push(dir.side);
      }
    }
    
    return borders;
  }
  
  return { 
    calculateBorders, 
    cellExists, 
    buildCellLookup, 
    calculateBordersOptimized 
  };