/**
 * objectTypes.ts
 *
 * Object type definitions for dungeon mapping.
 * Defines available object symbols and their categories.
 */

// Types defined in #types/objects/object.types.ts
// Duplicated here for datacore runtime compatibility
interface ObjectType {
  id: string;
  symbol: string;
  label: string;
  category: string;
}

interface Category {
  id: string;
  label: string;
}

// ===========================================
// Constants
// ===========================================

const OBJECT_TYPES: readonly ObjectType[] = [
  // Navigation
  { id: 'entrance', symbol: '⬤', label: 'Entrance/Exit', category: 'navigation' },
  { id: 'stairs-up', symbol: '▲', label: 'Stairs Up', category: 'navigation' },
  { id: 'stairs-down', symbol: '▼', label: 'Stairs Down', category: 'navigation' },
  { id: 'ladder', symbol: '☍', label: 'Ladder', category: 'navigation' },
  { id: 'door-vertical', symbol: '╏', label: 'Door (Vertical)', category: 'navigation' },
  { id: 'door-horizontal', symbol: '╍', label: 'Door (Horizontal)', category: 'navigation' },
  { id: 'secret-door', symbol: '≡', label: 'Secret Door', category: 'navigation' },
  { id: 'portal', symbol: '⊛', label: 'Portal/Teleport', category: 'navigation' },
  
  // Hazards
  { id: 'trap', symbol: '✱', label: 'Trap', category: 'hazards' },
  { id: 'hazard', symbol: '⚠', label: 'Hazard', category: 'hazards' },
  { id: 'pit', symbol: '◊', label: 'Pit', category: 'hazards' },
  { id: 'poison', symbol: '☠', label: 'Poison', category: 'hazards' },
  
  // Features
  { id: 'chest', symbol: '🪎', label: 'Chest/Treasure', category: 'features' },
  { id: 'crate', symbol: '📦', label: 'Crate/Barrel', category: 'features' },
  { id: 'sack', symbol: '💰', label: 'Sack/Bag', category: 'features' },
  { id: 'altar', symbol: '⛧', label: 'Altar', category: 'features' },
  { id: 'coffin', symbol: '⚰', label: 'Coffin', category: 'features' },
  { id: 'statue', symbol: '♜', label: 'Statue', category: 'features' },
  { id: 'cage', symbol: '⛓', label: 'Chains/Cage', category: 'features' },
  { id: 'book', symbol: '🕮', label: 'Book/Shelf', category: 'features' },
  { id: 'table', symbol: '▭', label: 'Table', category: 'features' },
  { id: 'chair', symbol: '🪑', label: 'Chair', category: 'features' },
  { id: 'bed', symbol: '🛏', label: 'Bed', category: 'features' },
  { id: 'anvil', symbol: '⚒', label: 'Anvil/Forge', category: 'features' },
  { id: 'cauldron', symbol: '⚗', label: 'Cauldron', category: 'features' },
  { id: 'fountain', symbol: '⛲', label: 'Fountain', category: 'features' },
  { id: 'lever', symbol: '⚡', label: 'Lever/Switch', category: 'features' },
  { id: 'flower', symbol: '⚘', label: 'Flower', category: 'features' },
  { id: 'plant', symbol: '⊕', label: 'Plant', category: 'features' },
  { id: 'tree-dec', symbol: '🌳', label: 'Tree', category: 'features' },
  { id: 'tree-ev', symbol: '🌲', label: 'Tree', category: 'features' },
  { id: 'tree-lfls', symbol: '🪾', label: 'Tree', category: 'features' },
  
  // Encounters
  { id: 'monster', symbol: '♅', label: 'Monster/Enemy', category: 'encounters' },
  { id: 'boss', symbol: '♛', label: 'Boss', category: 'encounters' },
  { id: 'boss-alt', symbol: '💀', label: 'Boss (alt)', category: 'encounters' },
  { id: 'npc', symbol: '☺', label: 'NPC', category: 'encounters' },
  { id: 'npc-alt', symbol: '🧝', label: 'NPC', category: 'encounters' },
  { id: 'guard', symbol: '⚔', label: 'Guard', category: 'encounters' },
  
  // Markers
  { id: 'poi', symbol: '◉', label: 'Point of Interest', category: 'markers' },
  { id: 'flag', symbol: '⚑', label: 'Note/Flag', category: 'markers' }
] as const;

const CATEGORIES: readonly Category[] = [
  { id: 'navigation', label: 'Navigation' },
  { id: 'hazards', label: 'Hazards' },
  { id: 'features', label: 'Features' },
  { id: 'encounters', label: 'Encounters' },
  { id: 'markers', label: 'Markers' }
] as const;

// ===========================================
// Exports
// ===========================================

return { OBJECT_TYPES, CATEGORIES };