// settingsPluginMain.js - Windrose MapDesigner Settings Plugin
// This file is generated from a template by SettingsPluginInstaller
// Default values are injected at install time from dmtConstants and objectTypes

/**
 * ============================================================================
 * TABLE OF CONTENTS
 * ============================================================================
 * 
 * Line ~30:    VERSION & IMPORTS
 * Line ~35:    DATA CONSTANTS (BUILT_IN_OBJECTS, CATEGORIES, QUICK_SYMBOLS)
 * Line ~67:    BUILT_IN_COLORS (color palette defaults)
 * Line ~76:    HELPER_NAMESPACES - Injected at assembly time
 * Line ~83:    MODAL_CLASSES - Injected at assembly time
 * Line ~85:    MAIN PLUGIN CLASS (WindroseMDSettingsPlugin)
 * Line ~450:   SETTINGS TAB CLASS (WindroseMDSettingsTab)
 *              - TAB_RENDER_METHODS - Injected at assembly time
 * 
 * ============================================================================
 */

// =============================================================================
// VERSION & IMPORTS
// =============================================================================

const PLUGIN_VERSION = '0.16.4';

const obsidianModule = require('obsidian');
const { Plugin, PluginSettingTab, Setting, Modal, setIcon, AbstractInputSuggest } = obsidianModule;

// Initialize bridge for Datacore components
window.__windrose = window.__windrose || {};
window.__windrose.obsidian = obsidianModule;
window.__windrose.version = PLUGIN_VERSION;
window.__windrose.ready = true;
window.dispatchEvent(new CustomEvent('windrose:bridge-ready'));

// =============================================================================
// DATA CONSTANTS
// Injected from objectTypes.ts at install time - single source of truth
// =============================================================================

const BUILT_IN_OBJECTS = [
  {
    "id": "note_pin",
    "symbol": "📌",
    "label": "Note Pin",
    "category": "notes"
  },
  {
    "id": "entrance",
    "symbol": "⬤",
    "label": "Entrance/Exit",
    "category": "navigation"
  },
  {
    "id": "stairs-up",
    "symbol": "▲",
    "label": "Stairs Up",
    "category": "navigation"
  },
  {
    "id": "stairs-down",
    "symbol": "▼",
    "label": "Stairs Down",
    "category": "navigation"
  },
  {
    "id": "ladder",
    "symbol": "☍",
    "label": "Ladder",
    "category": "navigation"
  },
  {
    "id": "door-vertical",
    "symbol": "╏",
    "label": "Door (Vertical)",
    "category": "navigation"
  },
  {
    "id": "door-horizontal",
    "symbol": "╍",
    "label": "Door (Horizontal)",
    "category": "navigation"
  },
  {
    "id": "secret-door",
    "symbol": "≡",
    "label": "Secret Door",
    "category": "navigation"
  },
  {
    "id": "portal",
    "symbol": "⊛",
    "label": "Portal/Teleport",
    "category": "navigation"
  },
  {
    "id": "trap",
    "symbol": "✱",
    "label": "Trap",
    "category": "hazards"
  },
  {
    "id": "hazard",
    "symbol": "⚠",
    "label": "Hazard",
    "category": "hazards"
  },
  {
    "id": "pit",
    "symbol": "◊",
    "label": "Pit",
    "category": "hazards"
  },
  {
    "id": "poison",
    "symbol": "☠",
    "label": "Poison",
    "category": "hazards"
  },
  {
    "id": "chest",
    "symbol": "🪎",
    "label": "Chest/Treasure",
    "category": "features"
  },
  {
    "id": "crate",
    "symbol": "📦",
    "label": "Crate/Barrel",
    "category": "features"
  },
  {
    "id": "sack",
    "symbol": "💰",
    "label": "Sack/Bag",
    "category": "features"
  },
  {
    "id": "altar",
    "symbol": "⛧",
    "label": "Altar",
    "category": "features"
  },
  {
    "id": "coffin",
    "symbol": "⚰",
    "label": "Coffin",
    "category": "features"
  },
  {
    "id": "statue",
    "symbol": "♜",
    "label": "Statue",
    "category": "features"
  },
  {
    "id": "cage",
    "symbol": "⛓",
    "label": "Chains/Cage",
    "category": "features"
  },
  {
    "id": "book",
    "symbol": "🕮",
    "label": "Book/Shelf",
    "category": "features"
  },
  {
    "id": "table",
    "symbol": "▭",
    "label": "Table",
    "category": "features"
  },
  {
    "id": "chair",
    "symbol": "🪑",
    "label": "Chair",
    "category": "features"
  },
  {
    "id": "bed",
    "symbol": "🛏",
    "label": "Bed",
    "category": "features"
  },
  {
    "id": "anvil",
    "symbol": "⚒",
    "label": "Anvil/Forge",
    "category": "features"
  },
  {
    "id": "cauldron",
    "symbol": "⚗",
    "label": "Cauldron",
    "category": "features"
  },
  {
    "id": "fountain",
    "symbol": "⛲",
    "label": "Fountain",
    "category": "features"
  },
  {
    "id": "lever",
    "symbol": "⚡",
    "label": "Lever/Switch",
    "category": "features"
  },
  {
    "id": "flower",
    "symbol": "⚘",
    "label": "Flower",
    "category": "features"
  },
  {
    "id": "plant",
    "symbol": "⊕",
    "label": "Plant",
    "category": "features"
  },
  {
    "id": "tree-dec",
    "symbol": "🌳",
    "label": "Tree",
    "category": "features"
  },
  {
    "id": "tree-ev",
    "symbol": "🌲",
    "label": "Tree",
    "category": "features"
  },
  {
    "id": "tree-lfls",
    "symbol": "🪾",
    "label": "Tree",
    "category": "features"
  },
  {
    "id": "monster",
    "symbol": "♅",
    "label": "Monster/Enemy",
    "category": "encounters"
  },
  {
    "id": "boss",
    "symbol": "♛",
    "label": "Boss",
    "category": "encounters"
  },
  {
    "id": "boss-alt",
    "symbol": "💀",
    "label": "Boss (alt)",
    "category": "encounters"
  },
  {
    "id": "npc",
    "symbol": "☺",
    "label": "NPC",
    "category": "encounters"
  },
  {
    "id": "npc-alt",
    "symbol": "🧝",
    "label": "NPC",
    "category": "encounters"
  },
  {
    "id": "guard",
    "symbol": "⚔",
    "label": "Guard",
    "category": "encounters"
  },
  {
    "id": "poi",
    "symbol": "◉",
    "label": "Point of Interest",
    "category": "markers"
  },
  {
    "id": "flag",
    "symbol": "⚑",
    "label": "Note/Flag",
    "category": "markers"
  }
];

const BUILT_IN_CATEGORIES = [
  {
    "id": "navigation",
    "label": "Navigation"
  },
  {
    "id": "hazards",
    "label": "Hazards"
  },
  {
    "id": "features",
    "label": "Features"
  },
  {
    "id": "encounters",
    "label": "Encounters"
  },
  {
    "id": "markers",
    "label": "Markers"
  }
];

const CATEGORY_ORDER = {};

// RPGAwesome icon data - injected from rpgAwesomeIcons.ts at install time
const RA_ICONS = {
  "ra-acid": {
    "char": "\ue900",
    "label": "Acid",
    "category": "dangers"
  },
  "ra-acorn": {
    "char": "\ue901",
    "label": "Acorn",
    "category": "food"
  },
  "ra-alien-fire": {
    "char": "\ue902",
    "label": "Alien Fire",
    "category": "magic"
  },
  "ra-all-for-one": {
    "char": "\ue903",
    "label": "All For One",
    "category": "rpg"
  },
  "ra-alligator-clip": {
    "char": "\ue904",
    "label": "Alligator Clip",
    "category": "inventory"
  },
  "ra-ammo-bag": {
    "char": "\ue905",
    "label": "Ammo Bag",
    "category": "inventory"
  },
  "ra-anchor": {
    "char": "\ue906",
    "label": "Anchor",
    "category": "rpg"
  },
  "ra-angel-wings": {
    "char": "\ue907",
    "label": "Angel Wings",
    "category": "rpg"
  },
  "ra-ankh": {
    "char": "\ue908",
    "label": "Ankh",
    "category": "rpg"
  },
  "ra-anvil": {
    "char": "\ue909",
    "label": "Anvil",
    "category": "rpg"
  },
  "ra-apple": {
    "char": "\ue90a",
    "label": "Apple",
    "category": "food"
  },
  "ra-aquarius": {
    "char": "\ue90b",
    "label": "Aquarius",
    "category": "astrology"
  },
  "ra-arcane-mask": {
    "char": "\ue90c",
    "label": "Arcane Mask",
    "category": "armor"
  },
  "ra-archer": {
    "char": "\ue90d",
    "label": "Archer",
    "category": "weapons"
  },
  "ra-archery-target": {
    "char": "\ue90e",
    "label": "Archery Target",
    "category": "weapons"
  },
  "ra-arena": {
    "char": "\ue90f",
    "label": "Arena",
    "category": "rpg"
  },
  "ra-aries": {
    "char": "\ue910",
    "label": "Aries",
    "category": "astrology"
  },
  "ra-arrow-cluster": {
    "char": "\ue911",
    "label": "Arrow Cluster",
    "category": "weapons"
  },
  "ra-arrow-flights": {
    "char": "\ue912",
    "label": "Arrow Flights",
    "category": "weapons"
  },
  "ra-arson": {
    "char": "\ue913",
    "label": "Arson",
    "category": "dangers"
  },
  "ra-aura": {
    "char": "\ue914",
    "label": "Aura",
    "category": "magic"
  },
  "ra-aware": {
    "char": "\ue915",
    "label": "Aware",
    "category": "player"
  },
  "ra-axe": {
    "char": "\ue917",
    "label": "Axe",
    "category": "weapons"
  },
  "ra-axe-swing": {
    "char": "\ue916",
    "label": "Axe Swing",
    "category": "weapons"
  },
  "ra-ball": {
    "char": "\ue918",
    "label": "Ball",
    "category": "inventory"
  },
  "ra-barbed-arrow": {
    "char": "\ue919",
    "label": "Barbed Arrow",
    "category": "weapons"
  },
  "ra-barrier": {
    "char": "\ue91a",
    "label": "Barrier",
    "category": "armor"
  },
  "ra-bat-sword": {
    "char": "\ue91b",
    "label": "Bat Sword",
    "category": "weapons"
  },
  "ra-battered-axe": {
    "char": "\ue91c",
    "label": "Battered Axe",
    "category": "weapons"
  },
  "ra-batteries": {
    "char": "\ue91d",
    "label": "Batteries",
    "category": "electronics"
  },
  "ra-battery-0": {
    "char": "\ue91e",
    "label": "Battery 0",
    "category": "electronics"
  },
  "ra-battery-100": {
    "char": "\ue922",
    "label": "Battery 100",
    "category": "electronics"
  },
  "ra-battery-25": {
    "char": "\ue91f",
    "label": "Battery 25",
    "category": "electronics"
  },
  "ra-battery-50": {
    "char": "\ue920",
    "label": "Battery 50",
    "category": "electronics"
  },
  "ra-battery-75": {
    "char": "\ue921",
    "label": "Battery 75",
    "category": "electronics"
  },
  "ra-battery-black": {
    "char": "\ue923",
    "label": "Battery Black",
    "category": "electronics"
  },
  "ra-battery-negative": {
    "char": "\ue924",
    "label": "Battery Negative",
    "category": "electronics"
  },
  "ra-battery-positive": {
    "char": "\ue925",
    "label": "Battery Positive",
    "category": "electronics"
  },
  "ra-battery-white": {
    "char": "\ue926",
    "label": "Battery White",
    "category": "electronics"
  },
  "ra-batwings": {
    "char": "\ue927",
    "label": "Batwings",
    "category": "rpg"
  },
  "ra-beam-wake": {
    "char": "\ue928",
    "label": "Beam Wake",
    "category": "rpg"
  },
  "ra-bear-trap": {
    "char": "\ue929",
    "label": "Bear Trap",
    "category": "dangers"
  },
  "ra-beer": {
    "char": "\ue92a",
    "label": "Beer",
    "category": "food"
  },
  "ra-beetle": {
    "char": "\ue92b",
    "label": "Beetle",
    "category": "creatures"
  },
  "ra-bell": {
    "char": "\ue92c",
    "label": "Bell",
    "category": "inventory"
  },
  "ra-biohazard": {
    "char": "\ue92d",
    "label": "Biohazard",
    "category": "dangers"
  },
  "ra-bird-claw": {
    "char": "\ue92e",
    "label": "Bird Claw",
    "category": "creatures"
  },
  "ra-bird-mask": {
    "char": "\ue92f",
    "label": "Bird Mask",
    "category": "armor"
  },
  "ra-blade-bite": {
    "char": "\ue930",
    "label": "Blade Bite",
    "category": "dangers"
  },
  "ra-blast": {
    "char": "\ue931",
    "label": "Blast",
    "category": "dangers"
  },
  "ra-blaster": {
    "char": "\ue932",
    "label": "Blaster",
    "category": "weapons"
  },
  "ra-bleeding-eye": {
    "char": "\ue933",
    "label": "Bleeding Eye",
    "category": "dangers"
  },
  "ra-bleeding-hearts": {
    "char": "\ue934",
    "label": "Bleeding Hearts",
    "category": "dangers"
  },
  "ra-bolt-shield": {
    "char": "\ue935",
    "label": "Bolt Shield",
    "category": "armor"
  },
  "ra-bomb-explosion": {
    "char": "\ue936",
    "label": "Bomb Explosion",
    "category": "dangers"
  },
  "ra-bombs": {
    "char": "\ue937",
    "label": "Bombs",
    "category": "weapons"
  },
  "ra-bone-bite": {
    "char": "\ue938",
    "label": "Bone Bite",
    "category": "dangers"
  },
  "ra-bone-knife": {
    "char": "\ue939",
    "label": "Bone Knife",
    "category": "weapons"
  },
  "ra-book": {
    "char": "\ue93a",
    "label": "Book",
    "category": "inventory"
  },
  "ra-boomerang": {
    "char": "\ue93b",
    "label": "Boomerang",
    "category": "weapons"
  },
  "ra-boot-stomp": {
    "char": "\ue93c",
    "label": "Boot Stomp",
    "category": "armor"
  },
  "ra-bottle-vapors": {
    "char": "\ue93d",
    "label": "Bottle Vapors",
    "category": "potions"
  },
  "ra-bottled-bolt": {
    "char": "\ue93e",
    "label": "Bottled Bolt",
    "category": "potions"
  },
  "ra-bottom-right": {
    "char": "\ue93f",
    "label": "Bottom Right",
    "category": "cards-dice"
  },
  "ra-bowie-knife": {
    "char": "\ue940",
    "label": "Bowie Knife",
    "category": "weapons"
  },
  "ra-bowling-pin": {
    "char": "\ue941",
    "label": "Bowling Pin",
    "category": "inventory"
  },
  "ra-brain-freeze": {
    "char": "\ue942",
    "label": "Brain Freeze",
    "category": "magic"
  },
  "ra-brandy-bottle": {
    "char": "\ue943",
    "label": "Brandy Bottle",
    "category": "food"
  },
  "ra-bridge": {
    "char": "\ue944",
    "label": "Bridge",
    "category": "rpg"
  },
  "ra-broadhead-arrow": {
    "char": "\ue945",
    "label": "Broadhead Arrow",
    "category": "weapons"
  },
  "ra-broadsword": {
    "char": "\ue946",
    "label": "Broadsword",
    "category": "weapons"
  },
  "ra-broken-bone": {
    "char": "\ue947",
    "label": "Broken Bone",
    "category": "dangers"
  },
  "ra-broken-bottle": {
    "char": "\ue948",
    "label": "Broken Bottle",
    "category": "potions"
  },
  "ra-broken-heart": {
    "char": "\ue949",
    "label": "Broken Heart",
    "category": "dangers"
  },
  "ra-broken-shield": {
    "char": "\ue94a",
    "label": "Broken Shield",
    "category": "armor"
  },
  "ra-broken-skull": {
    "char": "\ue94b",
    "label": "Broken Skull",
    "category": "dangers"
  },
  "ra-bubbling-potion": {
    "char": "\ue94c",
    "label": "Bubbling Potion",
    "category": "potions"
  },
  "ra-bullets": {
    "char": "\ue94d",
    "label": "Bullets",
    "category": "weapons"
  },
  "ra-burning-book": {
    "char": "\ue94e",
    "label": "Burning Book",
    "category": "magic"
  },
  "ra-burning-embers": {
    "char": "\ue94f",
    "label": "Burning Embers",
    "category": "magic"
  },
  "ra-burning-eye": {
    "char": "\ue950",
    "label": "Burning Eye",
    "category": "magic"
  },
  "ra-burning-meteor": {
    "char": "\ue951",
    "label": "Burning Meteor",
    "category": "magic"
  },
  "ra-burst-blob": {
    "char": "\ue952",
    "label": "Burst Blob",
    "category": "magic"
  },
  "ra-butterfly": {
    "char": "\ue953",
    "label": "Butterfly",
    "category": "creatures"
  },
  "ra-campfire": {
    "char": "\ue954",
    "label": "Campfire",
    "category": "rpg"
  },
  "ra-cancel": {
    "char": "\ue955",
    "label": "Cancel",
    "category": "cards-dice"
  },
  "ra-cancer": {
    "char": "\ue956",
    "label": "Cancer",
    "category": "astrology"
  },
  "ra-candle": {
    "char": "\ue958",
    "label": "Candle",
    "category": "inventory"
  },
  "ra-candle-fire": {
    "char": "\ue957",
    "label": "Candle Fire",
    "category": "inventory"
  },
  "ra-cannon-shot": {
    "char": "\ue959",
    "label": "Cannon Shot",
    "category": "weapons"
  },
  "ra-capitol": {
    "char": "\ue95a",
    "label": "Capitol",
    "category": "rpg"
  },
  "ra-capricorn": {
    "char": "\ue95b",
    "label": "Capricorn",
    "category": "astrology"
  },
  "ra-carrot": {
    "char": "\ue95c",
    "label": "Carrot",
    "category": "food"
  },
  "ra-castle-emblem": {
    "char": "\ue95d",
    "label": "Castle Emblem",
    "category": "rpg"
  },
  "ra-castle-flag": {
    "char": "\ue95e",
    "label": "Castle Flag",
    "category": "inventory"
  },
  "ra-cat": {
    "char": "\ue95f",
    "label": "Cat",
    "category": "creatures"
  },
  "ra-chain": {
    "char": "\ue960",
    "label": "Chain",
    "category": "inventory"
  },
  "ra-cheese": {
    "char": "\ue961",
    "label": "Cheese",
    "category": "food"
  },
  "ra-chemical-arrow": {
    "char": "\ue962",
    "label": "Chemical Arrow",
    "category": "weapons"
  },
  "ra-chessboard": {
    "char": "\ue963",
    "label": "Chessboard",
    "category": "cards-dice"
  },
  "ra-chicken-leg": {
    "char": "\ue964",
    "label": "Chicken Leg",
    "category": "food"
  },
  "ra-circle-of-circles": {
    "char": "\ue965",
    "label": "Circle Of Circles",
    "category": "rpg"
  },
  "ra-circular-saw": {
    "char": "\ue966",
    "label": "Circular Saw",
    "category": "weapons"
  },
  "ra-circular-shield": {
    "char": "\ue967",
    "label": "Circular Shield",
    "category": "armor"
  },
  "ra-cloak-and-dagger": {
    "char": "\ue968",
    "label": "Cloak And Dagger",
    "category": "weapons"
  },
  "ra-clockwork": {
    "char": "\ue969",
    "label": "Clockwork",
    "category": "electronics"
  },
  "ra-clover": {
    "char": "\ue96a",
    "label": "Clover",
    "category": "plants"
  },
  "ra-clovers": {
    "char": "\ue96c",
    "label": "Clovers",
    "category": "cards-dice"
  },
  "ra-clovers-card": {
    "char": "\ue96b",
    "label": "Clovers Card",
    "category": "cards-dice"
  },
  "ra-cluster-bomb": {
    "char": "\ue96d",
    "label": "Cluster Bomb",
    "category": "weapons"
  },
  "ra-coffee-mug": {
    "char": "\ue96e",
    "label": "Coffee Mug",
    "category": "food"
  },
  "ra-cog": {
    "char": "\ue970",
    "label": "Cog",
    "category": "electronics"
  },
  "ra-cog-wheel": {
    "char": "\ue96f",
    "label": "Cog Wheel",
    "category": "electronics"
  },
  "ra-cold-heart": {
    "char": "\ue971",
    "label": "Cold Heart",
    "category": "magic"
  },
  "ra-compass": {
    "char": "\ue972",
    "label": "Compass",
    "category": "inventory"
  },
  "ra-corked-tube": {
    "char": "\ue973",
    "label": "Corked Tube",
    "category": "potions"
  },
  "ra-crab-claw": {
    "char": "\ue974",
    "label": "Crab Claw",
    "category": "creatures"
  },
  "ra-cracked-helm": {
    "char": "\ue975",
    "label": "Cracked Helm",
    "category": "armor"
  },
  "ra-cracked-shield": {
    "char": "\ue976",
    "label": "Cracked Shield",
    "category": "armor"
  },
  "ra-croc-sword": {
    "char": "\ue977",
    "label": "Croc Sword",
    "category": "weapons"
  },
  "ra-crossbow": {
    "char": "\ue978",
    "label": "Crossbow",
    "category": "weapons"
  },
  "ra-crossed-axes": {
    "char": "\ue979",
    "label": "Crossed Axes",
    "category": "weapons"
  },
  "ra-crossed-bones": {
    "char": "\ue97a",
    "label": "Crossed Bones",
    "category": "dangers"
  },
  "ra-crossed-pistols": {
    "char": "\ue97b",
    "label": "Crossed Pistols",
    "category": "weapons"
  },
  "ra-crossed-sabres": {
    "char": "\ue97c",
    "label": "Crossed Sabres",
    "category": "weapons"
  },
  "ra-crossed-swords": {
    "char": "\ue97d",
    "label": "Crossed Swords",
    "category": "weapons"
  },
  "ra-crown": {
    "char": "\ue97f",
    "label": "Crown",
    "category": "armor"
  },
  "ra-crown-of-thorns": {
    "char": "\ue97e",
    "label": "Crown Of Thorns",
    "category": "armor"
  },
  "ra-crowned-heart": {
    "char": "\ue980",
    "label": "Crowned Heart",
    "category": "player"
  },
  "ra-crush": {
    "char": "\ue981",
    "label": "Crush",
    "category": "dangers"
  },
  "ra-crystal-ball": {
    "char": "\ue982",
    "label": "Crystal Ball",
    "category": "magic"
  },
  "ra-crystal-cluster": {
    "char": "\ue983",
    "label": "Crystal Cluster",
    "category": "magic"
  },
  "ra-crystal-wand": {
    "char": "\ue984",
    "label": "Crystal Wand",
    "category": "magic"
  },
  "ra-crystals": {
    "char": "\ue985",
    "label": "Crystals",
    "category": "magic"
  },
  "ra-cubes": {
    "char": "\ue986",
    "label": "Cubes",
    "category": "rpg"
  },
  "ra-cut-palm": {
    "char": "\ue987",
    "label": "Cut Palm",
    "category": "player"
  },
  "ra-cycle": {
    "char": "\ue988",
    "label": "Cycle",
    "category": "rpg"
  },
  "ra-daggers": {
    "char": "\ue989",
    "label": "Daggers",
    "category": "weapons"
  },
  "ra-daisy": {
    "char": "\ue98a",
    "label": "Daisy",
    "category": "plants"
  },
  "ra-dead-tree": {
    "char": "\ue98b",
    "label": "Dead Tree",
    "category": "plants"
  },
  "ra-death-skull": {
    "char": "\ue98c",
    "label": "Death Skull",
    "category": "dangers"
  },
  "ra-decapitation": {
    "char": "\ue98d",
    "label": "Decapitation",
    "category": "dangers"
  },
  "ra-defibrillate": {
    "char": "\ue98e",
    "label": "Defibrillate",
    "category": "electronics"
  },
  "ra-demolish": {
    "char": "\ue98f",
    "label": "Demolish",
    "category": "dangers"
  },
  "ra-dervish-swords": {
    "char": "\ue990",
    "label": "Dervish Swords",
    "category": "weapons"
  },
  "ra-desert-skull": {
    "char": "\ue991",
    "label": "Desert Skull",
    "category": "dangers"
  },
  "ra-diamond": {
    "char": "\ue992",
    "label": "Diamond",
    "category": "magic"
  },
  "ra-diamonds": {
    "char": "\ue994",
    "label": "Diamonds",
    "category": "cards-dice"
  },
  "ra-diamonds-card": {
    "char": "\ue993",
    "label": "Diamonds Card",
    "category": "cards-dice"
  },
  "ra-dice-five": {
    "char": "\ue995",
    "label": "Dice Five",
    "category": "cards-dice"
  },
  "ra-dice-four": {
    "char": "\ue996",
    "label": "Dice Four",
    "category": "cards-dice"
  },
  "ra-dice-one": {
    "char": "\ue997",
    "label": "Dice One",
    "category": "cards-dice"
  },
  "ra-dice-six": {
    "char": "\ue998",
    "label": "Dice Six",
    "category": "cards-dice"
  },
  "ra-dice-three": {
    "char": "\ue999",
    "label": "Dice Three",
    "category": "cards-dice"
  },
  "ra-dice-two": {
    "char": "\ue99a",
    "label": "Dice Two",
    "category": "cards-dice"
  },
  "ra-dinosaur": {
    "char": "\ue99b",
    "label": "Dinosaur",
    "category": "creatures"
  },
  "ra-divert": {
    "char": "\ue99c",
    "label": "Divert",
    "category": "magic"
  },
  "ra-diving-dagger": {
    "char": "\ue99d",
    "label": "Diving Dagger",
    "category": "weapons"
  },
  "ra-double-team": {
    "char": "\ue99e",
    "label": "Double Team",
    "category": "player"
  },
  "ra-doubled": {
    "char": "\ue99f",
    "label": "Doubled",
    "category": "magic"
  },
  "ra-dragon": {
    "char": "\ue9a2",
    "label": "Dragon",
    "category": "creatures"
  },
  "ra-dragon-breath": {
    "char": "\ue9a0",
    "label": "Dragon Breath",
    "category": "magic"
  },
  "ra-dragon-wing": {
    "char": "\ue9a1",
    "label": "Dragon Wing",
    "category": "creatures"
  },
  "ra-dragonfly": {
    "char": "\ue9a3",
    "label": "Dragonfly",
    "category": "creatures"
  },
  "ra-drill": {
    "char": "\ue9a4",
    "label": "Drill",
    "category": "weapons"
  },
  "ra-dripping-blade": {
    "char": "\ue9a5",
    "label": "Dripping Blade",
    "category": "weapons"
  },
  "ra-dripping-knife": {
    "char": "\ue9a6",
    "label": "Dripping Knife",
    "category": "weapons"
  },
  "ra-dripping-sword": {
    "char": "\ue9a7",
    "label": "Dripping Sword",
    "category": "weapons"
  },
  "ra-droplet": {
    "char": "\ue9a9",
    "label": "Droplet",
    "category": "magic"
  },
  "ra-droplet-splash": {
    "char": "\ue9a8",
    "label": "Droplet Splash",
    "category": "magic"
  },
  "ra-droplets": {
    "char": "\ue9aa",
    "label": "Droplets",
    "category": "rpg"
  },
  "ra-duel": {
    "char": "\ue9ab",
    "label": "Duel",
    "category": "weapons"
  },
  "ra-egg": {
    "char": "\ue9ad",
    "label": "Egg",
    "category": "food"
  },
  "ra-egg-pod": {
    "char": "\ue9ac",
    "label": "Egg Pod",
    "category": "food"
  },
  "ra-eggplant": {
    "char": "\ue9ae",
    "label": "Eggplant",
    "category": "food"
  },
  "ra-emerald": {
    "char": "\ue9af",
    "label": "Emerald",
    "category": "magic"
  },
  "ra-energise": {
    "char": "\ue9b0",
    "label": "Energise",
    "category": "electronics"
  },
  "ra-explosion": {
    "char": "\ue9b1",
    "label": "Explosion",
    "category": "dangers"
  },
  "ra-explosive-materials": {
    "char": "\ue9b2",
    "label": "Explosive Materials",
    "category": "weapons"
  },
  "ra-eye-monster": {
    "char": "\ue9b3",
    "label": "Eye Monster",
    "category": "creatures"
  },
  "ra-eye-shield": {
    "char": "\ue9b4",
    "label": "Eye Shield",
    "category": "armor"
  },
  "ra-eyeball": {
    "char": "\ue9b5",
    "label": "Eyeball",
    "category": "magic"
  },
  "ra-fairy": {
    "char": "\ue9b7",
    "label": "Fairy",
    "category": "creatures"
  },
  "ra-fairy-wand": {
    "char": "\ue9b6",
    "label": "Fairy Wand",
    "category": "magic"
  },
  "ra-fall-down": {
    "char": "\ue9b8",
    "label": "Fall Down",
    "category": "dangers"
  },
  "ra-falling": {
    "char": "\ue9b9",
    "label": "Falling",
    "category": "player"
  },
  "ra-fast-ship": {
    "char": "\ue9ba",
    "label": "Fast Ship",
    "category": "electronics"
  },
  "ra-feather-wing": {
    "char": "\ue9bb",
    "label": "Feather Wing",
    "category": "rpg"
  },
  "ra-feathered-wing": {
    "char": "\ue9bc",
    "label": "Feathered Wing",
    "category": "rpg"
  },
  "ra-fedora": {
    "char": "\ue9bd",
    "label": "Fedora",
    "category": "armor"
  },
  "ra-fire": {
    "char": "\ue9c3",
    "label": "Fire",
    "category": "magic"
  },
  "ra-fire-bomb": {
    "char": "\ue9be",
    "label": "Fire Bomb",
    "category": "weapons"
  },
  "ra-fire-breath": {
    "char": "\ue9bf",
    "label": "Fire Breath",
    "category": "magic"
  },
  "ra-fire-ring": {
    "char": "\ue9c0",
    "label": "Fire Ring",
    "category": "magic"
  },
  "ra-fire-shield": {
    "char": "\ue9c1",
    "label": "Fire Shield",
    "category": "armor"
  },
  "ra-fire-symbol": {
    "char": "\ue9c2",
    "label": "Fire Symbol",
    "category": "magic"
  },
  "ra-fireball-sword": {
    "char": "\ue9c4",
    "label": "Fireball Sword",
    "category": "weapons"
  },
  "ra-fish": {
    "char": "\ue9c5",
    "label": "Fish",
    "category": "creatures"
  },
  "ra-fizzing-flask": {
    "char": "\ue9c6",
    "label": "Fizzing Flask",
    "category": "potions"
  },
  "ra-flame-symbol": {
    "char": "\ue9c7",
    "label": "Flame Symbol",
    "category": "magic"
  },
  "ra-flaming-arrow": {
    "char": "\ue9c8",
    "label": "Flaming Arrow",
    "category": "weapons"
  },
  "ra-flaming-claw": {
    "char": "\ue9c9",
    "label": "Flaming Claw",
    "category": "weapons"
  },
  "ra-flaming-trident": {
    "char": "\ue9ca",
    "label": "Flaming Trident",
    "category": "weapons"
  },
  "ra-flask": {
    "char": "\ue9cb",
    "label": "Flask",
    "category": "potions"
  },
  "ra-flat-hammer": {
    "char": "\ue9cc",
    "label": "Flat Hammer",
    "category": "weapons"
  },
  "ra-flower": {
    "char": "\ue9cd",
    "label": "Flower",
    "category": "plants"
  },
  "ra-flowers": {
    "char": "\ue9ce",
    "label": "Flowers",
    "category": "plants"
  },
  "ra-fluffy-swirl": {
    "char": "\ue9cf",
    "label": "Fluffy Swirl",
    "category": "rpg"
  },
  "ra-focused-lightning": {
    "char": "\ue9d0",
    "label": "Focused Lightning",
    "category": "magic"
  },
  "ra-food-chain": {
    "char": "\ue9d1",
    "label": "Food Chain",
    "category": "dangers"
  },
  "ra-footprint": {
    "char": "\ue9d2",
    "label": "Footprint",
    "category": "player"
  },
  "ra-forging": {
    "char": "\ue9d3",
    "label": "Forging",
    "category": "rpg"
  },
  "ra-forward": {
    "char": "\ue9d4",
    "label": "Forward",
    "category": "rpg"
  },
  "ra-fox": {
    "char": "\ue9d5",
    "label": "Fox",
    "category": "creatures"
  },
  "ra-frost-emblem": {
    "char": "\ue9d6",
    "label": "Frost Emblem",
    "category": "magic"
  },
  "ra-frostfire": {
    "char": "\ue9d7",
    "label": "Frostfire",
    "category": "magic"
  },
  "ra-frozen-arrow": {
    "char": "\ue9d8",
    "label": "Frozen Arrow",
    "category": "weapons"
  },
  "ra-gamepad-cross": {
    "char": "\ue9d9",
    "label": "Gamepad Cross",
    "category": "electronics"
  },
  "ra-gavel": {
    "char": "\ue9da",
    "label": "Gavel",
    "category": "weapons"
  },
  "ra-gear-hammer": {
    "char": "\ue9db",
    "label": "Gear Hammer",
    "category": "weapons"
  },
  "ra-gear-heart": {
    "char": "\ue9dc",
    "label": "Gear Heart",
    "category": "electronics"
  },
  "ra-gears": {
    "char": "\ue9dd",
    "label": "Gears",
    "category": "electronics"
  },
  "ra-gecko": {
    "char": "\ue9de",
    "label": "Gecko",
    "category": "creatures"
  },
  "ra-gem": {
    "char": "\ue9e0",
    "label": "Gem",
    "category": "magic"
  },
  "ra-gem-pendant": {
    "char": "\ue9df",
    "label": "Gem Pendant",
    "category": "magic"
  },
  "ra-gemini": {
    "char": "\ue9e1",
    "label": "Gemini",
    "category": "astrology"
  },
  "ra-glass-heart": {
    "char": "\ue9e2",
    "label": "Glass Heart",
    "category": "player"
  },
  "ra-gloop": {
    "char": "\ue9e3",
    "label": "Gloop",
    "category": "magic"
  },
  "ra-gold-bar": {
    "char": "\ue9e4",
    "label": "Gold Bar",
    "category": "magic"
  },
  "ra-grappling-hook": {
    "char": "\ue9e5",
    "label": "Grappling Hook",
    "category": "weapons"
  },
  "ra-grass": {
    "char": "\ue9e7",
    "label": "Grass",
    "category": "plants"
  },
  "ra-grass-patch": {
    "char": "\ue9e6",
    "label": "Grass Patch",
    "category": "plants"
  },
  "ra-grenade": {
    "char": "\ue9e8",
    "label": "Grenade",
    "category": "weapons"
  },
  "ra-groundbreaker": {
    "char": "\ue9e9",
    "label": "Groundbreaker",
    "category": "rpg"
  },
  "ra-guarded-tower": {
    "char": "\ue9ea",
    "label": "Guarded Tower",
    "category": "rpg"
  },
  "ra-guillotine": {
    "char": "\ue9eb",
    "label": "Guillotine",
    "category": "weapons"
  },
  "ra-halberd": {
    "char": "\ue9ec",
    "label": "Halberd",
    "category": "weapons"
  },
  "ra-hammer": {
    "char": "\ue9ee",
    "label": "Hammer",
    "category": "weapons"
  },
  "ra-hammer-drop": {
    "char": "\ue9ed",
    "label": "Hammer Drop",
    "category": "weapons"
  },
  "ra-hand": {
    "char": "\ue9f1",
    "label": "Hand",
    "category": "player"
  },
  "ra-hand-emblem": {
    "char": "\ue9ef",
    "label": "Hand Emblem",
    "category": "player"
  },
  "ra-hand-saw": {
    "char": "\ue9f0",
    "label": "Hand Saw",
    "category": "weapons"
  },
  "ra-harpoon-trident": {
    "char": "\ue9f2",
    "label": "Harpoon Trident",
    "category": "weapons"
  },
  "ra-health": {
    "char": "\ue9f5",
    "label": "Health",
    "category": "magic"
  },
  "ra-health-decrease": {
    "char": "\ue9f3",
    "label": "Health Decrease",
    "category": "magic"
  },
  "ra-health-increase": {
    "char": "\ue9f4",
    "label": "Health Increase",
    "category": "magic"
  },
  "ra-heart-bottle": {
    "char": "\ue9f6",
    "label": "Heart Bottle",
    "category": "potions"
  },
  "ra-heart-tower": {
    "char": "\ue9f7",
    "label": "Heart Tower",
    "category": "rpg"
  },
  "ra-heartburn": {
    "char": "\ue9f8",
    "label": "Heartburn",
    "category": "dangers"
  },
  "ra-hearts": {
    "char": "\ue9fa",
    "label": "Hearts",
    "category": "cards-dice"
  },
  "ra-hearts-card": {
    "char": "\ue9f9",
    "label": "Hearts Card",
    "category": "cards-dice"
  },
  "ra-heat-haze": {
    "char": "\ue9fb",
    "label": "Heat Haze",
    "category": "rpg"
  },
  "ra-heavy-fall": {
    "char": "\ue9fc",
    "label": "Heavy Fall",
    "category": "dangers"
  },
  "ra-heavy-shield": {
    "char": "\ue9fd",
    "label": "Heavy Shield",
    "category": "armor"
  },
  "ra-helmet": {
    "char": "\ue9fe",
    "label": "Helmet",
    "category": "armor"
  },
  "ra-help": {
    "char": "\ue9ff",
    "label": "Help",
    "category": "rpg"
  },
  "ra-hive-emblem": {
    "char": "\uea00",
    "label": "Hive Emblem",
    "category": "rpg"
  },
  "ra-hole-ladder": {
    "char": "\uea01",
    "label": "Hole Ladder",
    "category": "rpg"
  },
  "ra-honeycomb": {
    "char": "\uea02",
    "label": "Honeycomb",
    "category": "food"
  },
  "ra-hood": {
    "char": "\uea03",
    "label": "Hood",
    "category": "armor"
  },
  "ra-horn-call": {
    "char": "\uea04",
    "label": "Horn Call",
    "category": "rpg"
  },
  "ra-horns": {
    "char": "\uea05",
    "label": "Horns",
    "category": "rpg"
  },
  "ra-horseshoe": {
    "char": "\uea06",
    "label": "Horseshoe",
    "category": "inventory"
  },
  "ra-hospital-cross": {
    "char": "\uea07",
    "label": "Hospital Cross",
    "category": "magic"
  },
  "ra-hot-surface": {
    "char": "\uea08",
    "label": "Hot Surface",
    "category": "magic"
  },
  "ra-hourglass": {
    "char": "\uea09",
    "label": "Hourglass",
    "category": "inventory"
  },
  "ra-hydra": {
    "char": "\uea0b",
    "label": "Hydra",
    "category": "creatures"
  },
  "ra-hydra-shot": {
    "char": "\uea0a",
    "label": "Hydra Shot",
    "category": "magic"
  },
  "ra-ice-cube": {
    "char": "\uea0c",
    "label": "Ice Cube",
    "category": "food"
  },
  "ra-implosion": {
    "char": "\uea0d",
    "label": "Implosion",
    "category": "dangers"
  },
  "ra-incense": {
    "char": "\uea0e",
    "label": "Incense",
    "category": "magic"
  },
  "ra-insect-jaws": {
    "char": "\uea0f",
    "label": "Insect Jaws",
    "category": "creatures"
  },
  "ra-interdiction": {
    "char": "\uea10",
    "label": "Interdiction",
    "category": "rpg"
  },
  "ra-jetpack": {
    "char": "\uea11",
    "label": "Jetpack",
    "category": "electronics"
  },
  "ra-jigsaw-piece": {
    "char": "\uea12",
    "label": "Jigsaw Piece",
    "category": "inventory"
  },
  "ra-kaleidoscope": {
    "char": "\uea13",
    "label": "Kaleidoscope",
    "category": "magic"
  },
  "ra-kettlebell": {
    "char": "\uea14",
    "label": "Kettlebell",
    "category": "inventory"
  },
  "ra-key": {
    "char": "\uea16",
    "label": "Key",
    "category": "inventory"
  },
  "ra-key-basic": {
    "char": "\uea15",
    "label": "Key Basic",
    "category": "inventory"
  },
  "ra-kitchen-knives": {
    "char": "\uea17",
    "label": "Kitchen Knives",
    "category": "weapons"
  },
  "ra-knife": {
    "char": "\uea19",
    "label": "Knife",
    "category": "weapons"
  },
  "ra-knife-fork": {
    "char": "\uea18",
    "label": "Knife Fork",
    "category": "food"
  },
  "ra-knight-helmet": {
    "char": "\uea1a",
    "label": "Knight Helmet",
    "category": "armor"
  },
  "ra-kunai": {
    "char": "\uea1b",
    "label": "Kunai",
    "category": "weapons"
  },
  "ra-lantern-flame": {
    "char": "\uea1c",
    "label": "Lantern Flame",
    "category": "inventory"
  },
  "ra-large-hammer": {
    "char": "\uea1d",
    "label": "Large Hammer",
    "category": "weapons"
  },
  "ra-laser-blast": {
    "char": "\uea1e",
    "label": "Laser Blast",
    "category": "weapons"
  },
  "ra-laser-site": {
    "char": "\uea1f",
    "label": "Laser Site",
    "category": "electronics"
  },
  "ra-lava": {
    "char": "\uea20",
    "label": "Lava",
    "category": "magic"
  },
  "ra-leaf": {
    "char": "\uea21",
    "label": "Leaf",
    "category": "plants"
  },
  "ra-leo": {
    "char": "\uea22",
    "label": "Leo",
    "category": "astrology"
  },
  "ra-level-four": {
    "char": "\uea24",
    "label": "Level Four",
    "category": "magic"
  },
  "ra-level-four-advanced": {
    "char": "\uea23",
    "label": "Level Four Advanced",
    "category": "magic"
  },
  "ra-level-three": {
    "char": "\uea26",
    "label": "Level Three",
    "category": "magic"
  },
  "ra-level-three-advanced": {
    "char": "\uea25",
    "label": "Level Three Advanced",
    "category": "magic"
  },
  "ra-level-two": {
    "char": "\uea28",
    "label": "Level Two",
    "category": "magic"
  },
  "ra-level-two-advanced": {
    "char": "\uea27",
    "label": "Level Two Advanced",
    "category": "magic"
  },
  "ra-lever": {
    "char": "\uea29",
    "label": "Lever",
    "category": "electronics"
  },
  "ra-libra": {
    "char": "\uea2a",
    "label": "Libra",
    "category": "astrology"
  },
  "ra-light-bulb": {
    "char": "\uea2b",
    "label": "Light Bulb",
    "category": "electronics"
  },
  "ra-lighthouse": {
    "char": "\uea2c",
    "label": "Lighthouse",
    "category": "electronics"
  },
  "ra-lightning": {
    "char": "\uea31",
    "label": "Lightning",
    "category": "magic"
  },
  "ra-lightning-bolt": {
    "char": "\uea2d",
    "label": "Lightning Bolt",
    "category": "magic"
  },
  "ra-lightning-storm": {
    "char": "\uea2e",
    "label": "Lightning Storm",
    "category": "magic"
  },
  "ra-lightning-sword": {
    "char": "\uea2f",
    "label": "Lightning Sword",
    "category": "weapons"
  },
  "ra-lightning-trio": {
    "char": "\uea30",
    "label": "Lightning Trio",
    "category": "magic"
  },
  "ra-lion": {
    "char": "\uea32",
    "label": "Lion",
    "category": "creatures"
  },
  "ra-lit-candelabra": {
    "char": "\uea33",
    "label": "Lit Candelabra",
    "category": "inventory"
  },
  "ra-load": {
    "char": "\uea34",
    "label": "Load",
    "category": "electronics"
  },
  "ra-locked-fortress": {
    "char": "\uea35",
    "label": "Locked Fortress",
    "category": "rpg"
  },
  "ra-love-howl": {
    "char": "\uea36",
    "label": "Love Howl",
    "category": "creatures"
  },
  "ra-maggot": {
    "char": "\uea37",
    "label": "Maggot",
    "category": "creatures"
  },
  "ra-magnet": {
    "char": "\uea38",
    "label": "Magnet",
    "category": "electronics"
  },
  "ra-mass-driver": {
    "char": "\uea39",
    "label": "Mass Driver",
    "category": "weapons"
  },
  "ra-match": {
    "char": "\uea3a",
    "label": "Match",
    "category": "inventory"
  },
  "ra-meat": {
    "char": "\uea3c",
    "label": "Meat",
    "category": "food"
  },
  "ra-meat-hook": {
    "char": "\uea3b",
    "label": "Meat Hook",
    "category": "weapons"
  },
  "ra-medical-pack": {
    "char": "\uea3d",
    "label": "Medical Pack",
    "category": "inventory"
  },
  "ra-metal-gate": {
    "char": "\uea3e",
    "label": "Metal Gate",
    "category": "rpg"
  },
  "ra-microphone": {
    "char": "\uea3f",
    "label": "Microphone",
    "category": "electronics"
  },
  "ra-mine-wagon": {
    "char": "\uea40",
    "label": "Mine Wagon",
    "category": "rpg"
  },
  "ra-mining-diamonds": {
    "char": "\uea41",
    "label": "Mining Diamonds",
    "category": "magic"
  },
  "ra-mirror": {
    "char": "\uea42",
    "label": "Mirror",
    "category": "inventory"
  },
  "ra-monster-skull": {
    "char": "\uea43",
    "label": "Monster Skull",
    "category": "creatures"
  },
  "ra-moon-sun": {
    "char": "\uea45",
    "label": "Moon Sun",
    "category": "astrology"
  },
  "ra-mountains": {
    "char": "\uea44",
    "label": "Mountains",
    "category": "rpg"
  },
  "ra-mp5": {
    "char": "\uea46",
    "label": "Mp5",
    "category": "weapons"
  },
  "ra-muscle-fat": {
    "char": "\uea47",
    "label": "Muscle Fat",
    "category": "player"
  },
  "ra-muscle-up": {
    "char": "\uea48",
    "label": "Muscle Up",
    "category": "player"
  },
  "ra-musket": {
    "char": "\uea49",
    "label": "Musket",
    "category": "weapons"
  },
  "ra-nails": {
    "char": "\uea4a",
    "label": "Nails",
    "category": "inventory"
  },
  "ra-nodular": {
    "char": "\uea4b",
    "label": "Nodular",
    "category": "rpg"
  },
  "ra-noose": {
    "char": "\uea4c",
    "label": "Noose",
    "category": "dangers"
  },
  "ra-nuclear": {
    "char": "\uea4d",
    "label": "Nuclear",
    "category": "electronics"
  },
  "ra-ocarina": {
    "char": "\uea4e",
    "label": "Ocarina",
    "category": "inventory"
  },
  "ra-ocean-emblem": {
    "char": "\uea4f",
    "label": "Ocean Emblem",
    "category": "rpg"
  },
  "ra-octopus": {
    "char": "\uea50",
    "label": "Octopus",
    "category": "creatures"
  },
  "ra-omega": {
    "char": "\uea51",
    "label": "Omega",
    "category": "rpg"
  },
  "ra-on-target": {
    "char": "\uea52",
    "label": "On Target",
    "category": "rpg"
  },
  "ra-ophiuchus": {
    "char": "\uea53",
    "label": "Ophiuchus",
    "category": "astrology"
  },
  "ra-overhead": {
    "char": "\uea54",
    "label": "Overhead",
    "category": "rpg"
  },
  "ra-overmind": {
    "char": "\uea55",
    "label": "Overmind",
    "category": "rpg"
  },
  "ra-palm-tree": {
    "char": "\uea56",
    "label": "Palm Tree",
    "category": "plants"
  },
  "ra-pawn": {
    "char": "\uea57",
    "label": "Pawn",
    "category": "cards-dice"
  },
  "ra-pawprint": {
    "char": "\uea58",
    "label": "Pawprint",
    "category": "player"
  },
  "ra-perspective-dice-five": {
    "char": "\uea59",
    "label": "Perspective Dice Five",
    "category": "cards-dice"
  },
  "ra-perspective-dice-four": {
    "char": "\uea5a",
    "label": "Perspective Dice Four",
    "category": "cards-dice"
  },
  "ra-perspective-dice-one": {
    "char": "\uea5b",
    "label": "Perspective Dice One",
    "category": "cards-dice"
  },
  "ra-perspective-dice-random": {
    "char": "\uea5c",
    "label": "Perspective Dice Random",
    "category": "cards-dice"
  },
  "ra-perspective-dice-six": {
    "char": "\uea5e",
    "label": "Perspective Dice Six",
    "category": "cards-dice"
  },
  "ra-perspective-dice-three": {
    "char": "\uea5f",
    "label": "Perspective Dice Three",
    "category": "cards-dice"
  },
  "ra-perspective-dice-two": {
    "char": "\uea5d",
    "label": "Perspective Dice Two",
    "category": "cards-dice"
  },
  "ra-pill": {
    "char": "\uea60",
    "label": "Pill",
    "category": "inventory"
  },
  "ra-pills": {
    "char": "\uea61",
    "label": "Pills",
    "category": "inventory"
  },
  "ra-pine-tree": {
    "char": "\uea62",
    "label": "Pine Tree",
    "category": "plants"
  },
  "ra-ping-pong": {
    "char": "\uea63",
    "label": "Ping Pong",
    "category": "inventory"
  },
  "ra-pisces": {
    "char": "\uea64",
    "label": "Pisces",
    "category": "astrology"
  },
  "ra-plain-dagger": {
    "char": "\uea65",
    "label": "Plain Dagger",
    "category": "weapons"
  },
  "ra-player": {
    "char": "\uea6f",
    "label": "Player",
    "category": "player"
  },
  "ra-player-despair": {
    "char": "\uea66",
    "label": "Player Despair",
    "category": "player"
  },
  "ra-player-dodge": {
    "char": "\uea67",
    "label": "Player Dodge",
    "category": "player"
  },
  "ra-player-king": {
    "char": "\uea68",
    "label": "Player King",
    "category": "player"
  },
  "ra-player-lift": {
    "char": "\uea69",
    "label": "Player Lift",
    "category": "player"
  },
  "ra-player-pain": {
    "char": "\uea6a",
    "label": "Player Pain",
    "category": "player"
  },
  "ra-player-pyromaniac": {
    "char": "\uea6b",
    "label": "Player Pyromaniac",
    "category": "player"
  },
  "ra-player-shot": {
    "char": "\uea6c",
    "label": "Player Shot",
    "category": "player"
  },
  "ra-player-teleport": {
    "char": "\uea6d",
    "label": "Player Teleport",
    "category": "player"
  },
  "ra-player-thunder-struck": {
    "char": "\uea6e",
    "label": "Player Thunder Struck",
    "category": "player"
  },
  "ra-podium": {
    "char": "\uea70",
    "label": "Podium",
    "category": "rpg"
  },
  "ra-poison-cloud": {
    "char": "\uea71",
    "label": "Poison Cloud",
    "category": "dangers"
  },
  "ra-potion": {
    "char": "\uea72",
    "label": "Potion",
    "category": "potions"
  },
  "ra-pyramids": {
    "char": "\uea73",
    "label": "Pyramids",
    "category": "rpg"
  },
  "ra-queen-crown": {
    "char": "\uea74",
    "label": "Queen Crown",
    "category": "armor"
  },
  "ra-quill-ink": {
    "char": "\uea75",
    "label": "Quill Ink",
    "category": "inventory"
  },
  "ra-rabbit": {
    "char": "\uea76",
    "label": "Rabbit",
    "category": "creatures"
  },
  "ra-radar-dish": {
    "char": "\uea77",
    "label": "Radar Dish",
    "category": "electronics"
  },
  "ra-radial-balance": {
    "char": "\uea78",
    "label": "Radial Balance",
    "category": "rpg"
  },
  "ra-radioactive": {
    "char": "\uea79",
    "label": "Radioactive",
    "category": "electronics"
  },
  "ra-raven": {
    "char": "\uea7a",
    "label": "Raven",
    "category": "creatures"
  },
  "ra-reactor": {
    "char": "\uea7b",
    "label": "Reactor",
    "category": "electronics"
  },
  "ra-recycle": {
    "char": "\uea7c",
    "label": "Recycle",
    "category": "electronics"
  },
  "ra-regeneration": {
    "char": "\uea7d",
    "label": "Regeneration",
    "category": "electronics"
  },
  "ra-relic-blade": {
    "char": "\uea7e",
    "label": "Relic Blade",
    "category": "weapons"
  },
  "ra-repair": {
    "char": "\uea7f",
    "label": "Repair",
    "category": "electronics"
  },
  "ra-reverse": {
    "char": "\uea80",
    "label": "Reverse",
    "category": "rpg"
  },
  "ra-revolver": {
    "char": "\uea81",
    "label": "Revolver",
    "category": "weapons"
  },
  "ra-rifle": {
    "char": "\uea82",
    "label": "Rifle",
    "category": "weapons"
  },
  "ra-ringing-bell": {
    "char": "\uea83",
    "label": "Ringing Bell",
    "category": "inventory"
  },
  "ra-roast-chicken": {
    "char": "\uea84",
    "label": "Roast Chicken",
    "category": "food"
  },
  "ra-robot-arm": {
    "char": "\uea85",
    "label": "Robot Arm",
    "category": "electronics"
  },
  "ra-round-bottom-flask": {
    "char": "\uea86",
    "label": "Round Bottom Flask",
    "category": "potions"
  },
  "ra-round-shield": {
    "char": "\uea87",
    "label": "Round Shield",
    "category": "armor"
  },
  "ra-rss": {
    "char": "\uea88",
    "label": "Rss",
    "category": "electronics"
  },
  "ra-rune-stone": {
    "char": "\uea89",
    "label": "Rune Stone",
    "category": "magic"
  },
  "ra-sagittarius": {
    "char": "\uea8a",
    "label": "Sagittarius",
    "category": "astrology"
  },
  "ra-sapphire": {
    "char": "\uea8b",
    "label": "Sapphire",
    "category": "magic"
  },
  "ra-satellite": {
    "char": "\uea8c",
    "label": "Satellite",
    "category": "electronics"
  },
  "ra-save": {
    "char": "\uea8d",
    "label": "Save",
    "category": "electronics"
  },
  "ra-scorpio": {
    "char": "\uea8e",
    "label": "Scorpio",
    "category": "astrology"
  },
  "ra-scroll-unfurled": {
    "char": "\uea8f",
    "label": "Scroll Unfurled",
    "category": "magic"
  },
  "ra-scythe": {
    "char": "\uea90",
    "label": "Scythe",
    "category": "weapons"
  },
  "ra-sea-serpent": {
    "char": "\uea91",
    "label": "Sea Serpent",
    "category": "creatures"
  },
  "ra-seagull": {
    "char": "\uea92",
    "label": "Seagull",
    "category": "creatures"
  },
  "ra-shark": {
    "char": "\uea93",
    "label": "Shark",
    "category": "creatures"
  },
  "ra-sheep": {
    "char": "\uea94",
    "label": "Sheep",
    "category": "creatures"
  },
  "ra-sheriff": {
    "char": "\uea95",
    "label": "Sheriff",
    "category": "inventory"
  },
  "ra-shield": {
    "char": "\uea96",
    "label": "Shield",
    "category": "armor"
  },
  "ra-ship-emblem": {
    "char": "\uea97",
    "label": "Ship Emblem",
    "category": "inventory"
  },
  "ra-shoe-prints": {
    "char": "\uea98",
    "label": "Shoe Prints",
    "category": "player"
  },
  "ra-shot-through-the-heart": {
    "char": "\uea99",
    "label": "Shot Through The Heart",
    "category": "dangers"
  },
  "ra-shotgun-shell": {
    "char": "\uea9a",
    "label": "Shotgun Shell",
    "category": "weapons"
  },
  "ra-shovel": {
    "char": "\uea9b",
    "label": "Shovel",
    "category": "weapons"
  },
  "ra-shuriken": {
    "char": "\uea9c",
    "label": "Shuriken",
    "category": "weapons"
  },
  "ra-sickle": {
    "char": "\uea9d",
    "label": "Sickle",
    "category": "weapons"
  },
  "ra-sideswipe": {
    "char": "\uea9e",
    "label": "Sideswipe",
    "category": "rpg"
  },
  "ra-site": {
    "char": "\uea9f",
    "label": "Site",
    "category": "rpg"
  },
  "ra-skull": {
    "char": "\ueaa1",
    "label": "Skull",
    "category": "dangers"
  },
  "ra-skull-trophy": {
    "char": "\ueaa0",
    "label": "Skull Trophy",
    "category": "dangers"
  },
  "ra-slash-ring": {
    "char": "\ueaa2",
    "label": "Slash Ring",
    "category": "inventory"
  },
  "ra-small-fire": {
    "char": "\ueaa3",
    "label": "Small Fire",
    "category": "magic"
  },
  "ra-snail": {
    "char": "\ueaa4",
    "label": "Snail",
    "category": "creatures"
  },
  "ra-snake": {
    "char": "\ueaa5",
    "label": "Snake",
    "category": "creatures"
  },
  "ra-snorkel": {
    "char": "\ueaa6",
    "label": "Snorkel",
    "category": "inventory"
  },
  "ra-snowflake": {
    "char": "\ueaa7",
    "label": "Snowflake",
    "category": "magic"
  },
  "ra-soccer-ball": {
    "char": "\ueaa8",
    "label": "Soccer Ball",
    "category": "inventory"
  },
  "ra-spades": {
    "char": "\ueaaa",
    "label": "Spades",
    "category": "cards-dice"
  },
  "ra-spades-card": {
    "char": "\ueaa9",
    "label": "Spades Card",
    "category": "cards-dice"
  },
  "ra-spawn-node": {
    "char": "\ueaab",
    "label": "Spawn Node",
    "category": "rpg"
  },
  "ra-spear-head": {
    "char": "\ueaac",
    "label": "Spear Head",
    "category": "weapons"
  },
  "ra-speech-bubble": {
    "char": "\ueaad",
    "label": "Speech Bubble",
    "category": "electronics"
  },
  "ra-speech-bubbles": {
    "char": "\ueaae",
    "label": "Speech Bubbles",
    "category": "electronics"
  },
  "ra-spider-face": {
    "char": "\ueaaf",
    "label": "Spider Face",
    "category": "creatures"
  },
  "ra-spikeball": {
    "char": "\ueab0",
    "label": "Spikeball",
    "category": "dangers"
  },
  "ra-spiked-mace": {
    "char": "\ueab1",
    "label": "Spiked Mace",
    "category": "weapons"
  },
  "ra-spiked-tentacle": {
    "char": "\ueab2",
    "label": "Spiked Tentacle",
    "category": "creatures"
  },
  "ra-spinning-sword": {
    "char": "\ueab3",
    "label": "Spinning Sword",
    "category": "weapons"
  },
  "ra-spiral-shell": {
    "char": "\ueab4",
    "label": "Spiral Shell",
    "category": "creatures"
  },
  "ra-splash": {
    "char": "\ueab5",
    "label": "Splash",
    "category": "rpg"
  },
  "ra-spray-can": {
    "char": "\ueab6",
    "label": "Spray Can",
    "category": "inventory"
  },
  "ra-sprout": {
    "char": "\ueab8",
    "label": "Sprout",
    "category": "plants"
  },
  "ra-sprout-emblem": {
    "char": "\ueab7",
    "label": "Sprout Emblem",
    "category": "plants"
  },
  "ra-stopwatch": {
    "char": "\ueab9",
    "label": "Stopwatch",
    "category": "inventory"
  },
  "ra-suckered-tentacle": {
    "char": "\ueaba",
    "label": "Suckered Tentacle",
    "category": "creatures"
  },
  "ra-suits": {
    "char": "\ueabb",
    "label": "Suits",
    "category": "cards-dice"
  },
  "ra-sun": {
    "char": "\ueabd",
    "label": "Sun",
    "category": "magic"
  },
  "ra-sun-symbol": {
    "char": "\ueabc",
    "label": "Sun Symbol",
    "category": "magic"
  },
  "ra-sunbeams": {
    "char": "\ueabe",
    "label": "Sunbeams",
    "category": "magic"
  },
  "ra-super-mushroom": {
    "char": "\ueabf",
    "label": "Super Mushroom",
    "category": "plants"
  },
  "ra-supersonic-arrow": {
    "char": "\ueac0",
    "label": "Supersonic Arrow",
    "category": "weapons"
  },
  "ra-surveillance-camera": {
    "char": "\ueac1",
    "label": "Surveillance Camera",
    "category": "electronics"
  },
  "ra-sword": {
    "char": "\ue946",
    "label": "Sword",
    "category": "weapons"
  },
  "ra-syringe": {
    "char": "\ueac2",
    "label": "Syringe",
    "category": "inventory"
  },
  "ra-target-arrows": {
    "char": "\ueac3",
    "label": "Target Arrows",
    "category": "weapons"
  },
  "ra-target-laser": {
    "char": "\ueac4",
    "label": "Target Laser",
    "category": "rpg"
  },
  "ra-targeted": {
    "char": "\ueac5",
    "label": "Targeted",
    "category": "rpg"
  },
  "ra-taurus": {
    "char": "\ueac6",
    "label": "Taurus",
    "category": "astrology"
  },
  "ra-telescope": {
    "char": "\ueac7",
    "label": "Telescope",
    "category": "electronics"
  },
  "ra-tentacle": {
    "char": "\ueac8",
    "label": "Tentacle",
    "category": "creatures"
  },
  "ra-tesla": {
    "char": "\ueac9",
    "label": "Tesla",
    "category": "electronics"
  },
  "ra-thorn-arrow": {
    "char": "\ueaca",
    "label": "Thorn Arrow",
    "category": "weapons"
  },
  "ra-thorny-vine": {
    "char": "\ueacb",
    "label": "Thorny Vine",
    "category": "plants"
  },
  "ra-three-keys": {
    "char": "\ueacc",
    "label": "Three Keys",
    "category": "inventory"
  },
  "ra-tic-tac-toe": {
    "char": "\ueacd",
    "label": "Tic Tac Toe",
    "category": "inventory"
  },
  "ra-toast": {
    "char": "\ueace",
    "label": "Toast",
    "category": "food"
  },
  "ra-tombstone": {
    "char": "\ueacf",
    "label": "Tombstone",
    "category": "dangers"
  },
  "ra-tooth": {
    "char": "\uead0",
    "label": "Tooth",
    "category": "inventory"
  },
  "ra-torch": {
    "char": "\uead1",
    "label": "Torch",
    "category": "inventory"
  },
  "ra-tower": {
    "char": "\uead2",
    "label": "Tower",
    "category": "rpg"
  },
  "ra-trail": {
    "char": "\uead3",
    "label": "Trail",
    "category": "rpg"
  },
  "ra-trefoil-lily": {
    "char": "\uead4",
    "label": "Trefoil Lily",
    "category": "plants"
  },
  "ra-trident": {
    "char": "\uead5",
    "label": "Trident",
    "category": "weapons"
  },
  "ra-triforce": {
    "char": "\uead6",
    "label": "Triforce",
    "category": "magic"
  },
  "ra-trophy": {
    "char": "\uead7",
    "label": "Trophy",
    "category": "inventory"
  },
  "ra-turd": {
    "char": "\uead8",
    "label": "Turd",
    "category": "inventory"
  },
  "ra-two-dragons": {
    "char": "\uead9",
    "label": "Two Dragons",
    "category": "creatures"
  },
  "ra-two-hearts": {
    "char": "\ueada",
    "label": "Two Hearts",
    "category": "magic"
  },
  "ra-uncertainty": {
    "char": "\ueadb",
    "label": "Uncertainty",
    "category": "rpg"
  },
  "ra-underhand": {
    "char": "\ueadc",
    "label": "Underhand",
    "category": "rpg"
  },
  "ra-unplugged": {
    "char": "\ueadd",
    "label": "Unplugged",
    "category": "electronics"
  },
  "ra-vase": {
    "char": "\ueade",
    "label": "Vase",
    "category": "potions"
  },
  "ra-venomous-snake": {
    "char": "\ueadf",
    "label": "Venomous Snake",
    "category": "creatures"
  },
  "ra-vest": {
    "char": "\ueae0",
    "label": "Vest",
    "category": "armor"
  },
  "ra-vial": {
    "char": "\ueae1",
    "label": "Vial",
    "category": "potions"
  },
  "ra-vine-whip": {
    "char": "\ueae2",
    "label": "Vine Whip",
    "category": "weapons"
  },
  "ra-virgo": {
    "char": "\ueae3",
    "label": "Virgo",
    "category": "astrology"
  },
  "ra-water-drop": {
    "char": "\ueae4",
    "label": "Water Drop",
    "category": "magic"
  },
  "ra-wifi": {
    "char": "\ueae5",
    "label": "Wifi",
    "category": "electronics"
  },
  "ra-wireless-signal": {
    "char": "\ueae6",
    "label": "Wireless Signal",
    "category": "electronics"
  },
  "ra-wolf-head": {
    "char": "\ueae7",
    "label": "Wolf Head",
    "category": "creatures"
  },
  "ra-wolf-howl": {
    "char": "\ueae8",
    "label": "Wolf Howl",
    "category": "creatures"
  },
  "ra-wooden-sign": {
    "char": "\ueae9",
    "label": "Wooden Sign",
    "category": "inventory"
  },
  "ra-wrench": {
    "char": "\ueaea",
    "label": "Wrench",
    "category": "inventory"
  },
  "ra-wyvern": {
    "char": "\ueaeb",
    "label": "Wyvern",
    "category": "creatures"
  },
  "ra-x-mark": {
    "char": "\ueaec",
    "label": "X Mark",
    "category": "dangers"
  },
  "ra-zebra-shield": {
    "char": "\ueaed",
    "label": "Zebra Shield",
    "category": "armor"
  },
  "ra-zigzag-leaf": {
    "char": "\ueaee",
    "label": "Zigzag Leaf",
    "category": "plants"
  }
};

const RA_CATEGORIES = [
  {
    "id": "weapons",
    "label": "Weapons",
    "order": 10
  },
  {
    "id": "armor",
    "label": "Armor & Defense",
    "order": 20
  },
  {
    "id": "creatures",
    "label": "Creatures",
    "order": 30
  },
  {
    "id": "potions",
    "label": "Potions",
    "order": 40
  },
  {
    "id": "magic",
    "label": "Magic",
    "order": 50
  },
  {
    "id": "food",
    "label": "Food & Drink",
    "order": 60
  },
  {
    "id": "plants",
    "label": "Plants",
    "order": 70
  },
  {
    "id": "astrology",
    "label": "Astrology",
    "order": 80
  },
  {
    "id": "cards-dice",
    "label": "Cards & Dice",
    "order": 90
  },
  {
    "id": "electronics",
    "label": "Electronics",
    "order": 100
  },
  {
    "id": "dangers",
    "label": "Dangers",
    "order": 110
  },
  {
    "id": "player",
    "label": "Player",
    "order": 120
  },
  {
    "id": "inventory",
    "label": "Inventory",
    "order": 130
  },
  {
    "id": "rpg",
    "label": "RPG & Misc",
    "order": 140
  }
];

// Quick symbols palette - injected at install time
const QUICK_SYMBOLS = "// settingsPlugin-quickSymbols.js\n// Quick symbols palette for object creation in the settings plugin\n// Separated to prevent unicode corruption during automated edits\n\nconst QUICK_SYMBOLS = [\n  '★', '☆', '✦', '✧', '✪', '✫', '✯', '⚒',\n  '●', '○', '◆', '◇', '■', '□', '▲', '△',\n  '▼', '▽', '♠', '♤', '♣', '♧', '♥', '♡',\n  '♦', '♢', '⚔', '⚒', '🗡', '🧹', '⚔', '⛏',\n  '📱', '☠', '⚠', '☢', '☣', '⚡', '🔥', '💧',\n  '⚒', '⚐', '⛳', '🚩', '➤', '➜', '⬤', '⚙',\n  '⚗', '🔮', '💎', '🗝', '📜', '🎭', '👑', '🛡',\n  '🏰', '⛪', '🗿', '⚱', '🏺', '🪔'\n];\n\nreturn QUICK_SYMBOLS;";

// =============================================================================
// BUILT-IN COLOR PALETTE
// Default colors for drawing and objects
// =============================================================================

const BUILT_IN_COLORS = [
  { id: 'default', color: '#c4a57b', label: 'Default (Tan)' },
  { id: 'stone', color: '#808080', label: 'Stone Gray' },
  { id: 'dark-stone', color: '#505050', label: 'Dark Gray' },
  { id: 'water', color: '#4a9eff', label: 'Water Blue' },
  { id: 'forest', color: '#4ade80', label: 'Forest Green' },
  { id: 'danger', color: '#ef4444', label: 'Danger Red' },
  { id: 'sand', color: '#fbbf24', label: 'Sand Yellow' },
  { id: 'magic', color: '#a855f7', label: 'Magic Purple' },
  { id: 'fire', color: '#fb923c', label: 'Fire Orange' },
  { id: 'ice', color: '#14b8a6', label: 'Ice Teal' }
];


// =============================================================================
// HELPER NAMESPACES
// Injected at assembly time from settingsPlugin-*Helpers.js files
// =============================================================================

// settingsPlugin-ObjectHelpers.js
// Object resolution helpers - transforms raw settings into resolved object/category lists
// This file is concatenated into the settings plugin template by the assembler

/**
 * Object resolution helpers
 * Transform raw settings into resolved object/category lists
 */
const ObjectHelpers = {
  /**
   * Get all resolved object types (built-in + custom, with overrides applied)
   * @param {Object} settings - Plugin settings
   * @returns {Array} Resolved object array with isBuiltIn, isModified flags
   */
  getResolved(settings) {
    const { objectOverrides = {}, customObjects = [] } = settings;
    
    const resolvedBuiltIns = BUILT_IN_OBJECTS
      .filter(obj => !objectOverrides[obj.id]?.hidden)
      .map((obj, index) => {
        const override = objectOverrides[obj.id];
        const defaultOrder = index * 10;
        if (override) {
          const { hidden, ...overrideProps } = override;
          return { 
            ...obj, 
            ...overrideProps, 
            order: override.order ?? defaultOrder, 
            isBuiltIn: true, 
            isModified: true 
          };
        }
        return { ...obj, order: defaultOrder, isBuiltIn: true, isModified: false };
      });
    
    const resolvedCustom = customObjects.map((obj, index) => ({
      ...obj,
      order: obj.order ?? (1000 + index * 10),
      isCustom: true,
      isBuiltIn: false
    }));
    
    return [...resolvedBuiltIns, ...resolvedCustom];
  },
  
  /**
   * Get all resolved categories (built-in + custom, sorted by order)
   * @param {Object} settings - Plugin settings
   * @returns {Array} Sorted category array with isBuiltIn flag
   */
  getCategories(settings) {
    const { customCategories = [] } = settings;
    
    const resolvedBuiltIns = BUILT_IN_CATEGORIES.map(c => ({
      ...c,
      isBuiltIn: true,
      order: CATEGORY_ORDER[c.id] ?? 50
    }));
    
    const resolvedCustom = customCategories.map(c => ({
      ...c,
      isCustom: true,
      isBuiltIn: false,
      order: c.order ?? 100
    }));
    
    return [...resolvedBuiltIns, ...resolvedCustom].sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  },
  
  /**
   * Get hidden built-in objects
   * @param {Object} settings - Plugin settings
   * @returns {Array} Hidden objects with isBuiltIn, isHidden flags
   */
  getHidden(settings) {
    const { objectOverrides = {} } = settings;
    return BUILT_IN_OBJECTS
      .filter(obj => objectOverrides[obj.id]?.hidden)
      .map(obj => ({ ...obj, isBuiltIn: true, isHidden: true }));
  },
  
  /**
   * Get all categories including notes (for dropdowns)
   * @param {Object} settings - Plugin settings
   * @returns {Array} All categories
   */
  getAllCategories(settings) {
    const { customCategories = [] } = settings;
    const builtIn = BUILT_IN_CATEGORIES.map(c => ({ ...c, isBuiltIn: true }));
    const custom = customCategories.map(c => ({ ...c, isCustom: true }));
    return [...builtIn, ...custom];
  },
  
  /**
   * Get default ID order for a category (for drag/drop comparison)
   * @param {string} categoryId - Category ID
   * @param {Object} settings - Plugin settings
   * @returns {Array} Array of object IDs in default order
   */
  getDefaultIdOrder(categoryId, settings) {
    const { objectOverrides = {} } = settings;
    return BUILT_IN_OBJECTS
      .filter(o => o.category === categoryId && !objectOverrides[o.id]?.hidden)
      .map(o => o.id);
  },

  /**
   * Render an object's visual symbol into a container element
   * Handles image, icon, and symbol rendering with consistent priority
   * @param {Object} obj - Object with imagePath, iconClass, or symbol
   * @param {HTMLElement} container - Container element to render into
   * @param {Object} app - Obsidian app instance (for getResourcePath)
   * @param {Object} options - Optional size configuration { width, height }
   */
  renderObjectSymbol(obj, container, app, options = {}) {
    const { width = '20px', height = '20px' } = options;

    if (obj.imagePath) {
      const imgEl = container.createEl('img', {
        cls: 'dmt-settings-object-image',
        attr: { src: app.vault.adapter.getResourcePath(obj.imagePath), alt: obj.label }
      });
      imgEl.style.width = width;
      imgEl.style.height = height;
      imgEl.style.objectFit = 'contain';
    } else if (obj.iconClass && RPGAwesomeHelpers.isValid(obj.iconClass)) {
      const iconInfo = RPGAwesomeHelpers.getInfo(obj.iconClass);
      const iconSpan = container.createEl('span', { cls: 'ra' });
      iconSpan.textContent = iconInfo.char;
    } else {
      container.textContent = obj.symbol || '?';
    }
  }
};

// settingsPlugin-ColorHelpers.js
// Color palette resolution helpers - transforms raw settings into resolved color list
// This file is concatenated into the settings plugin template by the assembler

/**
 * Color palette resolution helpers
 * Transform raw settings into resolved color list
 */
const ColorHelpers = {
  /**
   * Get all resolved colors (built-in + custom, with overrides applied)
   * @param {Object} settings - Plugin settings
   * @returns {Array} Resolved color array with isBuiltIn, isModified flags
   */
  getResolved(settings) {
    const { colorPaletteOverrides = {}, customPaletteColors = [] } = settings;
    
    const resolvedBuiltIns = BUILT_IN_COLORS
      .filter(c => !colorPaletteOverrides[c.id]?.hidden)
      .map((c, index) => {
        const override = colorPaletteOverrides[c.id];
        if (override) {
          const { hidden, ...overrideProps } = override;
          return { 
            ...c, 
            ...overrideProps, 
            order: override.order ?? index,
            isBuiltIn: true, 
            isModified: true 
          };
        }
        return { ...c, order: index, isBuiltIn: true, isModified: false };
      });
    
    const resolvedCustom = customPaletteColors.map((c, index) => ({
      ...c,
      order: c.order ?? (100 + index),
      isCustom: true,
      isBuiltIn: false
    }));
    
    return [...resolvedBuiltIns, ...resolvedCustom].sort((a, b) => a.order - b.order);
  },
  
  /**
   * Get hidden color IDs
   * @param {Object} settings - Plugin settings
   * @returns {Set} Set of hidden color IDs
   */
  getHidden(settings) {
    const { colorPaletteOverrides = {} } = settings;
    return new Set(
      Object.entries(colorPaletteOverrides)
        .filter(([id, override]) => override.hidden)
        .map(([id]) => id)
    );
  }
};

// settingsPlugin-DragHelpers.js
// Drag and drop helpers for reordering objects in the settings UI
// This file is concatenated into the settings plugin template by the assembler

/**
 * Drag and drop helpers
 */
const DragHelpers = {
  /**
   * Find element to insert before during drag operation
   * @param {HTMLElement} container - Container element
   * @param {number} y - Mouse Y position
   * @returns {HTMLElement|undefined} Element to insert before
   */
  getAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.dmt-settings-object-row:not(.dmt-dragging)')];
    
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }
};

// settingsPlugin-IconHelpers.js
// Icon helpers for setting Lucide icons with fallback
// This file is concatenated into the settings plugin template by the assembler

/**
 * Icon helpers
 */
const IconHelpers = {
  /**
   * Set icon on element with fallback
   * @param {HTMLElement} el - Target element
   * @param {string} iconId - Lucide icon ID
   */
  set(el, iconId) {
    if (typeof setIcon !== 'undefined') {
      setIcon(el, iconId);
    } else {
      // Fallback: create a simple text representation
      const icons = {
        'pencil': '✎',
        'eye': '👁',
        'eye-off': '🚫',
        'rotate-ccw': '↺',
        'trash-2': '🗑',
        'grip-vertical': '⋮⋮',
        'x': '✕',
        'search': '🔍'
      };
      el.textContent = icons[iconId] || '?';
    }
  }
};

// settingsPlugin-RPGAwesomeHelpers.js
// RPGAwesome icon helpers for the icon picker UI
// This file is concatenated into the settings plugin template by the assembler

/**
 * RPGAwesome icon helpers
 */
const RPGAwesomeHelpers = {
  /**
   * Get icons filtered by category
   * @param {string} categoryId - Category ID or 'all'
   * @returns {Array} Array of { iconClass, char, label, category }
   */
  getByCategory(categoryId) {
    const icons = Object.entries(RA_ICONS).map(([iconClass, data]) => ({
      iconClass,
      ...data
    }));
    
    if (categoryId === 'all') return icons;
    return icons.filter(i => i.category === categoryId);
  },
  
  /**
   * Search icons by label
   * @param {string} query - Search query
   * @returns {Array} Matching icons
   */
  search(query) {
    const q = query.toLowerCase().trim();
    if (!q) return this.getByCategory('all');
    
    return Object.entries(RA_ICONS)
      .filter(([iconClass, data]) => 
        iconClass.toLowerCase().includes(q) || 
        data.label.toLowerCase().includes(q)
      )
      .map(([iconClass, data]) => ({ iconClass, ...data }));
  },
  
  /**
   * Get sorted categories for tab display
   * @returns {Array} Array of { id, label, order }
   */
  getCategories() {
    return [...RA_CATEGORIES].sort((a, b) => a.order - b.order);
  },
  
  /**
   * Validate an icon class exists
   * @param {string} iconClass - Icon class to validate
   * @returns {boolean}
   */
  isValid(iconClass) {
    return iconClass && RA_ICONS.hasOwnProperty(iconClass);
  },
  
  /**
   * Get icon info
   * @param {string} iconClass - Icon class
   * @returns {Object|null} Icon data or null
   */
  getInfo(iconClass) {
    return RA_ICONS[iconClass] || null;
  }
};

// settingsPlugin-DungeonEssenceVisualizer.js
// Ambient visualization for the Insert Dungeon modal
// Shows abstract "dungeon being born" animation
// This file is concatenated into the settings plugin template by the assembler

/**
 * DungeonEssenceVisualizer - Vanilla JS Canvas Animation
 * Creates an ambient visualization of dungeon generation
 */
class DungeonEssenceVisualizer {
  constructor(container, options = {}) {
    this.container = container;
    this.height = options.height || 150;
    this.settings = {
      size: 'medium',
      circleChance: 0.3,
      loopChance: 0.15,
      corridorStyle: 'straight',
      ...options.settings
    };
    
    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.container.appendChild(this.canvas);
    
    // Create stamp overlay container
    this.stampOverlay = document.createElement('div');
    this.stampOverlay.style.cssText = `
      position: absolute;
      pointer-events: none;
      opacity: 0;
      filter: saturate(0.4);
      transition: opacity 0.3s ease;
    `;
    this.stampOverlay.innerHTML = this.getWindroseSVG();
    this.container.style.position = 'relative';
    this.container.appendChild(this.stampOverlay);
    
    this.ctx = this.canvas.getContext('2d');
    this.animationId = null;
    this.state = null;
    
    // Sample colors from CSS
    this.sampleColors();
    
    // Setup resize observer
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);
    
    // Initial size
    this.handleResize();
  }
  
  sampleColors() {
    const style = getComputedStyle(document.body);
    this.colors = {
      node: style.getPropertyValue('--text-muted').trim() || '#888',
      nodePulse: style.getPropertyValue('--interactive-accent').trim() || '#7c5cbf',
      line: style.getPropertyValue('--text-faint').trim() || '#666',
      lineSolid: style.getPropertyValue('--text-muted').trim() || '#888'
    };
  }
  
  getWindroseSVG() {
    // Simplified WindroseCompass SVG for the stamp
    return `
      <svg viewBox="0 0 100 100" style="width: 100%; height: 100%;">
        <defs>
          <filter id="dmt-stamp-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0, 0, 0, 0.6)"/>
          </filter>
        </defs>
        <g filter="url(#dmt-stamp-shadow)">
          <circle cx="50" cy="50" r="28" fill="rgba(0, 0, 0, 0.7)" stroke="rgba(196, 165, 123, 0.4)" stroke-width="2"/>
          <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(196, 165, 123, 0.3)" stroke-width="0.8"/>
          
          <!-- Cardinal lines -->
          <line x1="50" y1="2" x2="50" y2="22" stroke="rgba(196, 165, 123, 0.8)" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="50" y1="78" x2="50" y2="98" stroke="rgba(196, 165, 123, 0.5)" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="78" y1="50" x2="98" y2="50" stroke="rgba(196, 165, 123, 0.5)" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="2" y1="50" x2="22" y2="50" stroke="rgba(196, 165, 123, 0.5)" stroke-width="1.5" stroke-linecap="round"/>
          
          <!-- Compass star -->
          <path d="M 50 8 L 58 50 L 50 47 L 42 50 Z" fill="#c4a57b" stroke="#8b6842" stroke-width="0.8"/>
          <path d="M 50 92 L 56 50 L 50 53 L 44 50 Z" fill="rgba(196, 165, 123, 0.7)" stroke="rgba(139, 104, 66, 0.7)" stroke-width="0.5"/>
          <path d="M 92 50 L 50 44 L 53 50 L 50 56 Z" fill="rgba(196, 165, 123, 0.7)" stroke="rgba(139, 104, 66, 0.7)" stroke-width="0.5"/>
          <path d="M 8 50 L 50 44 L 47 50 L 50 56 Z" fill="rgba(196, 165, 123, 0.7)" stroke="rgba(139, 104, 66, 0.7)" stroke-width="0.5"/>
          
          <!-- N letter -->
          <text x="50" y="62" text-anchor="middle" font-size="28" font-weight="bold" fill="#c4a57b" font-family="serif">N</text>
          
          <!-- Red north arrow -->
          <path d="M 50 14 L 45 24 L 50 20 L 55 24 Z" fill="#e74c3c" stroke="#c0392b" stroke-width="0.5"/>
        </g>
      </svg>
    `;
  }
  
  handleResize() {
    const rect = this.container.getBoundingClientRect();
    const width = Math.floor(rect.width);
    if (width < 10) return;
    
    this.width = width;
    this.canvas.width = width;
    this.canvas.height = this.height;
    
    // Update stamp size
    const stampSize = Math.min(65, Math.max(45, width * 0.12));
    this.stampSize = stampSize;
    this.stampOverlay.style.width = stampSize + 'px';
    this.stampOverlay.style.height = stampSize + 'px';
    
    // Restart animation with new dimensions
    if (this.animationId) {
      this.stop();
      this.start();
    }
  }
  
  /**
   * Update animation settings
   * 
   * Behavior by setting type:
   * - corridorStyle: Updates on-the-fly (affects line drawing)
   * - circleChance: Takes effect on next animation cycle (affects node generation)
   * - loopChance: Takes effect on next animation cycle (affects connection generation)
   * - size: Restarts animation immediately (affects node count significantly)
   */
  updateSettings(newSettings) {
    const sizeChanged = newSettings.size && newSettings.size !== this.settings.size;
    this.settings = { ...this.settings, ...newSettings };
    
    // Size changes warrant an immediate restart since node count changes dramatically
    if (sizeChanged && this.animationId) {
      this.restartAnimation();
    }
  }
  
  /**
   * Restart the animation with current settings
   */
  restartAnimation() {
    if (!this.animationId) return;
    
    this.hideStamp();
    this.initState();
  }
  
  // Apply style overrides (from DUNGEON_STYLES)
  applyStyle(styleName) {
    const styleOverrides = {
      classic: {},
      cavern: { circleChance: 0.6, corridorStyle: 'organic', loopChance: 0.2 },
      fortress: { circleChance: 0, corridorStyle: 'straight', loopChance: 0.08 },
      crypt: { circleChance: 0.1, corridorStyle: 'straight', loopChance: 0.02 }
    };
    
    const overrides = styleOverrides[styleName] || {};
    this.updateSettings(overrides);
  }
  
  start() {
    if (this.animationId) return;
    
    this.initState();
    this.lastTime = performance.now();
    this.animationId = requestAnimationFrame((t) => this.render(t));
  }
  
  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.hideStamp();
  }
  
  destroy() {
    this.stop();
    this.resizeObserver.disconnect();
    this.container.removeChild(this.canvas);
    this.container.removeChild(this.stampOverlay);
  }
  
  // === Animation State ===
  
  initState() {
    const nodeCount = this.settings.size === 'small' ? 5 : 
                      this.settings.size === 'large' ? 12 : 8;
    
    this.state = {
      phase: 'JOURNEY',
      phaseTime: 0,
      journeyStep: 0,
      nodes: [],
      connections: [],
      loopConnections: [],
      circledNode: null,
      fadeOpacity: 1,
      camera: {
        x: 0, y: 0, zoom: 2.2,
        targetX: 0, targetY: 0, targetZoom: 2.2,
        velX: 0, velY: 0, velZoom: 0
      },
      discoveredNodes: new Set()
    };
    
    this.generateNodes(nodeCount);
    this.buildMST();
    this.buildLoops();
    
    // Set initial camera
    if (this.state.nodes.length > 0) {
      const first = this.state.nodes[0];
      this.state.camera.x = this.state.camera.targetX = first.x;
      this.state.camera.y = this.state.camera.targetY = first.y;
    }
  }
  
  generateNodes(count) {
    const nodes = [];
    const padding = 30;
    const bottomPadding = 55; // Extra space at bottom for title overlay
    const minDist = 35;
    const { width, height } = this;
    
    for (let i = 0; i < count; i++) {
      let attempts = 0;
      let placed = false;
      
      while (!placed && attempts < 50) {
        const x = padding + Math.random() * (width - padding * 2);
        const y = padding + Math.random() * (height - padding - bottomPadding);
        
        const tooClose = nodes.some(n => {
          const dx = n.x - x;
          const dy = n.y - y;
          return Math.sqrt(dx * dx + dy * dy) < minDist;
        });
        
        if (!tooClose) {
          const isCircle = Math.random() < this.settings.circleChance;
          nodes.push({
            x, y,
            shape: isCircle ? 'circle' : 'rect',
            size: 5 + Math.random() * 3,
            opacity: 0,
            discovered: i === 0,
            arrivalPulse: 0
          });
          placed = true;
        }
        attempts++;
      }
    }
    
    if (nodes.length > 0) {
      nodes[0].opacity = 1;
      this.state.discoveredNodes.add(0);
      this.state.circledNode = nodes.length - 1;
    }
    
    this.state.nodes = nodes;
  }
  
  buildMST() {
    const nodes = this.state.nodes;
    if (nodes.length < 2) {
      this.state.connections = [];
      return;
    }
    
    const connections = [];
    const connected = new Set([0]);
    const unconnected = new Set(nodes.map((_, i) => i).filter(i => i !== 0));
    
    while (unconnected.size > 0) {
      let bestDist = Infinity;
      let bestEdge = null;
      
      for (const from of connected) {
        for (const to of unconnected) {
          const dx = nodes[to].x - nodes[from].x;
          const dy = nodes[to].y - nodes[from].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < bestDist) {
            bestDist = dist;
            bestEdge = { from, to, distance: dist };
          }
        }
      }
      
      if (bestEdge) {
        connections.push({ ...bestEdge, progress: 0 });
        connected.add(bestEdge.to);
        unconnected.delete(bestEdge.to);
      } else {
        break;
      }
    }
    
    this.state.connections = connections;
  }
  
  buildLoops() {
    const { nodes, connections } = this.state;
    const loops = [];
    const existingPairs = new Set(
      connections.map(c => `${Math.min(c.from, c.to)}-${Math.max(c.from, c.to)}`)
    );
    
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const key = `${i}-${j}`;
        if (!existingPairs.has(key) && Math.random() < this.settings.loopChance) {
          loops.push({ from: i, to: j, progress: 0 });
        }
      }
    }
    
    this.state.loopConnections = loops;
  }
  
  // === Easing & Math ===
  
  lerp(a, b, t) { return a + (b - a) * t; }
  
  easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  
  easeHandTraced(t) {
    if (t < 0.15) return t * t * 4.44;
    if (t > 0.85) return 1 - Math.pow(1 - t, 2) * 4.44;
    return 0.1 + ((t - 0.15) / 0.7) * 0.8;
  }
  
  smoothDamp(current, target, velocity, smoothTime, dt) {
    const omega = 2 / smoothTime;
    const x = omega * dt;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = current - target;
    const temp = (velocity + omega * change) * dt;
    const newVel = (velocity - omega * temp) * exp;
    return { value: target + (change + temp) * exp, velocity: newVel };
  }
  
  // === Stamp Control ===
  
  showStamp(screenX, screenY) {
    this.stampOverlay.style.left = screenX + 'px';
    this.stampOverlay.style.top = screenY + 'px';
    this.stampOverlay.style.transform = 'translate(-50%, -50%)';
    this.stampOverlay.style.animation = 'none';
    // Trigger reflow
    this.stampOverlay.offsetHeight;
    this.stampOverlay.style.animation = 'dmt-windrose-stamp 0.35s ease-out forwards';
    this.stampOverlay.style.opacity = '0.75';
  }
  
  hideStamp() {
    this.stampOverlay.style.opacity = '0';
    this.stampOverlay.style.animation = 'none';
  }
  
  // === Rendering ===
  
  render(time) {
    const dt = time - this.lastTime;
    this.lastTime = time;
    const dtSeconds = dt / 1000;
    
    const { state, ctx, width, height } = this;
    state.phaseTime += dt;
    
    // Clear
    ctx.clearRect(0, 0, width, height);
    
    // Smooth camera
    const camSmooth = 0.4;
    let result = this.smoothDamp(state.camera.x, state.camera.targetX, state.camera.velX, camSmooth, dtSeconds);
    state.camera.x = result.value; state.camera.velX = result.velocity;
    
    result = this.smoothDamp(state.camera.y, state.camera.targetY, state.camera.velY, camSmooth, dtSeconds);
    state.camera.y = result.value; state.camera.velY = result.velocity;
    
    result = this.smoothDamp(state.camera.zoom, state.camera.targetZoom, state.camera.velZoom, camSmooth * 1.2, dtSeconds);
    state.camera.zoom = result.value; state.camera.velZoom = result.velocity;
    
    // Apply camera
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(state.camera.zoom, state.camera.zoom);
    ctx.translate(-state.camera.x, -state.camera.y);
    ctx.globalAlpha = state.fadeOpacity;
    
    // Phase logic
    this.updatePhase(dt);
    
    // Draw connections
    state.connections.forEach(conn => {
      if (conn.progress > 0) {
        const from = state.nodes[conn.from];
        const to = state.nodes[conn.to];
        this.drawLine(from, to, conn.progress, false);
      }
    });
    
    // Draw loops
    state.loopConnections.forEach(conn => {
      if (conn.progress > 0) {
        const from = state.nodes[conn.from];
        const to = state.nodes[conn.to];
        this.drawLine(from, to, conn.progress, true);
      }
    });
    
    // Draw nodes
    state.nodes.forEach((node, i) => {
      if (!node.discovered || node.opacity <= 0) return;
      this.drawNode(node);
    });
    
    ctx.restore();
    
    this.animationId = requestAnimationFrame((t) => this.render(t));
  }
  
  updatePhase(dt) {
    const { state, width, height } = this;
    const BASE_JOURNEY_TIME = 350;
    const JOURNEY_VARIANCE = 200;
    const PAUSE_TIME = 180;
    
    switch (state.phase) {
      case 'JOURNEY': {
        const conn = state.connections[state.journeyStep];
        if (!conn) {
          state.phase = 'REVEAL';
          state.phaseTime = 0;
          break;
        }
        
        const variance = Math.sin(state.journeyStep * 7.3 + conn.distance * 0.5) * JOURNEY_VARIANCE;
        const connTime = BASE_JOURNEY_TIME + conn.distance * 2 + variance;
        const totalTime = connTime + PAUSE_TIME;
        
        if (state.phaseTime < connTime) {
          const progress = this.easeHandTraced(state.phaseTime / connTime);
          conn.progress = progress;
          
          const from = state.nodes[conn.from];
          const to = state.nodes[conn.to];
          state.camera.targetX = this.lerp(from.x, to.x, progress);
          state.camera.targetY = this.lerp(from.y, to.y, progress);
          
          const exploreProgress = state.journeyStep / state.connections.length;
          state.camera.targetZoom = this.lerp(2.0, 1.3, exploreProgress);
          
          if (progress > 0.8 && !state.nodes[conn.to].discovered) {
            state.nodes[conn.to].discovered = true;
            state.nodes[conn.to].arrivalPulse = 1;
            state.discoveredNodes.add(conn.to);
          }
        } else {
          conn.progress = 1;
          state.nodes[conn.to].opacity = Math.min(1, state.nodes[conn.to].opacity + 0.15);
          
          if (state.phaseTime >= totalTime) {
            state.journeyStep++;
            state.phaseTime = 0;
          }
        }
        break;
      }
      
      case 'REVEAL': {
        const revealTime = 800;
        const progress = Math.min(1, state.phaseTime / revealTime);
        
        // Calculate graph center
        const nodes = state.nodes;
        const minX = Math.min(...nodes.map(n => n.x));
        const maxX = Math.max(...nodes.map(n => n.x));
        const minY = Math.min(...nodes.map(n => n.y));
        const maxY = Math.max(...nodes.map(n => n.y));
        
        state.camera.targetX = (minX + maxX) / 2;
        state.camera.targetY = (minY + maxY) / 2;
        state.camera.targetZoom = 1.0;
        
        nodes.forEach(n => { if (n.discovered) n.opacity = Math.min(1, n.opacity + 0.1); });
        
        if (progress >= 1) {
          state.phase = 'LOOPING';
          state.phaseTime = 0;
        }
        break;
      }
      
      case 'LOOPING': {
        const loopTime = 600;
        const progress = state.phaseTime / loopTime;
        
        state.loopConnections.forEach((conn, i) => {
          conn.progress = Math.max(0, Math.min(1, (progress - i * 0.15) * 2));
        });
        
        if (progress >= 1 + state.loopConnections.length * 0.1) {
          state.phase = 'STAMPING';
          state.phaseTime = 0;
        }
        break;
      }
      
      case 'STAMPING': {
        if (state.phaseTime < 20 && state.circledNode !== null) {
          const node = state.nodes[state.circledNode];
          if (node) {
            const screenX = (node.x - state.camera.x) * state.camera.zoom + width / 2;
            const screenY = (node.y - state.camera.y) * state.camera.zoom + height / 2;
            this.showStamp(screenX, screenY);
          }
        }
        
        if (state.phaseTime >= 500) {
          state.phase = 'HOLDING';
          state.phaseTime = 0;
        }
        break;
      }
      
      case 'HOLDING': {
        if (state.phaseTime >= 1500) {
          state.phase = 'FADING';
          state.phaseTime = 0;
        }
        break;
      }
      
      case 'FADING': {
        if (state.phaseTime < 20) {
          this.hideStamp();
        }
        
        const fadeTime = 700;
        const progress = state.phaseTime / fadeTime;
        state.fadeOpacity = 1 - this.easeInOutCubic(progress);
        
        if (progress >= 1) {
          state.phase = 'WAITING';
          state.phaseTime = 0;
        }
        break;
      }
      
      case 'WAITING': {
        if (state.phaseTime >= 300) {
          // Reset
          const nodeCount = this.settings.size === 'small' ? 5 : 
                            this.settings.size === 'large' ? 12 : 8;
          
          state.phase = 'JOURNEY';
          state.phaseTime = 0;
          state.journeyStep = 0;
          state.fadeOpacity = 1;
          state.discoveredNodes.clear();
          
          this.generateNodes(nodeCount);
          this.buildMST();
          this.buildLoops();
          
          if (state.nodes.length > 0) {
            const first = state.nodes[0];
            state.camera.x = state.camera.targetX = first.x;
            state.camera.y = state.camera.targetY = first.y;
            state.camera.zoom = state.camera.targetZoom = 2.2;
            state.camera.velX = state.camera.velY = state.camera.velZoom = 0;
          }
        }
        break;
      }
    }
  }
  
  drawLine(from, to, progress, isLoop) {
    if (progress <= 0) return;
    
    const { ctx, colors, settings } = this;
    
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;
    
    const nx = dx / len;
    const ny = dy / len;
    
    // Clip to node edges
    const startPad = from.size + 3;
    const endPad = to.size + 3;
    const x1 = from.x + nx * startPad;
    const y1 = from.y + ny * startPad;
    const x2 = to.x - nx * endPad;
    const y2 = to.y - ny * endPad;
    
    const clippedLen = len - startPad - endPad;
    if (clippedLen <= 0) return;
    
    const wobbleAmount = settings.corridorStyle === 'organic' ? 3 : 0;
    
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    
    const segments = Math.max(5, Math.floor(clippedLen / 8));
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      if (t > progress) break;
      
      const px = x1 + (x2 - x1) * t;
      const py = y1 + (y2 - y1) * t;
      
      const wobble = Math.sin(t * Math.PI * 4 + len * 0.1) * wobbleAmount * (0.3 + t * 0.7);
      ctx.lineTo(px - ny * wobble, py + nx * wobble);
    }
    
    ctx.lineWidth = isLoop ? 1.5 : 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    if (isLoop) {
      ctx.setLineDash([4, 5]);
    } else {
      ctx.setLineDash([]);
    }
    
    const alpha = isLoop ? 0.5 : (0.5 + progress * 0.4);
    ctx.strokeStyle = colors.lineSolid + Math.floor(alpha * 255).toString(16).padStart(2, '0');
    ctx.stroke();
    
    // Pen head
    if (progress < 1 && !isLoop) {
      const headX = x1 + (x2 - x1) * progress;
      const headY = y1 + (y2 - y1) * progress;
      
      ctx.beginPath();
      ctx.arc(headX, headY, 5, 0, Math.PI * 2);
      ctx.fillStyle = colors.nodePulse + '33';
      ctx.fill();
      
      ctx.beginPath();
      ctx.arc(headX, headY, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = colors.nodePulse + 'aa';
      ctx.fill();
    }
    
    ctx.setLineDash([]);
  }
  
  drawNode(node) {
    const { ctx, colors, state } = this;
    const nodeAlpha = state.fadeOpacity * node.opacity;
    
    // Arrival pulse
    if (node.arrivalPulse > 0) {
      const pulseRadius = node.size + 10 * node.arrivalPulse;
      ctx.globalAlpha = nodeAlpha * node.arrivalPulse * 0.5;
      ctx.beginPath();
      ctx.arc(node.x, node.y, pulseRadius, 0, Math.PI * 2);
      ctx.strokeStyle = colors.nodePulse;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      node.arrivalPulse = Math.max(0, node.arrivalPulse - 0.025);
    }
    
    // Shadow
    ctx.globalAlpha = nodeAlpha * 0.25;
    const shadowOffset = 2;
    if (node.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(node.x + shadowOffset, node.y + shadowOffset, node.size + 1, 0, Math.PI * 2);
      ctx.fillStyle = colors.node;
      ctx.fill();
    } else {
      ctx.fillStyle = colors.node;
      ctx.fillRect(node.x - node.size + shadowOffset, node.y - node.size + shadowOffset, node.size * 2, node.size * 2);
    }
    
    ctx.globalAlpha = nodeAlpha;
    
    // Node shape
    if (node.shape === 'circle') {
      // Hollow ring
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);
      ctx.strokeStyle = colors.node;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      
      // Subtle fill
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.size - 1.5, 0, Math.PI * 2);
      ctx.fillStyle = colors.node + '20';
      ctx.fill();
    } else {
      // Filled square with outline
      const s = node.size;
      ctx.fillStyle = colors.node + '40';
      ctx.fillRect(node.x - s, node.y - s, s * 2, s * 2);
      
      ctx.strokeStyle = colors.node;
      ctx.lineWidth = 2;
      ctx.strokeRect(node.x - s, node.y - s, s * 2, s * 2);
    }
  }
}


// settingsPlugin-ObjectSetHelpers.js
// Object set management helpers - save, activate, import, export, scan
// This file is concatenated into the settings plugin template by the assembler

/**
 * Object set management helpers.
 * All methods take the plugin instance for access to settings and vault.
 */
const ObjectSetHelpers = {
  generateId() {
    return 'set-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  },

  /**
   * Resolve relative image filenames in set data to full vault paths.
   * Handles both customObjects and objectOverrides.
   */
  resolveImagePaths(data, imagesFolder, vault) {
    for (const side of ['hex', 'grid']) {
      if (!data[side]) continue;
      // Custom objects
      if (data[side].customObjects) {
        for (const obj of data[side].customObjects) {
          if (obj.imagePath && !obj.imagePath.includes('/')) {
            const resolved = imagesFolder + '/' + obj.imagePath;
            if (vault.getAbstractFileByPath(resolved)) {
              obj.imagePath = resolved;
            }
          }
        }
      }
      // Object overrides (built-in objects with custom images)
      if (data[side].objectOverrides) {
        for (const override of Object.values(data[side].objectOverrides)) {
          if (override.imagePath && !override.imagePath.includes('/')) {
            const resolved = imagesFolder + '/' + override.imagePath;
            if (vault.getAbstractFileByPath(resolved)) {
              override.imagePath = resolved;
            }
          }
        }
      }
    }
  },

  /**
   * Snapshot current hex+grid object data into a new ObjectSet.
   */
  saveCurrentAsSet(plugin, name) {
    const s = plugin.settings;
    if (!s.objectSets) s.objectSets = [];

    const set = {
      id: ObjectSetHelpers.generateId(),
      name: name,
      source: 'manual',
      data: {
        hex: {
          objectOverrides: JSON.parse(JSON.stringify(s.hexObjectOverrides || {})),
          customObjects: JSON.parse(JSON.stringify(s.customHexObjects || [])),
          customCategories: JSON.parse(JSON.stringify(s.customHexCategories || []))
        },
        grid: {
          objectOverrides: JSON.parse(JSON.stringify(s.gridObjectOverrides || {})),
          customObjects: JSON.parse(JSON.stringify(s.customGridObjects || [])),
          customCategories: JSON.parse(JSON.stringify(s.customGridCategories || []))
        }
      }
    };

    s.objectSets.push(set);
    return set;
  },

  /**
   * Copy-on-activate: overwrite hex/grid settings keys from set data.
   * Only overwrites sides that are present in the set (partial apply).
   */
  activateSet(plugin, setId) {
    const s = plugin.settings;
    const sets = s.objectSets || [];
    const set = sets.find(st => st.id === setId);
    if (!set) return false;

    if (set.data.hex) {
      s.hexObjectOverrides = JSON.parse(JSON.stringify(set.data.hex.objectOverrides || {}));
      s.customHexObjects = JSON.parse(JSON.stringify(set.data.hex.customObjects || []));
      s.customHexCategories = JSON.parse(JSON.stringify(set.data.hex.customCategories || []));
    }
    if (set.data.grid) {
      s.gridObjectOverrides = JSON.parse(JSON.stringify(set.data.grid.objectOverrides || {}));
      s.customGridObjects = JSON.parse(JSON.stringify(set.data.grid.customObjects || []));
      s.customGridCategories = JSON.parse(JSON.stringify(set.data.grid.customCategories || []));
    }

    s.activeObjectSetId = setId;
    return true;
  },

  /**
   * Clear activeObjectSetId. Leaves current objects in place.
   */
  deactivateSet(plugin) {
    plugin.settings.activeObjectSetId = null;
  },

  /**
   * Reset all object customizations to built-in defaults for both map types.
   * Clears overrides, custom objects, custom categories, and active set tracking.
   */
  resetToDefaults(plugin) {
    const s = plugin.settings;
    s.hexObjectOverrides = {};
    s.customHexObjects = [];
    s.customHexCategories = [];
    s.gridObjectOverrides = {};
    s.customGridObjects = [];
    s.customGridCategories = [];
    s.activeObjectSetId = null;
  },

  /**
   * Check if live object settings differ from the active set (or from defaults).
   * Returns true if the user has unsaved modifications.
   */
  isDirty(plugin) {
    const s = plugin.settings;
    const activeSetId = s.activeObjectSetId;

    const hexOverrides = s.hexObjectOverrides || {};
    const hexObjects = s.customHexObjects || [];
    const hexCategories = s.customHexCategories || [];
    const gridOverrides = s.gridObjectOverrides || {};
    const gridObjects = s.customGridObjects || [];
    const gridCategories = s.customGridCategories || [];

    if (!activeSetId) {
      // On Defaults - dirty if any customizations exist
      return Object.keys(hexOverrides).length > 0 ||
        hexObjects.length > 0 || hexCategories.length > 0 ||
        Object.keys(gridOverrides).length > 0 ||
        gridObjects.length > 0 || gridCategories.length > 0;
    }

    // On a named set - compare live state to stored snapshot
    const set = (s.objectSets || []).find(st => st.id === activeSetId);
    if (!set) return true;

    const compare = (live, stored) => JSON.stringify(live) !== JSON.stringify(stored);

    const setHex = set.data.hex || {};
    if (compare(hexOverrides, setHex.objectOverrides || {})) return true;
    if (compare(hexObjects, setHex.customObjects || [])) return true;
    if (compare(hexCategories, setHex.customCategories || [])) return true;

    const setGrid = set.data.grid || {};
    if (compare(gridOverrides, setGrid.objectOverrides || {})) return true;
    if (compare(gridObjects, setGrid.customObjects || [])) return true;
    if (compare(gridCategories, setGrid.customCategories || [])) return true;

    return false;
  },

  /**
   * Delete a set by ID. Clears activeObjectSetId if it was the active set.
   */
  deleteSet(plugin, setId) {
    const s = plugin.settings;
    if (!s.objectSets) return;
    s.objectSets = s.objectSets.filter(st => st.id !== setId);
    if (s.activeObjectSetId === setId) {
      s.activeObjectSetId = null;
    }
  },

  /**
   * Rename a set in place.
   */
  renameSet(plugin, setId, newName) {
    const s = plugin.settings;
    const set = (s.objectSets || []).find(st => st.id === setId);
    if (set) set.name = newName;
  },

  /**
   * Get all imagePath values from a set's custom objects and overrides.
   */
  getImagePaths(setData) {
    const paths = [];
    for (const side of ['hex', 'grid']) {
      const sideData = setData[side];
      if (!sideData) continue;
      if (sideData.customObjects) {
        for (const obj of sideData.customObjects) {
          if (obj.imagePath) paths.push(obj.imagePath);
        }
      }
      if (sideData.objectOverrides) {
        for (const override of Object.values(sideData.objectOverrides)) {
          if (override.imagePath) paths.push(override.imagePath);
        }
      }
    }
    return [...new Set(paths)];
  },

  /**
   * Deduplicate a set name against existing sets.
   * Returns the name as-is if unique, or appends " (2)", " (3)", etc.
   */
  deduplicateName(existingSets, name) {
    const names = new Set(existingSets.map(s => s.name));
    if (!names.has(name)) return name;
    let counter = 2;
    while (names.has(name + ' (' + counter + ')')) counter++;
    return name + ' (' + counter + ')';
  },

  /**
   * Export a set to a vault folder.
   * Creates <destFolder>/<setName>/objects.json and copies images to images/.
   */
  async exportSetToFolder(plugin, setId, destFolder, options) {
    const s = plugin.settings;
    const set = (s.objectSets || []).find(st => st.id === setId);
    if (!set) throw new Error('Set not found');

    const includeHex = options?.includeHex !== false;
    const includeGrid = options?.includeGrid !== false;
    const setName = (options?.name || set.name).replace(/[\\/:*?"<>|]/g, '_');

    // Build export data
    const exportData = {
      windroseMD_objectSet: true,
      version: '1.0',
      name: options?.name || set.name
    };

    const exportSetData = {};
    if (includeHex && set.data.hex) {
      exportSetData.hex = JSON.parse(JSON.stringify(set.data.hex));
    }
    if (includeGrid && set.data.grid) {
      exportSetData.grid = JSON.parse(JSON.stringify(set.data.grid));
    }

    // Collect image paths and rewrite to relative filenames
    const imagePaths = ObjectSetHelpers.getImagePaths(exportSetData);
    const imageMap = {};
    for (const fullPath of imagePaths) {
      const filename = fullPath.split('/').pop();
      imageMap[fullPath] = filename;
    }

    // Rewrite imagePath in export data to relative filenames
    for (const side of ['hex', 'grid']) {
      if (!exportSetData[side]) continue;
      if (exportSetData[side].customObjects) {
        for (const obj of exportSetData[side].customObjects) {
          if (obj.imagePath && imageMap[obj.imagePath]) {
            obj.imagePath = imageMap[obj.imagePath];
          }
        }
      }
      if (exportSetData[side].objectOverrides) {
        for (const override of Object.values(exportSetData[side].objectOverrides)) {
          if (override.imagePath && imageMap[override.imagePath]) {
            override.imagePath = imageMap[override.imagePath];
          }
        }
      }
    }

    exportData.hex = exportSetData.hex;
    exportData.grid = exportSetData.grid;

    // Write to vault
    const basePath = destFolder ? destFolder + '/' + setName : 'object-sets/' + setName;

    // Ensure folders exist
    try { await plugin.app.vault.createFolder(basePath); } catch (e) { /* exists */ }

    const jsonPath = basePath + '/objects.json';
    const jsonContent = JSON.stringify(exportData, null, 2);
    const existingJson = plugin.app.vault.getAbstractFileByPath(jsonPath);
    if (existingJson) {
      await plugin.app.vault.modify(existingJson, jsonContent);
    } else {
      await plugin.app.vault.create(jsonPath, jsonContent);
    }

    // Copy images
    if (imagePaths.length > 0) {
      const imgFolder = basePath + '/images';
      try { await plugin.app.vault.createFolder(imgFolder); } catch (e) { /* exists */ }

      for (const fullPath of imagePaths) {
        const sourceFile = plugin.app.vault.getAbstractFileByPath(fullPath);
        if (!sourceFile) {
          
          continue;
        }
        const filename = imageMap[fullPath];
        const destPath = imgFolder + '/' + filename;
        const existingImg = plugin.app.vault.getAbstractFileByPath(destPath);
        if (!existingImg) {
          const binary = await plugin.app.vault.readBinary(sourceFile);
          await plugin.app.vault.createBinary(destPath, binary);
        }
      }
    }

    return basePath;
  },

  /**
   * Import a set from a vault folder containing objects.json.
   * Resolves relative image filenames back to vault paths.
   */
  async importSetFromFolder(plugin, folderPath) {
    const folder = plugin.app.vault.getAbstractFileByPath(folderPath);
    if (!folder || !folder.children) {
      throw new Error('Folder not found: ' + folderPath);
    }

    const jsonFile = plugin.app.vault.getAbstractFileByPath(folderPath + '/objects.json');
    if (!jsonFile) {
      throw new Error('No objects.json found in ' + folderPath);
    }

    const content = await plugin.app.vault.read(jsonFile);
    const data = JSON.parse(content);

    if (!data.windroseMD_objectSet) {
      throw new Error('Not a valid Windrose object set (missing windroseMD_objectSet flag)');
    }

    // Resolve relative image filenames to vault paths
    ObjectSetHelpers.resolveImagePaths(data, folderPath + '/images', plugin.app.vault);

    // Build set object
    const s = plugin.settings;
    if (!s.objectSets) s.objectSets = [];

    const setName = ObjectSetHelpers.deduplicateName(s.objectSets, data.name || 'Imported Set');

    const set = {
      id: ObjectSetHelpers.generateId(),
      name: setName,
      source: 'folder',
      folderPath: folderPath,
      data: {
        hex: data.hex || undefined,
        grid: data.grid || undefined
      }
    };

    s.objectSets.push(set);
    return set;
  },

  /**
   * Scan the auto-load folder for valid object set packages.
   * Adds or updates folder-sourced sets. Does not remove stale ones
   * (user may have moved folders around).
   */
  async scanAutoLoadFolder(plugin) {
    const folderPath = plugin.settings.objectSetsAutoLoadFolder;
    if (!folderPath) return 0;

    const folder = plugin.app.vault.getAbstractFileByPath(folderPath);
    if (!folder || !folder.children) return 0;

    if (!plugin.settings.objectSets) plugin.settings.objectSets = [];

    let added = 0;
    for (const child of folder.children) {
      // Only look at subfolders
      if (!child.children) continue;

      const jsonFile = plugin.app.vault.getAbstractFileByPath(child.path + '/objects.json');
      if (!jsonFile) continue;

      try {
        const content = await plugin.app.vault.read(jsonFile);
        const data = JSON.parse(content);
        if (!data.windroseMD_objectSet) continue;

        // Check if this folder is already tracked
        const existing = plugin.settings.objectSets.find(
          st => st.source === 'folder' && st.folderPath === child.path
        );

        // Resolve relative image filenames to vault paths
        ObjectSetHelpers.resolveImagePaths(data, child.path + '/images', plugin.app.vault);

        if (existing) {
          // Update data in place
          existing.name = data.name || existing.name;
          existing.data = { hex: data.hex, grid: data.grid };
        } else {
          const setName = ObjectSetHelpers.deduplicateName(
            plugin.settings.objectSets,
            data.name || child.name
          );

          plugin.settings.objectSets.push({
            id: ObjectSetHelpers.generateId(),
            name: setName,
            source: 'folder',
            folderPath: child.path,
            data: { hex: data.hex, grid: data.grid }
          });
          added++;
        }
      } catch (e) {
        
      }
    }

    return added;
  }
};

// settingsPlugin-FolderSuggest.js
// Folder path autocomplete using Obsidian's AbstractInputSuggest
// This file is concatenated into the settings plugin template by the assembler

class FolderSuggest extends AbstractInputSuggest {
  getSuggestions(query) {
    const folders = this.app.vault.getAllFolders(true);
    if (!query) return folders;
    const lower = query.toLowerCase();
    return folders.filter(f => f.path.toLowerCase().includes(lower));
  }

  renderSuggestion(folder, el) {
    el.setText(folder.path === '' ? '/ (vault root)' : folder.path);
  }

  selectSuggestion(folder) {
    this.setValue(folder.path);
    this.textInputEl.dispatchEvent(new Event('input'));
    this.close();
  }
}

// =============================================================================
// MODAL CLASSES
// Injected at assembly time from settingsPlugin-*Modal.js files
// =============================================================================

// settingsPlugin-InsertMapModal.js
// Modal for inserting a new map block into the editor
// This file is concatenated into the settings plugin template by the assembler

/**
 * Modal for inserting a new map block into the editor
 */
class InsertMapModal extends Modal {
  constructor(app, onInsert) {
    super(app);
    this.onInsert = onInsert;
    this.mapName = '';
    this.mapType = null; // 'grid' or 'hex'
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-insert-map-modal');
    
    
    contentEl.createEl('h2', { text: 'Insert New Map' });
    
    // Map name input
    new Setting(contentEl)
      .setName('Map name')
      .setDesc('A display name for this map (can be left blank)')
      .addText(text => {
        this.nameInput = text;
        text
          .setPlaceholder('e.g., Goblin Cave Level 1')
          .onChange(value => {
            this.mapName = value;
          });
        // Focus the input after modal opens
        setTimeout(() => text.inputEl.focus(), 10);
      });
    
    // Map type selection
    const typeContainer = contentEl.createDiv({ cls: 'dmt-map-type-selection' });
    typeContainer.createEl('div', { text: 'Map type', cls: 'setting-item-name' });
    typeContainer.createEl('div', { 
      text: 'Choose the grid style for this map', 
      cls: 'setting-item-description' 
    });
    
    const buttonRow = typeContainer.createDiv({ cls: 'dmt-map-type-buttons' });
    
    const gridBtn = buttonRow.createEl('button', { 
      text: 'Grid',
      cls: 'dmt-map-type-btn',
      attr: { type: 'button' }
    });
    
    const hexBtn = buttonRow.createEl('button', { 
      text: 'Hex',
      cls: 'dmt-map-type-btn',
      attr: { type: 'button' }
    });
    
    gridBtn.onclick = () => {
      this.mapType = 'grid';
      gridBtn.addClass('selected');
      hexBtn.removeClass('selected');
    };
    
    hexBtn.onclick = () => {
      this.mapType = 'hex';
      hexBtn.addClass('selected');
      gridBtn.removeClass('selected');
    };
    
    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: 'dmt-modal-buttons' });
    
    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();
    
    const insertBtn = buttonContainer.createEl('button', { text: 'Insert', cls: 'mod-cta' });
    insertBtn.onclick = () => {
      if (!this.mapType) {
        // Brief visual feedback that type is required
        buttonRow.addClass('dmt-shake');
        setTimeout(() => buttonRow.removeClass('dmt-shake'), 300);
        return;
      }
      this.onInsert(this.mapName, this.mapType);
      this.close();
    };
    
    // Handle Enter key to submit (if type is selected)
    contentEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.mapType) {
        e.preventDefault();
        this.onInsert(this.mapName, this.mapType);
        this.close();
      }
    });
  }
  
  onClose() {
    this.contentEl.empty();
  }
}


// settingsPlugin-InsertDungeonModal.js
// Modal for generating a random dungeon
// This file is concatenated into the settings plugin template by the assembler

// Style defaults at module scope - avoids recreation on each call
const DUNGEON_STYLE_DEFAULTS = {
  classic: {
    circleChance: 0.3, corridorStyle: 'straight', loopChance: 0.15,
    waterChance: 0.15, doorChance: 0.7, secretDoorChance: 0.05,
    wideCorridorChance: 0.25, roomSizeBias: 0, diagonalCorridorChance: 0.5
  },
  cavern: {
    circleChance: 0.6, corridorStyle: 'organic', loopChance: 0.2,
    waterChance: 0.35, doorChance: 0.3, secretDoorChance: 0.08,
    wideCorridorChance: 0.4, roomSizeBias: 0.3, diagonalCorridorChance: 0.7
  },
  fortress: {
    circleChance: 0, corridorStyle: 'straight', loopChance: 0.08,
    waterChance: 0.05, doorChance: 0.9, secretDoorChance: 0.03,
    wideCorridorChance: 0.5, roomSizeBias: 0.2, diagonalCorridorChance: 0.2
  },
  crypt: {
    circleChance: 0.1, corridorStyle: 'straight', loopChance: 0.02,
    waterChance: 0.1, doorChance: 0.8, secretDoorChance: 0.15,
    wideCorridorChance: 0.1, roomSizeBias: -0.3, diagonalCorridorChance: 0.3
  }
};

/**
 * Stock a generated dungeon with objects using the objectPlacer module.
 * @param {Object} objectPlacer - The loaded objectPlacer module
 * @param {Object} result - The dungeon generation result
 * @param {Object} overrides - Config overrides from the modal
 * @returns {Object} Stock result with objects array
 */
async function stockGeneratedDungeon(plugin, result, overrides) {
  const objectPlacer = await plugin.loadObjectPlacer();
  return objectPlacer.stockDungeon(
    result.metadata.rooms,
    result.metadata.corridorResult,
    result.metadata.doorPositions,
    result.metadata.style || 'classic',
    {
      objectDensity: overrides.objectDensity ?? 1.0,
      monsterWeight: overrides.monsterWeight,
      emptyWeight: overrides.emptyWeight,
      featureWeight: overrides.featureWeight,
      trapWeight: overrides.trapWeight,
      useTemplates: overrides.useTemplates
    },
    {
      entryRoomId: result.metadata.entryRoomId,
      exitRoomId: result.metadata.exitRoomId,
      waterRoomIds: result.metadata.waterRoomIds
    }
  );
}

class InsertDungeonModal extends Modal {
  constructor(app, plugin, onInsert) {
    super(app);
    this.plugin = plugin;
    this.onInsert = onInsert;
    this.mapName = '';
    this.dungeonSize = null; // 'small', 'medium', or 'large'
    this.distancePerCell = 5;
    this.distanceUnit = 'ft';
    this.advancedOpen = false;
    this.dungeonStyle = 'classic'; // Default style
    this.visualizer = null; // DungeonEssenceVisualizer instance
    // Slider references for syncing with style changes
    this.sliderRefs = {};
    this.corridorSelect = null;
    // Config overrides - null means use preset default
    this.configOverrides = {
      circleChance: null,
      loopChance: null,
      doorChance: null,
      secretDoorChance: null,
      wideCorridorChance: null,
      roomSizeBias: null,
      corridorStyle: null,
      diagonalCorridorChance: null,
      style: null,
      // Object placement settings
      objectDensity: null,
      monsterWeight: null,
      emptyWeight: null,
      featureWeight: null,
      trapWeight: null,
      useTemplates: null,
      // Water features
      waterChance: null,
      // Fog of war
      autoFogEnabled: false
    };
  }
  
  getVisualizerSettings() {
    const base = DUNGEON_STYLE_DEFAULTS[this.dungeonStyle] || DUNGEON_STYLE_DEFAULTS.classic;
    
    // Apply any explicit overrides
    const settings = { ...base, size: this.dungeonSize || 'medium' };
    if (this.configOverrides.circleChance !== null) settings.circleChance = this.configOverrides.circleChance;
    if (this.configOverrides.loopChance !== null) settings.loopChance = this.configOverrides.loopChance;
    if (this.configOverrides.corridorStyle !== null) settings.corridorStyle = this.configOverrides.corridorStyle;
    
    return settings;
  }
  
  // Update visualizer with current settings
  updateVisualizer() {
    if (this.visualizer) {
      this.visualizer.updateSettings(this.getVisualizerSettings());
    }
  }

  syncSlidersToStyle() {
    const defaults = DUNGEON_STYLE_DEFAULTS[this.dungeonStyle] || DUNGEON_STYLE_DEFAULTS.classic;

    // Update each slider to the style default
    for (const [key, ref] of Object.entries(this.sliderRefs)) {
      if (defaults[key] !== undefined) {
        ref.slider.value = String(defaults[key]);
        ref.valueDisplay.textContent = ref.formatFn(defaults[key]);
        // Clear override so generator uses style default
        this.configOverrides[key] = null;
      }
    }

    // Update corridor style select
    if (this.corridorSelect && defaults.corridorStyle) {
      this.corridorSelect.value = defaults.corridorStyle;
      this.configOverrides.corridorStyle = null;
    }

    this.updateVisualizer();
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-insert-dungeon-modal');
    
    // === Header with Visualizer ===
    const headerContainer = contentEl.createDiv({ cls: 'dmt-dungeon-header' });
    
    // Visualizer canvas container
    const visualizerContainer = headerContainer.createDiv({ cls: 'dmt-dungeon-visualizer' });
    
    // Title overlay at bottom of visualizer
    const titleOverlay = headerContainer.createDiv({ cls: 'dmt-dungeon-title-overlay' });
    titleOverlay.createEl('h2', { text: 'Generate Random Dungeon' });
    
    // Initialize visualizer
    this.visualizer = new DungeonEssenceVisualizer(visualizerContainer, {
      height: 180,
      settings: this.getVisualizerSettings()
    });
    this.visualizer.start();
    
    // Map name input
    new Setting(contentEl)
      .setName('Map name')
      .setDesc('A display name for this dungeon map (can be left blank)')
      .addText(text => {
        this.nameInput = text;
        text
          .setPlaceholder('e.g., Goblin Cave Level 1')
          .onChange(value => {
            this.mapName = value;
          });
        // Focus the input after modal opens
        setTimeout(() => text.inputEl.focus(), 10);
      });
    
    // Dungeon style selection
    const styleContainer = contentEl.createDiv({ cls: 'dmt-dungeon-style-selection' });
    styleContainer.createEl('div', { text: 'Style', cls: 'setting-item-name' });
    styleContainer.createEl('div', { 
      text: 'Choose the architectural style of the dungeon', 
      cls: 'setting-item-description' 
    });
    
    const styleRow = styleContainer.createDiv({ cls: 'dmt-dungeon-style-buttons' });
    
    const styleInfo = {
      classic: { label: 'Classic', desc: 'Balanced mix of rooms and corridors' },
      cavern: { label: 'Cavern', desc: 'Natural caves with organic passages' },
      fortress: { label: 'Fortress', desc: 'Military structure, wide corridors' },
      crypt: { label: 'Crypt', desc: 'Tight passages, hidden chambers' }
    };
    
    const styleButtons = {};
    
    for (const [style, info] of Object.entries(styleInfo)) {
      const btn = styleRow.createEl('button', { 
        cls: 'dmt-dungeon-style-btn',
        text: info.label,
        attr: { type: 'button', title: info.desc }
      });
      styleButtons[style] = btn;
      
      btn.onclick = () => {
        this.dungeonStyle = style;
        this.configOverrides.style = style === 'classic' ? null : style;
        Object.values(styleButtons).forEach(b => b.removeClass('selected'));
        btn.addClass('selected');
        this.syncSlidersToStyle();
      };
    }
    
    // Default to classic selected
    styleButtons.classic.addClass('selected');
    
    // Dungeon size selection
    const sizeContainer = contentEl.createDiv({ cls: 'dmt-dungeon-size-selection' });
    sizeContainer.createEl('div', { text: 'Dungeon size', cls: 'setting-item-name' });
    sizeContainer.createEl('div', { 
      text: 'Choose the overall size of the generated dungeon', 
      cls: 'setting-item-description' 
    });
    
    const buttonRow = sizeContainer.createDiv({ cls: 'dmt-dungeon-size-buttons' });
    
    const presetInfo = {
      small: { label: 'Small', desc: '3-5 rooms, tight layout' },
      medium: { label: 'Medium', desc: '8-12 rooms, multiple paths' },
      large: { label: 'Large', desc: '10-15 rooms, grand scale' }
    };
    
    const buttons = {};
    
    for (const [preset, info] of Object.entries(presetInfo)) {
      const btn = buttonRow.createEl('button', { 
        cls: 'dmt-dungeon-size-btn',
        text: info.label,
        attr: { type: 'button', title: info.desc }
      });
      buttons[preset] = btn;
      
      btn.onclick = () => {
        this.dungeonSize = preset;
        Object.values(buttons).forEach(b => b.removeClass('selected'));
        btn.addClass('selected');
        this.updateVisualizer();
      };
    }
    
    // Distance measurement settings
    const distContainer = contentEl.createDiv({ cls: 'dmt-dungeon-size-selection' });
    distContainer.createEl('div', { text: 'Distance measurement', cls: 'setting-item-name' });
    distContainer.createEl('div', { 
      text: 'Set the scale for distance measurement on this map', 
      cls: 'setting-item-description' 
    });
    
    const distRow = distContainer.createDiv({ cls: 'dmt-dungeon-distance-row' });
    
    const distInput = distRow.createEl('input', {
      type: 'number',
      value: String(this.distancePerCell),
      attr: { min: '1', step: '1' }
    });
    distInput.addEventListener('change', (e) => {
      this.distancePerCell = parseInt(e.target.value) || 5;
    });
    
    distRow.createEl('span', { text: 'per cell, unit:' });
    
    const unitInput = distRow.createEl('input', {
      type: 'text',
      value: this.distanceUnit
    });
    unitInput.addEventListener('change', (e) => {
      this.distanceUnit = e.target.value || 'ft';
    });
    
    // Advanced options (collapsed by default)
    const advancedContainer = contentEl.createDiv({ cls: 'dmt-dungeon-advanced' });
    
    const advancedHeader = advancedContainer.createDiv({ cls: 'dmt-dungeon-advanced-header' });
    const chevron = advancedHeader.createSpan({ cls: 'dmt-dungeon-advanced-chevron', text: '▶' });
    advancedHeader.createSpan({ text: 'Advanced Options' });
    
    const advancedContent = advancedContainer.createDiv({ cls: 'dmt-dungeon-advanced-content' });
    advancedContent.style.display = 'none';
    
    advancedHeader.onclick = () => {
      this.advancedOpen = !this.advancedOpen;
      advancedContent.style.display = this.advancedOpen ? 'block' : 'none';
      chevron.textContent = this.advancedOpen ? '▼' : '▶';
    };
    
    // Helper to create a slider row
    const createSlider = (container, label, key, min, max, step, defaultVal, formatFn) => {
      const row = container.createDiv({ cls: 'dmt-dungeon-slider-row' });
      row.createEl('label', { text: label });

      const sliderContainer = row.createDiv({ cls: 'dmt-dungeon-slider-container' });
      const slider = sliderContainer.createEl('input', {
        type: 'range',
        attr: { min: String(min), max: String(max), step: String(step) }
      });
      slider.value = String(defaultVal);

      const valueDisplay = sliderContainer.createSpan({
        cls: 'dmt-dungeon-slider-value',
        text: formatFn(defaultVal)
      });

      slider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        valueDisplay.textContent = formatFn(val);
        this.configOverrides[key] = val;
        this.updateVisualizer();
      });

      // Store reference for style sync
      this.sliderRefs[key] = { slider, valueDisplay, formatFn };

      return { slider, valueDisplay };
    };
    
    // Percentage formatter
    const pct = (v) => `${Math.round(v * 100)}%`;
    // Bias formatter  
    const biasLabel = (v) => {
      if (v < -0.3) return 'Compact';
      if (v > 0.3) return 'Spacious';
      return 'Normal';
    };
    
    createSlider(advancedContent, 'Circular Rooms', 'circleChance', 0, 1, 0.05, 0.3, pct);
    createSlider(advancedContent, 'Extra Connections', 'loopChance', 0, 0.5, 0.05, 0.15, pct);
    createSlider(advancedContent, 'Door Frequency', 'doorChance', 0, 1, 0.05, 0.7, pct);
    createSlider(advancedContent, 'Secret Doors', 'secretDoorChance', 0, 1, 0.05, 0.05, pct);
    createSlider(advancedContent, 'Wide Corridors', 'wideCorridorChance', 0, 1, 0.05, 0.25, pct);
    createSlider(advancedContent, 'Room Size Bias', 'roomSizeBias', -1, 1, 0.1, 0, biasLabel);
    
    // Corridor style toggle
    const corridorRow = advancedContent.createDiv({ cls: 'dmt-dungeon-slider-row' });
    corridorRow.createEl('label', { text: 'Corridor Style' });
    const corridorToggleContainer = corridorRow.createDiv({ cls: 'dmt-dungeon-toggle-container' });

    const corridorSelect = corridorToggleContainer.createEl('select', { cls: 'dmt-dungeon-select' });
    corridorSelect.createEl('option', { value: 'straight', text: 'Straight' });
    corridorSelect.createEl('option', { value: 'organic', text: 'Organic' });
    corridorSelect.createEl('option', { value: 'diagonal', text: 'Diagonal' });
    corridorSelect.value = 'straight';
    this.corridorSelect = corridorSelect; // Store reference for style sync

    corridorSelect.addEventListener('change', (e) => {
      this.configOverrides.corridorStyle = e.target.value;
      this.updateVisualizer();
    });

    // Diagonal corridor chance slider
    const diagonalLabel = (v) => v === 0 ? 'None' : `${Math.round(v * 100)}%`;
    createSlider(advancedContent, 'Diagonal Corridors', 'diagonalCorridorChance', 0, 1, 0.1, 0.5, diagonalLabel);

    // Environment section
    advancedContent.createEl('div', { cls: 'dmt-dungeon-section-header', text: 'Environment' });

    const waterLabel = (v) => v === 0 ? 'None' : `${Math.round(v * 100)}%`;
    createSlider(advancedContent, 'Water Features', 'waterChance', 0, 0.5, 0.05, 0.15, waterLabel);

    // Object placement section
    advancedContent.createEl('div', { cls: 'dmt-dungeon-section-header', text: 'Object Placement' });

    const densityLabel = (v) => v < 0.75 ? 'Sparse' : v > 1.25 ? 'Dense' : 'Normal';
    createSlider(advancedContent, 'Object Density', 'objectDensity', 0.5, 2, 0.1, 1.0, densityLabel);

    // Room templates toggle
    const templateRow = advancedContent.createDiv({ cls: 'dmt-dungeon-slider-row' });
    templateRow.createEl('label', { text: 'Room Templates' });
    const templateToggleContainer = templateRow.createDiv({ cls: 'dmt-dungeon-toggle-container' });
    const templateCheckbox = templateToggleContainer.createEl('input', {
      type: 'checkbox',
      attr: { id: 'dmt-template-toggle' }
    });
    templateCheckbox.checked = true; // Default to enabled
    templateToggleContainer.createEl('label', {
      attr: { for: 'dmt-template-toggle' },
      text: 'Enable',
      cls: 'dmt-checkbox-label'
    });
    templateCheckbox.addEventListener('change', (e) => {
      this.configOverrides.useTemplates = e.target.checked;
    });
    // Hint text below checkbox row
    advancedContent.createEl('div', {
      cls: 'dmt-checkbox-hint',
      text: 'Generates themed rooms (library, shrine, barracks) with appropriate objects'
    });

    advancedContent.createEl('div', { cls: 'dmt-dungeon-subsection', text: 'Room Categories' });
    createSlider(advancedContent, 'Monsters', 'monsterWeight', 0, 1, 0.05, 0.33, pct);
    createSlider(advancedContent, 'Empty Rooms', 'emptyWeight', 0, 1, 0.05, 0.33, pct);
    createSlider(advancedContent, 'Features', 'featureWeight', 0, 1, 0.05, 0.17, pct);
    createSlider(advancedContent, 'Traps', 'trapWeight', 0, 1, 0.05, 0.17, pct);

    // Auto-fog section
    advancedContent.createEl('div', { cls: 'dmt-dungeon-section-header', text: 'Solo Play' });

    const fogRow = advancedContent.createDiv({ cls: 'dmt-dungeon-slider-row' });
    fogRow.createEl('label', { text: 'Auto-Fog Dungeon' });
    const fogToggleContainer = fogRow.createDiv({ cls: 'dmt-dungeon-toggle-container' });
    const fogCheckbox = fogToggleContainer.createEl('input', {
      type: 'checkbox',
      attr: { id: 'dmt-fog-toggle' }
    });
    fogCheckbox.checked = false;
    fogToggleContainer.createEl('label', {
      attr: { for: 'dmt-fog-toggle' },
      text: 'Enable',
      cls: 'dmt-checkbox-label'
    });
    fogCheckbox.addEventListener('change', (e) => {
      this.configOverrides.autoFogEnabled = e.target.checked;
    });
    advancedContent.createEl('div', {
      cls: 'dmt-checkbox-hint',
      text: 'Cover dungeon with fog, revealing only the entrance room'
    });

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: 'dmt-modal-buttons' });
    
    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();
    
    const generateBtn = buttonContainer.createEl('button', { text: 'Generate', cls: 'mod-cta' });
    generateBtn.onclick = async () => {
      if (!this.dungeonSize) {
        // Brief visual feedback that size is required
        buttonRow.addClass('dmt-shake');
        setTimeout(() => buttonRow.removeClass('dmt-shake'), 300);
        return;
      }

      // Load generator
      try {
        const generator = await this.plugin.loadDungeonGenerator();

        // Build config overrides (only include non-null values)
        const overrides = {};
        for (const [key, val] of Object.entries(this.configOverrides)) {
          if (val !== null) overrides[key] = val;
        }

        const result = generator.generateDungeon(this.dungeonSize, undefined, overrides);
        const stockResult = await stockGeneratedDungeon(this.plugin, result, overrides);
        const allObjects = [...result.objects, ...stockResult.objects];

        await this.onInsert(this.mapName, result.cells, allObjects, result.edges || [], {
          distancePerCell: this.distancePerCell,
          distanceUnit: this.distanceUnit,
          preset: this.dungeonSize,
          configOverrides: overrides,
          roomCount: result.metadata.roomCount,
          doorCount: result.metadata.doorCount,
          stockingMetadata: {
            rooms: result.metadata.rooms,
            corridorResult: result.metadata.corridorResult,
            doorPositions: result.metadata.doorPositions,
            entryRoomId: result.metadata.entryRoomId,
            exitRoomId: result.metadata.exitRoomId,
            waterRoomIds: result.metadata.waterRoomIds,
            style: result.metadata.style
          }
        });
        this.close();
      } catch (err) {
        
        new Notice('Failed to generate dungeon: ' + err.message);
      }
    };

    // Handle Enter key to submit (if size is selected)
    contentEl.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && this.dungeonSize) {
        e.preventDefault();
        try {
          const generator = await this.plugin.loadDungeonGenerator();

          // Build config overrides (only include non-null values)
          const overrides = {};
          for (const [key, val] of Object.entries(this.configOverrides)) {
            if (val !== null) overrides[key] = val;
          }

          const result = generator.generateDungeon(this.dungeonSize, undefined, overrides);
          const stockResult = await stockGeneratedDungeon(this.plugin, result, overrides);
          const allObjects = [...result.objects, ...stockResult.objects];

          await this.onInsert(this.mapName, result.cells, allObjects, result.edges || [], {
            distancePerCell: this.distancePerCell,
            distanceUnit: this.distanceUnit,
            preset: this.dungeonSize,
            configOverrides: overrides,
            roomCount: result.metadata.roomCount,
            doorCount: result.metadata.doorCount,
            stockingMetadata: {
              rooms: result.metadata.rooms,
              corridorResult: result.metadata.corridorResult,
              doorPositions: result.metadata.doorPositions,
              entryRoomId: result.metadata.entryRoomId,
              exitRoomId: result.metadata.exitRoomId,
              waterRoomIds: result.metadata.waterRoomIds,
              style: result.metadata.style
            }
          });
          this.close();
        } catch (err) {
          
          new Notice('Failed to generate dungeon: ' + err.message);
        }
      }
    });
  }

  onClose() {
    if (this.visualizer) {
      this.visualizer.destroy();
      this.visualizer = null;
    }
    this.sliderRefs = {};
    this.corridorSelect = null;
    this.contentEl.empty();
  }
}

// settingsPlugin-ObjectEditModal.js
// Modal for editing object properties (symbol, label, category)
// This file is concatenated into the settings plugin template by the assembler

/**
 * Modal for editing object properties (symbol, label, category)
 */
class ObjectEditModal extends Modal {
  constructor(app, plugin, existingObject, onSave, mapType = 'grid') {
    super(app);
    this.plugin = plugin;
    this.existingObject = existingObject;
    this.onSave = onSave;
    this.mapType = mapType;
    
    // Form state
    this.symbol = existingObject?.symbol || '';
    this.iconClass = existingObject?.iconClass || '';
    this.imagePath = existingObject?.imagePath || '';
    this.label = existingObject?.label || '';
    this.category = existingObject?.category || 'features';

    // UI state - determine initial mode based on existing object
    // Modes: 'symbol', 'icon', 'image'
    this.mode = existingObject?.imagePath ? 'image' : (existingObject?.iconClass ? 'icon' : 'symbol');
    this.iconSearchQuery = '';
    this.iconCategory = 'all';
    this.imageSearchQuery = '';
    this.imageSearchResults = [];
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-object-edit-modal');
    
    const isEditing = !!this.existingObject;
    
    contentEl.createEl('h2', { text: isEditing ? 'Edit Object' : 'Create Custom Object' });
    
    // Mode toggle (symbol / icon / image)
    const toggleContainer = contentEl.createDiv({ cls: 'dmt-icon-type-toggle' });

    const unicodeBtn = toggleContainer.createEl('button', {
      text: 'Unicode Symbol',
      cls: 'dmt-icon-type-btn' + (this.mode === 'symbol' ? ' active' : ''),
      attr: { type: 'button' }
    });

    const iconBtn = toggleContainer.createEl('button', {
      text: 'RPGAwesome Icon',
      cls: 'dmt-icon-type-btn' + (this.mode === 'icon' ? ' active' : ''),
      attr: { type: 'button' }
    });

    const imageBtn = toggleContainer.createEl('button', {
      text: 'Custom Image',
      cls: 'dmt-icon-type-btn' + (this.mode === 'image' ? ' active' : ''),
      attr: { type: 'button' }
    });

    // Container for symbol input (shown when mode is 'symbol')
    this.symbolContainer = contentEl.createDiv({ cls: 'dmt-symbol-container' });

    // Container for icon picker (shown when mode is 'icon')
    this.iconPickerContainer = contentEl.createDiv({ cls: 'dmt-icon-picker-container' });

    // Container for image picker (shown when mode is 'image')
    this.imagePickerContainer = contentEl.createDiv({ cls: 'dmt-image-picker-container' });

    // Store button references for updating active state
    this.modeButtons = { symbol: unicodeBtn, icon: iconBtn, image: imageBtn };

    // Toggle handlers
    unicodeBtn.onclick = () => {
      if (this.mode === 'symbol') return;
      this.setMode('symbol');
    };

    iconBtn.onclick = () => {
      if (this.mode === 'icon') return;
      this.setMode('icon');
    };

    imageBtn.onclick = () => {
      if (this.mode === 'image') return;
      this.setMode('image');
    };

    // Initial render of all sections
    this.renderSymbolInput();
    this.renderIconPicker();
    this.renderImagePicker();
    
    // Label input
    this.labelSetting = new Setting(contentEl)
      .setName('Label')
      .setDesc('Display name for this object')
      .addText(text => {
        text
          .setValue(this.label)
          .setPlaceholder('e.g., Treasure Chest')
          .onChange(value => {
            this.label = value;
            // Clear error when user starts typing
            if (this.labelSetting.descEl.hasClass('mod-warning')) {
              this.labelSetting.setDesc('Display name for this object');
              this.labelSetting.descEl.removeClass('mod-warning');
            }
          });
        this.labelInputEl = text.inputEl;
      });
    
    // Category dropdown - use map-type-specific settings
    const mapTypeSettings = this.mapType === 'hex'
      ? { customCategories: this.plugin.settings.customHexCategories || [] }
      : { customCategories: this.plugin.settings.customGridCategories || [] };
    const allCategories = ObjectHelpers.getAllCategories(mapTypeSettings);
    new Setting(contentEl)
      .setName('Category')
      .setDesc('Group this object belongs to')
      .addDropdown(dropdown => {
        for (const cat of allCategories) {
          dropdown.addOption(cat.id, cat.label);
        }
        dropdown.setValue(this.category);
        dropdown.onChange(value => {
          this.category = value;
        });
      });
    
    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: 'dmt-modal-buttons' });
    
    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();
    
    const saveBtn = buttonContainer.createEl('button', { text: 'Save', cls: 'mod-cta' });
    saveBtn.onclick = () => this.save();
  }
  
  setMode(newMode) {
    this.mode = newMode;
    // Update button active states
    Object.entries(this.modeButtons).forEach(([mode, btn]) => {
      if (mode === newMode) {
        btn.addClass('active');
      } else {
        btn.removeClass('active');
      }
    });
    // Re-render all mode-specific containers
    this.renderSymbolInput();
    this.renderIconPicker();
    this.renderImagePicker();
  }

  renderSymbolInput() {
    const container = this.symbolContainer;
    container.empty();

    if (this.mode !== 'symbol') {
      container.style.display = 'none';
      return;
    }
    container.style.display = 'block';
    
    // Symbol input with preview
    const symbolSetting = new Setting(container)
      .setName('Symbol')
      .setDesc('Paste any Unicode character or emoji');
    
    const symbolInput = symbolSetting.controlEl.createEl('input', {
      type: 'text',
      cls: 'dmt-symbol-input',
      value: this.symbol,
      attr: { placeholder: 'Paste symbol...' }
    });
    symbolInput.addEventListener('input', (e) => {
      this.symbol = e.target.value.trim();
      this.updateSymbolPreview();
    });
    
    // Focus the symbol input after a short delay
    setTimeout(() => symbolInput.focus(), 50);
    
    // Symbol preview
    const previewEl = symbolSetting.controlEl.createDiv({ cls: 'dmt-symbol-preview' });
    previewEl.textContent = this.symbol || '?';
    this.symbolPreviewEl = previewEl;
    this.symbolInputEl = symbolInput;
    
    // Quick symbols
    const quickSymbolsContainer = container.createDiv({ cls: 'dmt-quick-symbols' });
    quickSymbolsContainer.createEl('label', { text: 'Quick Symbols', cls: 'dmt-quick-symbols-label' });
    const symbolGrid = quickSymbolsContainer.createDiv({ cls: 'dmt-quick-symbols-grid' });
    
    for (const sym of QUICK_SYMBOLS) {
      const symBtn = symbolGrid.createEl('button', { 
        text: sym, 
        cls: 'dmt-quick-symbol-btn',
        attr: { type: 'button' }
      });
      symBtn.onclick = () => {
        this.symbol = sym;
        symbolInput.value = sym;
        this.updateSymbolPreview();
      };
    }
  }
  
  renderIconPicker() {
    const container = this.iconPickerContainer;
    container.empty();

    if (this.mode !== 'icon') {
      container.style.display = 'none';
      return;
    }
    container.style.display = 'block';
    
    const picker = container.createDiv({ cls: 'dmt-icon-picker' });
    
    // Search input
    const searchContainer = picker.createDiv({ cls: 'dmt-icon-picker-search' });
    const searchInput = searchContainer.createEl('input', {
      type: 'text',
      value: this.iconSearchQuery,
      attr: { placeholder: 'Search icons...' }
    });
    searchInput.addEventListener('input', (e) => {
      this.iconSearchQuery = e.target.value;
      this.renderIconGrid();
    });
    
    // Category tabs
    const tabsContainer = picker.createDiv({ cls: 'dmt-icon-picker-tabs' });
    
    // "All" tab
    const allTab = tabsContainer.createEl('button', {
      text: 'All',
      cls: 'dmt-icon-picker-tab' + (this.iconCategory === 'all' ? ' active' : ''),
      attr: { type: 'button' }
    });
    allTab.onclick = () => {
      this.iconCategory = 'all';
      this.renderIconTabs(tabsContainer);
      this.renderIconGrid();
    };
    
    // Category tabs
    const categories = RPGAwesomeHelpers.getCategories();
    for (const cat of categories) {
      const tab = tabsContainer.createEl('button', {
        text: cat.label,
        cls: 'dmt-icon-picker-tab' + (this.iconCategory === cat.id ? ' active' : ''),
        attr: { type: 'button', 'data-category': cat.id }
      });
      tab.onclick = () => {
        this.iconCategory = cat.id;
        this.renderIconTabs(tabsContainer);
        this.renderIconGrid();
      };
    }
    this.tabsContainer = tabsContainer;
    
    // Icon grid
    this.iconGridContainer = picker.createDiv({ cls: 'dmt-icon-picker-grid' });
    this.renderIconGrid();
    
    // Selected icon preview
    this.iconPreviewContainer = picker.createDiv({ cls: 'dmt-icon-preview-row' });
    this.updateIconPreview();
  }
  
  renderIconTabs(container) {
    // Update active state on all tabs
    const tabs = container.querySelectorAll('.dmt-icon-picker-tab');
    tabs.forEach(tab => {
      const catId = tab.getAttribute('data-category') || 'all';
      if (catId === this.iconCategory) {
        tab.addClass('active');
      } else {
        tab.removeClass('active');
      }
    });
  }
  
  renderIconGrid() {
    const container = this.iconGridContainer;
    if (!container) return;
    container.empty();
    
    // Get icons based on search or category
    let icons;
    if (this.iconSearchQuery.trim()) {
      icons = RPGAwesomeHelpers.search(this.iconSearchQuery);
    } else {
      icons = RPGAwesomeHelpers.getByCategory(this.iconCategory);
    }
    
    if (icons.length === 0) {
      container.createDiv({ cls: 'dmt-icon-picker-empty', text: 'No icons found' });
      return;
    }
    
    // Render icon buttons
    for (const icon of icons) {
      const iconBtn = container.createEl('button', {
        cls: 'dmt-icon-picker-icon' + (this.iconClass === icon.iconClass ? ' selected' : ''),
        attr: { 
          type: 'button',
          title: icon.label
        }
      });
      
      // Create the icon span with the character
      const iconSpan = iconBtn.createEl('span', { cls: 'ra' });
      iconSpan.textContent = icon.char;
      
      iconBtn.onclick = () => {
        this.iconClass = icon.iconClass;
        // Update selection state
        container.querySelectorAll('.dmt-icon-picker-icon').forEach(btn => btn.removeClass('selected'));
        iconBtn.addClass('selected');
        this.updateIconPreview();
      };
    }
  }
  
  updateSymbolPreview() {
    if (this.symbolPreviewEl) {
      this.symbolPreviewEl.textContent = this.symbol || '?';
    }
  }
  
  updateIconPreview() {
    const container = this.iconPreviewContainer;
    if (!container) return;
    container.empty();
    
    if (!this.iconClass) {
      container.createDiv({ cls: 'dmt-icon-preview-info', text: 'Select an icon above' });
      return;
    }
    
    const iconInfo = RPGAwesomeHelpers.getInfo(this.iconClass);
    if (!iconInfo) {
      container.createDiv({ cls: 'dmt-icon-preview-info', text: 'Invalid icon selected' });
      return;
    }
    
    // Large preview
    const previewBox = container.createDiv({ cls: 'dmt-icon-preview-large' });
    const iconSpan = previewBox.createEl('span', { cls: 'ra' });
    iconSpan.textContent = iconInfo.char;
    
    // Info
    const infoBox = container.createDiv({ cls: 'dmt-icon-preview-info' });
    infoBox.createDiv({ cls: 'dmt-icon-preview-label', text: iconInfo.label });
    infoBox.createDiv({ cls: 'dmt-icon-preview-class', text: this.iconClass });
  }

  renderImagePicker() {
    const container = this.imagePickerContainer;
    container.empty();

    if (this.mode !== 'image') {
      container.style.display = 'none';
      return;
    }
    container.style.display = 'block';

    // Info text
    container.createEl('p', {
      text: 'Select an image from your vault to use as this object\'s icon.',
      cls: 'dmt-image-picker-info'
    });

    // Image search input
    const searchContainer = container.createDiv({ cls: 'dmt-image-picker-search' });
    const searchInput = searchContainer.createEl('input', {
      type: 'text',
      value: this.imageSearchQuery,
      attr: { placeholder: 'Search for image...' }
    });

    // Clear button
    if (this.imagePath) {
      const clearBtn = searchContainer.createEl('button', {
        text: 'x',
        cls: 'dmt-image-clear-btn',
        attr: { type: 'button', title: 'Clear image' }
      });
      clearBtn.onclick = () => {
        this.imagePath = '';
        this.imageSearchQuery = '';
        this.imageSearchResults = [];
        this.renderImagePicker();
      };
    }

    searchInput.addEventListener('input', async (e) => {
      this.imageSearchQuery = e.target.value;
      await this.searchImages(this.imageSearchQuery);
    });

    // Search results dropdown
    this.imageResultsContainer = container.createDiv({ cls: 'dmt-image-search-results' });
    this.renderImageSearchResults();

    // Preview
    if (this.imagePath) {
      const previewContainer = container.createDiv({ cls: 'dmt-image-preview' });
      previewContainer.createEl('p', {
        text: 'Selected: ' + this.getImageDisplayName(this.imagePath),
        cls: 'dmt-image-preview-label'
      });
      // Try to show the image preview
      const imgPreview = previewContainer.createEl('img', {
        cls: 'dmt-image-preview-img',
        attr: { src: this.app.vault.adapter.getResourcePath(this.imagePath) }
      });
      imgPreview.style.maxWidth = '100px';
      imgPreview.style.maxHeight = '100px';
    }
  }

  async searchImages(query) {
    if (!query || query.trim().length < 2) {
      this.imageSearchResults = [];
      this.renderImageSearchResults();
      return;
    }

    const lowerQuery = query.toLowerCase();
    const files = this.app.vault.getFiles();
    const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];

    const matches = files
      .filter(file => {
        const ext = file.extension?.toLowerCase();
        if (!imageExtensions.includes(ext)) return false;
        return file.path.toLowerCase().includes(lowerQuery) ||
               file.basename.toLowerCase().includes(lowerQuery);
      })
      .slice(0, 10);

    this.imageSearchResults = matches.map(f => f.path);
    this.renderImageSearchResults();
  }

  renderImageSearchResults() {
    const container = this.imageResultsContainer;
    if (!container) return;
    container.empty();

    if (this.imageSearchResults.length === 0) return;

    for (const path of this.imageSearchResults) {
      const item = container.createDiv({ cls: 'dmt-image-search-result' });
      item.textContent = this.getImageDisplayName(path);
      item.onclick = () => {
        this.imagePath = path;
        this.imageSearchQuery = this.getImageDisplayName(path);
        this.imageSearchResults = [];
        this.renderImagePicker();
      };
    }
  }

  getImageDisplayName(path) {
    if (!path) return '';
    const parts = path.split('/');
    return parts[parts.length - 1];
  }

  save() {
    // Validate based on mode
    if (this.mode === 'icon') {
      if (!this.iconClass || !RPGAwesomeHelpers.isValid(this.iconClass)) {
        new Notice('Please select a valid icon');
        return;
      }
    } else if (this.mode === 'image') {
      if (!this.imagePath || this.imagePath.trim().length === 0) {
        new Notice('Please select an image');
        return;
      }
    } else {
      // symbol mode
      if (!this.symbol || this.symbol.length === 0 || this.symbol.length > 8) {
        new Notice('Please enter a valid symbol (1-8 characters)');
        return;
      }
    }

    if (!this.label || this.label.trim().length === 0) {
      this.labelSetting.setDesc('Please enter a label');
      this.labelSetting.descEl.addClass('mod-warning');
      this.labelInputEl?.focus();
      return;
    }
    
    // Get the correct settings keys for this map type
    const overridesKey = this.mapType === 'hex' ? 'hexObjectOverrides' : 'gridObjectOverrides';
    const customObjectsKey = this.mapType === 'hex' ? 'customHexObjects' : 'customGridObjects';
    
    if (this.existingObject?.isBuiltIn) {
      // Modifying a built-in: save as override
      if (!this.plugin.settings[overridesKey]) {
        this.plugin.settings[overridesKey] = {};
      }
      
      const original = BUILT_IN_OBJECTS.find(o => o.id === this.existingObject.id);
      const override = {};

      // Handle symbol/iconClass/imagePath based on mode
      if (this.mode === 'icon') {
        if (this.iconClass !== original.iconClass) override.iconClass = this.iconClass;
        // Clear other visual properties
        if (original.symbol) override.symbol = null;
        if (original.imagePath) override.imagePath = null;
      } else if (this.mode === 'image') {
        override.imagePath = this.imagePath;
        // Clear other visual properties
        if (original.symbol) override.symbol = null;
        if (original.iconClass) override.iconClass = null;
      } else {
        if (this.symbol !== original.symbol) override.symbol = this.symbol;
        // Clear other visual properties
        if (original.iconClass) override.iconClass = null;
        if (original.imagePath) override.imagePath = null;
      }
      
      if (this.label !== original.label) override.label = this.label;
      if (this.category !== original.category) override.category = this.category;
      
      // Preserve hidden state if it exists
      if (this.plugin.settings[overridesKey][this.existingObject.id]?.hidden) {
        override.hidden = true;
      }
      
      // Preserve order if it exists
      if (this.plugin.settings[overridesKey][this.existingObject.id]?.order !== undefined) {
        override.order = this.plugin.settings[overridesKey][this.existingObject.id].order;
      }
      
      if (Object.keys(override).length > 0) {
        this.plugin.settings[overridesKey][this.existingObject.id] = override;
      } else {
        delete this.plugin.settings[overridesKey][this.existingObject.id];
      }
    } else if (this.existingObject?.isCustom) {
      // Editing existing custom object
      if (!this.plugin.settings[customObjectsKey]) {
        this.plugin.settings[customObjectsKey] = [];
      }
      const idx = this.plugin.settings[customObjectsKey].findIndex(o => o.id === this.existingObject.id);
      if (idx !== -1) {
        const updated = {
          ...this.plugin.settings[customObjectsKey][idx],
          label: this.label.trim(),
          category: this.category
        };

        // Set visual property based on mode, clearing others
        delete updated.symbol;
        delete updated.iconClass;
        delete updated.imagePath;

        if (this.mode === 'icon') {
          updated.iconClass = this.iconClass;
        } else if (this.mode === 'image') {
          updated.imagePath = this.imagePath;
        } else {
          updated.symbol = this.symbol;
        }

        this.plugin.settings[customObjectsKey][idx] = updated;
      }
    } else {
      // Creating new custom object
      if (!this.plugin.settings[customObjectsKey]) {
        this.plugin.settings[customObjectsKey] = [];
      }
      
      const newObject = {
        id: 'custom-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        label: this.label.trim(),
        category: this.category
      };

      // Set visual property based on mode
      if (this.mode === 'icon') {
        newObject.iconClass = this.iconClass;
      } else if (this.mode === 'image') {
        newObject.imagePath = this.imagePath;
      } else {
        newObject.symbol = this.symbol;
      }

      this.plugin.settings[customObjectsKey].push(newObject);
    }
    
    this.onSave();
    this.close();
  }
  
  onClose() {
    this.contentEl.empty();
  }
}


// settingsPlugin-CategoryEditModal.js
// Modal for editing category properties
// This file is concatenated into the settings plugin template by the assembler

/**
 * Modal for editing category properties
 */
class CategoryEditModal extends Modal {
  constructor(app, plugin, existingCategory, onSave, mapType = 'grid') {
    super(app);
    this.plugin = plugin;
    this.existingCategory = existingCategory;
    this.onSave = onSave;
    this.mapType = mapType;
    
    this.label = existingCategory?.label || '';
    this.order = existingCategory?.order ?? 100;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-category-edit-modal');
    
    const isEditing = !!this.existingCategory;
    
    contentEl.createEl('h2', { text: isEditing ? 'Edit Category' : 'Create Custom Category' });
    
    let nameInputEl = null;
    new Setting(contentEl)
      .setName('Name')
      .setDesc('Display name for this category')
      .addText(text => {
        nameInputEl = text.inputEl;
        text.setValue(this.label)
          .setPlaceholder('e.g., Alchemy')
          .onChange(value => {
            this.label = value;
          });
      });
    
    // Focus the name input after a short delay
    if (nameInputEl) {
      setTimeout(() => nameInputEl.focus(), 50);
    }
    
    new Setting(contentEl)
      .setName('Sort Order')
      .setDesc('Lower numbers appear first (built-ins use 0-50)')
      .addText(text => text
        .setValue(String(this.order))
        .setPlaceholder('100')
        .onChange(value => {
          const num = parseInt(value, 10);
          if (!isNaN(num)) {
            this.order = num;
          }
        }));
    
    const buttonContainer = contentEl.createDiv({ cls: 'dmt-modal-buttons' });
    
    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();
    
    const saveBtn = buttonContainer.createEl('button', { text: 'Save', cls: 'mod-cta' });
    saveBtn.onclick = () => this.save();
  }
  
  save() {
    if (!this.label || this.label.trim().length === 0) {
      new Notice('Please enter a category name');
      return;
    }
    
    // Get the correct settings key for this map type
    const categoriesKey = this.mapType === 'hex' ? 'customHexCategories' : 'customGridCategories';
    
    if (!this.plugin.settings[categoriesKey]) {
      this.plugin.settings[categoriesKey] = [];
    }
    
    if (this.existingCategory) {
      const idx = this.plugin.settings[categoriesKey].findIndex(c => c.id === this.existingCategory.id);
      if (idx !== -1) {
        this.plugin.settings[categoriesKey][idx] = {
          ...this.plugin.settings[categoriesKey][idx],
          label: this.label.trim(),
          order: this.order
        };
      }
    } else {
      const newCategory = {
        id: 'custom-cat-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        label: this.label.trim(),
        order: this.order
      };
      
      this.plugin.settings[categoriesKey].push(newCategory);
    }
    
    this.onSave();
    this.close();
  }
  
  onClose() {
    this.contentEl.empty();
  }
}


// settingsPlugin-ColorEditModal.js
// Modal for editing color palette entries
// This file is concatenated into the settings plugin template by the assembler

/**
 * Modal for editing color palette entries
 */
class ColorEditModal extends Modal {
  constructor(app, plugin, existingColor, onSave) {
    super(app);
    this.plugin = plugin;
    this.existingColor = existingColor;
    this.onSave = onSave;
    this.isBuiltIn = existingColor?.isBuiltIn || false;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-color-edit-modal');
    
    const isEdit = !!this.existingColor;
    const isBuiltIn = this.isBuiltIn;
    
    contentEl.createEl('h2', { 
      text: isEdit 
        ? (isBuiltIn ? `Edit: ${this.existingColor.label}` : 'Edit Custom Color')
        : 'Add Custom Color' 
    });
    
    // Get original built-in values if editing a built-in
    const originalBuiltIn = isBuiltIn 
      ? BUILT_IN_COLORS.find(c => c.id === this.existingColor.id)
      : null;
    
    // Initialize form values
    let colorValue = this.existingColor?.color || '#808080';
    let labelValue = this.existingColor?.label || '';
    let opacityValue = this.existingColor?.opacity ?? 1;
    
    // Color picker
    new Setting(contentEl)
      .setName('Color')
      .setDesc('Choose the color value')
      .addColorPicker(picker => picker
        .setValue(colorValue)
        .onChange(value => {
          colorValue = value;
          hexInput.value = value;
        }))
      .addText(text => {
        text.inputEl.addClass('dmt-color-hex-input');
        text.setPlaceholder('#RRGGBB')
          .setValue(colorValue)
          .onChange(value => {
            if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
              colorValue = value;
            }
          });
        // Store reference for color picker sync
        var hexInput = text.inputEl;
      });
    
    // Label input
    new Setting(contentEl)
      .setName('Label')
      .setDesc('Display name for this color')
      .addText(text => text
        .setPlaceholder('e.g., Ocean Blue')
        .setValue(labelValue)
        .onChange(value => {
          labelValue = value;
        }));
    
    // Opacity slider
    const opacitySetting = new Setting(contentEl)
      .setName('Opacity')
      .setDesc('Default opacity when selecting this color');
    
    const opacityContainer = opacitySetting.controlEl.createEl('div', { cls: 'dmt-opacity-control' });
    const opacitySlider = opacityContainer.createEl('input', {
      type: 'range',
      attr: { min: '10', max: '100', value: String(Math.round(opacityValue * 100)) }
    });
    const opacityDisplay = opacityContainer.createEl('span', { 
      text: `${Math.round(opacityValue * 100)}%`,
      cls: 'dmt-opacity-value'
    });
    
    opacitySlider.addEventListener('input', (e) => {
      opacityValue = parseInt(e.target.value, 10) / 100;
      opacityDisplay.textContent = `${Math.round(opacityValue * 100)}%`;
    });
    
    // Show original values for built-ins
    if (isBuiltIn && originalBuiltIn) {
      const origInfo = contentEl.createEl('div', { cls: 'dmt-color-original-info' });
      origInfo.createEl('span', { text: 'Original: ' });
      const origSwatch = origInfo.createEl('span', { 
        cls: 'dmt-color-mini-swatch',
        attr: { style: `background-color: ${originalBuiltIn.color}` }
      });
      origInfo.createEl('span', { text: ` ${originalBuiltIn.label} (${originalBuiltIn.color})` });
    }
    
    // Action buttons
    const btnContainer = contentEl.createEl('div', { cls: 'dmt-modal-buttons' });
    
    const saveBtn = btnContainer.createEl('button', { 
      text: 'Save', 
      cls: 'mod-cta' 
    });
    saveBtn.addEventListener('click', async () => {
      // Validate
      if (!labelValue.trim()) {
        new Notice('Please enter a label for this color.');
        return;
      }
      if (!/^#[0-9A-Fa-f]{6}$/.test(colorValue)) {
        new Notice('Please enter a valid hex color (e.g., #4A9EFF)');
        return;
      }
      
      if (isBuiltIn) {
        // Save as override
        if (!this.plugin.settings.colorPaletteOverrides) {
          this.plugin.settings.colorPaletteOverrides = {};
        }
        const existingOverride = this.plugin.settings.colorPaletteOverrides[this.existingColor.id] || {};
        this.plugin.settings.colorPaletteOverrides[this.existingColor.id] = {
          ...existingOverride,
          color: colorValue,
          label: labelValue,
          opacity: opacityValue
        };
      } else if (isEdit) {
        // Update existing custom color
        const idx = this.plugin.settings.customPaletteColors.findIndex(c => c.id === this.existingColor.id);
        if (idx !== -1) {
          this.plugin.settings.customPaletteColors[idx] = {
            ...this.plugin.settings.customPaletteColors[idx],
            color: colorValue,
            label: labelValue,
            opacity: opacityValue
          };
        }
      } else {
        // Add new custom color
        if (!this.plugin.settings.customPaletteColors) {
          this.plugin.settings.customPaletteColors = [];
        }
        this.plugin.settings.customPaletteColors.push({
          id: 'custom-' + Date.now(),
          color: colorValue,
          label: labelValue,
          opacity: opacityValue
        });
      }
      
      this.onSave();
      this.close();
    });
    
    const cancelBtn = btnContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());
  }
  
  onClose() {
    this.contentEl.empty();
  }
}


// settingsPlugin-ExportModal.js
// Modal for exporting object customizations
// This file is concatenated into the settings plugin template by the assembler

/**
 * Modal for exporting object customizations
 */
class ExportModal extends Modal {
  constructor(app, plugin, mapType = 'grid') {
    super(app);
    this.plugin = plugin;
    this.mapType = mapType;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-export-modal');
    
    const mapTypeLabel = this.mapType === 'hex' ? 'Hex' : 'Grid';
    contentEl.createEl('h2', { text: `Export ${mapTypeLabel} Object Customizations` });
    
    // Get the correct settings keys for this map type
    const overridesKey = this.mapType === 'hex' ? 'hexObjectOverrides' : 'gridObjectOverrides';
    const customObjectsKey = this.mapType === 'hex' ? 'customHexObjects' : 'customGridObjects';
    const categoriesKey = this.mapType === 'hex' ? 'customHexCategories' : 'customGridCategories';
    
    const objectOverrides = this.plugin.settings[overridesKey] || {};
    const customObjects = this.plugin.settings[customObjectsKey] || [];
    const customCategories = this.plugin.settings[categoriesKey] || [];
    
    const hasOverrides = Object.keys(objectOverrides).length > 0;
    const hasCustom = customObjects.length > 0 || customCategories.length > 0;
    
    // Selection checkboxes
    let exportOverrides = hasOverrides;
    let exportCustom = hasCustom;
    
    // Explain what will be exported
    if (hasOverrides || hasCustom) {
      contentEl.createEl('p', { 
        text: 'Select what to include in the export file:',
        cls: 'setting-item-description'
      });
    }
    
    if (hasOverrides) {
      new Setting(contentEl)
        .setName(`Built-in modifications (${Object.keys(objectOverrides).length})`)
        .setDesc('Changes to symbol, label, or order of built-in objects')
        .addToggle(toggle => toggle
          .setValue(exportOverrides)
          .onChange(v => { exportOverrides = v; }));
    }
    
    if (hasCustom) {
      const customCount = customObjects.length + customCategories.length;
      new Setting(contentEl)
        .setName(`Custom objects & categories (${customCount})`)
        .setDesc(`${customObjects.length} object(s), ${customCategories.length} category(ies)`)
        .addToggle(toggle => toggle
          .setValue(exportCustom)
          .onChange(v => { exportCustom = v; }));
    }
    
    if (!hasOverrides && !hasCustom) {
      contentEl.createEl('p', { 
        text: `No customizations to export for ${mapTypeLabel} maps. Modify built-in objects or create custom ones first.`,
        cls: 'dmt-export-empty'
      });
      return;
    }
    
    // Filename input
    const defaultFilename = `windrose-${this.mapType}-objects-${new Date().toISOString().split('T')[0]}.json`;
    let filename = defaultFilename;
    
    new Setting(contentEl)
      .setName('Filename')
      .setDesc('Will be saved to your vault root')
      .addText(text => text
        .setValue(filename)
        .onChange(v => { filename = v; }));
    
    // Export button
    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText('Export to Vault')
        .setCta()
        .onClick(async () => {
          const exportData = {
            windroseMD_objectExport: true,
            exportedAt: new Date().toISOString(),
            version: '1.0',
            mapType: this.mapType
          };
          
          if (exportOverrides && hasOverrides) {
            exportData.objectOverrides = objectOverrides;
          }
          if (exportCustom && hasCustom) {
            if (customObjects.length > 0) exportData.customObjects = customObjects;
            if (customCategories.length > 0) exportData.customCategories = customCategories;
          }
          
          // Save to vault
          const json = JSON.stringify(exportData, null, 2);
          const finalFilename = filename.endsWith('.json') ? filename : filename + '.json';
          
          try {
            // Check if file exists
            const existingFile = this.app.vault.getAbstractFileByPath(finalFilename);
            if (existingFile) {
              if (!await new ConfirmModal(this.app, {
                message: `File "${finalFilename}" already exists. Overwrite?`,
                confirmText: 'Overwrite',
                isDestructive: true
              }).openAndGetValue()) {
                return;
              }
              await this.app.vault.modify(existingFile, json);
            } else {
              await this.app.vault.create(finalFilename, json);
            }
            
            new Notice(`Exported to: ${finalFilename}`);
            this.close();
          } catch (err) {
            new Notice(`Export failed: ${err.message}`);
          }
        }));
  }
  
  onClose() {
    this.contentEl.empty();
  }
}


// settingsPlugin-ImportModal.js
// Modal for importing object customizations
// This file is concatenated into the settings plugin template by the assembler

/**
 * Modal for importing object customizations
 */
class ImportModal extends Modal {
  constructor(app, plugin, onImport, mapType = 'grid') {
    super(app);
    this.plugin = plugin;
    this.onImport = onImport;
    this.mapType = mapType;
    this.importData = null;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-import-modal');
    
    const mapTypeLabel = this.mapType === 'hex' ? 'Hex' : 'Grid';
    contentEl.createEl('h2', { text: `Import ${mapTypeLabel} Object Customizations` });
    
    contentEl.createEl('p', { 
      text: `Select a Windrose MD object export file (.json) to import into ${mapTypeLabel} maps.`,
      cls: 'setting-item-description'
    });
    
    // File picker
    const fileContainer = contentEl.createDiv({ cls: 'dmt-import-file-container' });
    const fileInput = fileContainer.createEl('input', {
      type: 'file',
      attr: { accept: '.json' }
    });
    
    // Preview area (hidden until file selected)
    const previewArea = contentEl.createDiv({ cls: 'dmt-import-preview' });
    previewArea.style.display = 'none';
    
    // Import options (hidden until file validated)
    const optionsArea = contentEl.createDiv({ cls: 'dmt-import-options' });
    optionsArea.style.display = 'none';
    
    let mergeMode = 'merge'; // 'merge' or 'replace'
    
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        // Validate it's a Windrose export
        if (!data.windroseMD_objectExport) {
          previewArea.empty();
          previewArea.createEl('p', { 
            text: 'This file is not a valid Windrose MD object export.',
            cls: 'dmt-import-error'
          });
          previewArea.style.display = 'block';
          optionsArea.style.display = 'none';
          this.importData = null;
          return;
        }
        
        this.importData = data;
        
        // Show preview
        previewArea.empty();
        previewArea.createEl('p', { text: 'Valid Windrose MD export file' });
        if (data.exportedAt) {
          previewArea.createEl('p', { 
            text: `Exported: ${new Date(data.exportedAt).toLocaleString()}`,
            cls: 'dmt-import-date'
          });
        }
        
        // Show original map type if present
        if (data.mapType) {
          const sourceType = data.mapType === 'hex' ? 'Hex' : 'Grid';
          if (data.mapType !== this.mapType) {
            previewArea.createEl('p', { 
              text: `Note: This was exported from ${sourceType} maps but will be imported to ${mapTypeLabel} maps.`,
              cls: 'dmt-import-note'
            });
          }
        }
        
        const overrideCount = data.objectOverrides ? Object.keys(data.objectOverrides).length : 0;
        const customObjCount = data.customObjects?.length || 0;
        const customCatCount = data.customCategories?.length || 0;
        
        if (overrideCount > 0) {
          previewArea.createEl('p', { text: `Ã¢â‚¬Â¢ ${overrideCount} built-in modification(s)` });
        }
        if (customObjCount > 0) {
          previewArea.createEl('p', { text: `Ã¢â‚¬Â¢ ${customObjCount} custom object(s)` });
        }
        if (customCatCount > 0) {
          previewArea.createEl('p', { text: `Ã¢â‚¬Â¢ ${customCatCount} custom category(ies)` });
        }
        
        previewArea.style.display = 'block';
        
        // Show import options
        optionsArea.empty();
        new Setting(optionsArea)
          .setName('Import Mode')
          .setDesc('How to handle existing customizations')
          .addDropdown(dropdown => dropdown
            .addOption('merge', 'Merge (keep existing, add new)')
            .addOption('replace', 'Replace (remove existing first)')
            .setValue(mergeMode)
            .onChange(v => { mergeMode = v; }));
        
        optionsArea.style.display = 'block';
        
      } catch (err) {
        previewArea.empty();
        previewArea.createEl('p', { 
          text: `Error reading file: ${err.message}`,
          cls: 'dmt-import-error'
        });
        previewArea.style.display = 'block';
        optionsArea.style.display = 'none';
        this.importData = null;
      }
    });
    
    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: 'dmt-modal-buttons' });
    
    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();
    
    const importBtn = buttonContainer.createEl('button', { text: 'Import', cls: 'mod-cta' });
    importBtn.onclick = async () => {
      if (!this.importData) {
        new Notice('Please select a valid export file first.');
        return;
      }
      
      // Get the correct settings keys for this map type
      const overridesKey = this.mapType === 'hex' ? 'hexObjectOverrides' : 'gridObjectOverrides';
      const customObjectsKey = this.mapType === 'hex' ? 'customHexObjects' : 'customGridObjects';
      const categoriesKey = this.mapType === 'hex' ? 'customHexCategories' : 'customGridCategories';
      
      const data = this.importData;
      
      if (mergeMode === 'replace') {
        // Clear existing for this map type
        this.plugin.settings[overridesKey] = {};
        this.plugin.settings[customObjectsKey] = [];
        this.plugin.settings[categoriesKey] = [];
      }
      
      // Import overrides
      if (data.objectOverrides) {
        if (!this.plugin.settings[overridesKey]) {
          this.plugin.settings[overridesKey] = {};
        }
        Object.assign(this.plugin.settings[overridesKey], data.objectOverrides);
      }
      
      // Import custom objects (avoid duplicates by ID)
      if (data.customObjects) {
        if (!this.plugin.settings[customObjectsKey]) {
          this.plugin.settings[customObjectsKey] = [];
        }
        for (const obj of data.customObjects) {
          const existingIdx = this.plugin.settings[customObjectsKey].findIndex(o => o.id === obj.id);
          if (existingIdx !== -1) {
            this.plugin.settings[customObjectsKey][existingIdx] = obj;
          } else {
            this.plugin.settings[customObjectsKey].push(obj);
          }
        }
      }
      
      // Import custom categories (avoid duplicates by ID)
      if (data.customCategories) {
        if (!this.plugin.settings[categoriesKey]) {
          this.plugin.settings[categoriesKey] = [];
        }
        for (const cat of data.customCategories) {
          const existingIdx = this.plugin.settings[categoriesKey].findIndex(c => c.id === cat.id);
          if (existingIdx !== -1) {
            this.plugin.settings[categoriesKey][existingIdx] = cat;
          } else {
            this.plugin.settings[categoriesKey].push(cat);
          }
        }
      }
      
      await this.plugin.saveSettings();
      this.onImport();
      this.close();
    };
  }
  
  onClose() {
    this.contentEl.empty();
  }
}


// settingsPlugin-ObjectSetRenameModal.js
// Simple rename prompt modal for object sets
// This file is concatenated into the settings plugin template by the assembler

class ObjectSetRenameModal extends Modal {
  constructor(app, currentName, onSave) {
    super(app);
    this.currentName = currentName;
    this.onSave = onSave;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Rename Object Set' });

    let newName = this.currentName;
    new Setting(contentEl)
      .setName('Set Name')
      .addText(text => {
        text.setValue(this.currentName);
        text.onChange(v => { newName = v; });
        // Auto-focus and select all
        setTimeout(() => {
          text.inputEl.focus();
          text.inputEl.select();
        }, 50);
      });

    const buttons = contentEl.createDiv({ cls: 'dmt-modal-buttons' });

    const cancelBtn = buttons.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();

    const saveBtn = buttons.createEl('button', { text: 'Save', cls: 'mod-cta' });
    saveBtn.onclick = () => {
      const trimmed = newName.trim();
      if (!trimmed) {
        new Notice('Name cannot be empty');
        return;
      }
      this.onSave(trimmed);
      this.close();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}

// settingsPlugin-ObjectSetExportModal.js
// Modal for exporting an object set to a vault folder
// This file is concatenated into the settings plugin template by the assembler

class ObjectSetExportModal extends Modal {
  constructor(app, plugin, set) {
    super(app);
    this.plugin = plugin;
    this.set = set;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-export-modal');

    contentEl.createEl('h2', { text: 'Export Object Set' });

    const set = this.set;
    let exportName = set.name;
    let includeHex = !!set.data.hex;
    let includeGrid = !!set.data.grid;

    new Setting(contentEl)
      .setName('Set Name')
      .setDesc('Name used for the export folder')
      .addText(text => text
        .setValue(exportName)
        .onChange(v => { exportName = v; }));

    if (set.data.hex) {
      new Setting(contentEl)
        .setName('Include hex objects')
        .addToggle(toggle => toggle
          .setValue(includeHex)
          .onChange(v => { includeHex = v; }));
    }

    if (set.data.grid) {
      new Setting(contentEl)
        .setName('Include grid objects')
        .addToggle(toggle => toggle
          .setValue(includeGrid)
          .onChange(v => { includeGrid = v; }));
    }

    const imagePaths = ObjectSetHelpers.getImagePaths(set.data);
    if (imagePaths.length > 0) {
      contentEl.createEl('p', {
        text: imagePaths.length + ' image(s) will be bundled into the export.',
        cls: 'setting-item-description'
      });
    }

    // Destination info
    const destFolder = this.plugin.settings.objectSetsAutoLoadFolder || '';
    const destDesc = destFolder
      ? 'Will export to: ' + destFolder + '/' + (exportName || set.name).replace(/[\\\\/:*?"<>|]/g, '_')
      : 'Will export to: object-sets/' + (exportName || set.name).replace(/[\\\\/:*?"<>|]/g, '_');

    contentEl.createEl('p', {
      text: destDesc,
      cls: 'setting-item-description'
    });

    const buttons = contentEl.createDiv({ cls: 'dmt-modal-buttons' });

    const cancelBtn = buttons.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();

    const exportBtn = buttons.createEl('button', { text: 'Export', cls: 'mod-cta' });
    exportBtn.onclick = async () => {
      if (!includeHex && !includeGrid) {
        new Notice('Select at least one map type to export');
        return;
      }

      try {
        const destPath = await ObjectSetHelpers.exportSetToFolder(
          this.plugin, set.id, destFolder || null,
          { name: exportName, includeHex, includeGrid }
        );
        new Notice('Exported to: ' + destPath);
        this.close();
      } catch (err) {
        new Notice('Export failed: ' + err.message);
      }
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}

// settingsPlugin-ObjectSetImportModal.js
// Modal for importing an object set from a vault folder
// This file is concatenated into the settings plugin template by the assembler

class ObjectSetImportModal extends Modal {
  constructor(app, plugin, onImport) {
    super(app);
    this.plugin = plugin;
    this.onImport = onImport;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-import-modal');

    contentEl.createEl('h2', { text: 'Import Object Set from Folder' });

    contentEl.createEl('p', {
      text: 'Enter the vault path to a folder containing objects.json.',
      cls: 'setting-item-description'
    });

    let folderPath = '';
    const previewArea = contentEl.createDiv({ cls: 'dmt-import-preview' });
    previewArea.style.display = 'none';

    new Setting(contentEl)
      .setName('Folder Path')
      .setDesc('Vault-relative path (e.g. object-sets/my-set)')
      .addSearch(search => {
        new FolderSuggest(this.app, search.inputEl);
        search
          .setPlaceholder('path/to/set-folder')
          .onChange(v => { folderPath = v.trim(); });
      })
      .addButton(btn => btn
        .setButtonText('Preview')
        .onClick(async () => {
          previewArea.empty();

          if (!folderPath) {
            previewArea.createEl('p', { text: 'Enter a folder path first.', cls: 'dmt-import-error' });
            previewArea.style.display = 'block';
            return;
          }

          const folder = this.app.vault.getAbstractFileByPath(folderPath);
          if (!folder || !folder.children) {
            previewArea.createEl('p', { text: 'Folder not found: ' + folderPath, cls: 'dmt-import-error' });
            previewArea.style.display = 'block';
            return;
          }

          const jsonFile = this.app.vault.getAbstractFileByPath(folderPath + '/objects.json');
          if (!jsonFile) {
            previewArea.createEl('p', { text: 'No objects.json found in this folder.', cls: 'dmt-import-error' });
            previewArea.style.display = 'block';
            return;
          }

          try {
            const content = await this.app.vault.read(jsonFile);
            const data = JSON.parse(content);

            if (!data.windroseMD_objectSet) {
              previewArea.createEl('p', { text: 'Not a valid Windrose object set.', cls: 'dmt-import-error' });
              previewArea.style.display = 'block';
              return;
            }

            previewArea.createEl('p', { text: 'Valid object set: ' + (data.name || 'Unnamed') });

            const scope = [];
            if (data.hex) {
              const objCount = (data.hex.customObjects || []).length;
              const overCount = Object.keys(data.hex.objectOverrides || {}).length;
              scope.push('Hex: ' + objCount + ' custom, ' + overCount + ' overrides');
            }
            if (data.grid) {
              const objCount = (data.grid.customObjects || []).length;
              const overCount = Object.keys(data.grid.objectOverrides || {}).length;
              scope.push('Grid: ' + objCount + ' custom, ' + overCount + ' overrides');
            }
            for (const line of scope) {
              previewArea.createEl('p', { text: line, cls: 'setting-item-description' });
            }

            // Check for duplicate name
            const existing = (this.plugin.settings.objectSets || []).find(s => s.name === data.name);
            if (existing) {
              previewArea.createEl('p', {
                text: 'A set named "' + data.name + '" already exists. It will be imported with a unique name.',
                cls: 'dmt-import-note'
              });
            }

            previewArea.style.display = 'block';
          } catch (err) {
            previewArea.createEl('p', { text: 'Error reading: ' + err.message, cls: 'dmt-import-error' });
            previewArea.style.display = 'block';
          }
        }));

    const buttons = contentEl.createDiv({ cls: 'dmt-modal-buttons' });

    const cancelBtn = buttons.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();

    const importBtn = buttons.createEl('button', { text: 'Import', cls: 'mod-cta' });
    importBtn.onclick = async () => {
      if (!folderPath) {
        new Notice('Enter a folder path first');
        return;
      }

      try {
        const set = await ObjectSetHelpers.importSetFromFolder(this.plugin, folderPath);
        await this.plugin.saveSettings();
        new Notice('Imported set: ' + set.name);
        this.onImport();
        this.close();
      } catch (err) {
        new Notice('Import failed: ' + err.message);
      }
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}

// settingsPlugin-ConfirmModal.js
// Generic confirmation modal replacing native confirm() dialogs
// This file is concatenated into the settings plugin template by the assembler

class ConfirmModal extends Modal {
  constructor(app, options = {}) {
    super(app);
    this.message = options.message || 'Are you sure?';
    this.confirmText = options.confirmText || 'Confirm';
    this.cancelText = options.cancelText || 'Cancel';
    this.isDestructive = options.isDestructive || false;
    this.resolved = false;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    const paragraphs = this.message.split('\n').filter(s => s.trim());
    for (const p of paragraphs) {
      contentEl.createEl('p', { text: p });
    }

    const buttons = contentEl.createDiv({ cls: 'dmt-modal-buttons' });

    const cancelBtn = buttons.createEl('button', { text: this.cancelText });
    cancelBtn.onclick = () => {
      this.resolved = true;
      this.resolvePromise(false);
      this.close();
    };

    const confirmBtn = buttons.createEl('button', {
      text: this.confirmText,
      cls: this.isDestructive ? 'mod-warning' : 'mod-cta'
    });
    confirmBtn.onclick = () => {
      this.resolved = true;
      this.resolvePromise(true);
      this.close();
    };
  }

  onClose() {
    this.contentEl.empty();
    if (!this.resolved && this.resolvePromise) {
      this.resolvePromise(false);
    }
  }

  openAndGetValue() {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }
}

// settingsPlugin-PromptModal.js
// Generic text input modal replacing native prompt() dialogs
// This file is concatenated into the settings plugin template by the assembler

class PromptModal extends Modal {
  constructor(app, options = {}) {
    super(app);
    this.message = options.message || '';
    this.defaultValue = options.defaultValue || '';
    this.placeholder = options.placeholder || '';
    this.inputValue = this.defaultValue;
    this.resolved = false;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    if (this.message) {
      contentEl.createEl('p', { text: this.message });
    }

    new Setting(contentEl)
      .addText(text => {
        text.setValue(this.inputValue);
        if (this.placeholder) text.setPlaceholder(this.placeholder);
        text.onChange(v => { this.inputValue = v; });
        setTimeout(() => {
          text.inputEl.focus();
          text.inputEl.select();
        }, 50);
      });

    const buttons = contentEl.createDiv({ cls: 'dmt-modal-buttons' });

    const cancelBtn = buttons.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => {
      this.resolved = true;
      this.resolvePromise(null);
      this.close();
    };

    const saveBtn = buttons.createEl('button', { text: 'OK', cls: 'mod-cta' });
    saveBtn.onclick = () => {
      const trimmed = this.inputValue.trim();
      if (!trimmed) {
        new Notice('Name cannot be empty');
        return;
      }
      this.resolved = true;
      this.resolvePromise(trimmed);
      this.close();
    };
  }

  onClose() {
    this.contentEl.empty();
    if (!this.resolved && this.resolvePromise) {
      this.resolvePromise(null);
    }
  }

  openAndGetValue() {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }
}

class WindroseMDSettingsPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new WindroseMDSettingsTab(this.app, this));

    // Auto-load object sets from configured folder (deferred until vault is indexed)
    this.app.workspace.onLayoutReady(async () => {
      if (this.settings.objectSetsAutoLoadFolder) {
        try {
          const added = await ObjectSetHelpers.scanAutoLoadFolder(this);
          if (added > 0) await this.saveSettings();
        } catch (e) {
          
        }
      }
    });

    // Watch auto-load folder for changes (debounced re-scan)
    this._autoLoadScanTimer = null;
    const debouncedScan = () => {
      const folder = this.settings.objectSetsAutoLoadFolder;
      if (!folder) return;
      if (this._autoLoadScanTimer) clearTimeout(this._autoLoadScanTimer);
      this._autoLoadScanTimer = setTimeout(async () => {
        try {
          const added = await ObjectSetHelpers.scanAutoLoadFolder(this);
          if (added > 0) {
            await this.saveSettings();
            
          }
        } catch (e) {
          // Silently ignore - folder may have been removed
        }
      }, 2000);
    };

    const isInAutoLoadFolder = (file) => {
      const folder = this.settings.objectSetsAutoLoadFolder;
      return folder && file && file.path && file.path.startsWith(folder + '/');
    };

    this.registerEvent(this.app.vault.on('create', (file) => {
      if (isInAutoLoadFolder(file)) debouncedScan();
    }));
    this.registerEvent(this.app.vault.on('delete', (file) => {
      if (isInAutoLoadFolder(file)) debouncedScan();
    }));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      const folder = this.settings.objectSetsAutoLoadFolder;
      if (folder && ((file.path && file.path.startsWith(folder + '/')) || (oldPath && oldPath.startsWith(folder + '/')))) {
        debouncedScan();
      }
    }));
    this.registerEvent(this.app.vault.on('modify', (file) => {
      if (isInAutoLoadFolder(file) && file.path && file.path.endsWith('/objects.json')) {
        debouncedScan();
      }
    }));

    // Register command to insert a new map
    this.addCommand({
      id: 'insert-new-map',
      name: 'Insert new map',
      editorCallback: (editor, view) => {
        new InsertMapModal(this.app, (mapName, mapType) => {
          const mapId = 'map-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
          
          const codeBlock = [
            '```datacorejsx',
            '',
            'const { View: DungeonMapTracker } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md.md"), "DungeonMapTracker"));',
            '',
            `const mapId = "${mapId}";`,
            `const mapName = "${mapName}";`,
            `const mapType = "${mapType}";`,
            '',
            'return <DungeonMapTracker mapId={mapId} mapName={mapName} mapType={mapType} />;',
            '```'
          ].join('\n');
          
          editor.replaceSelection(codeBlock);
        }).open();
      }
    });
    
    // Register Obsidian protocol handler for deep links
    // Format: obsidian://windrose?notePath|mapId,x,y,zoom,layerId
    this.registerObsidianProtocolHandler('windrose', async (params) => {
      // The data comes as URL search params - we need to parse the raw query
      // params.action = 'windrose', and the rest is in the query string
      const rawQuery = Object.keys(params).find(key => key.includes('|'));
      if (!rawQuery) {
        
        return;
      }

      const pipeIndex = rawQuery.indexOf('|');
      if (pipeIndex === -1) {
        
        return;
      }

      const notePath = rawQuery.slice(0, pipeIndex);
      const coordData = rawQuery.slice(pipeIndex + 1);
      const parts = coordData.split(',');

      if (parts.length !== 5) {
        
        return;
      }

      const [mapId, x, y, zoom, layerId] = parts;

      try {
        // Remove .md extension if present for openLinkText
        const linkPath = notePath.replace(/\.md$/, '');
        await this.app.workspace.openLinkText(linkPath, '', false);

        // Small delay to let the note render before navigating
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('dmt-navigate-to', {
            detail: {
              mapId,
              x: parseFloat(x),
              y: parseFloat(y),
              zoom: parseFloat(zoom),
              layerId,
              timestamp: Date.now()
            }
          }));
        }, 100);
      } catch (err) {
        
        new Notice('Failed to open map note');
      }
    });

    // Register command to generate a random dungeon
    this.addCommand({
      id: 'insert-random-dungeon',
      name: 'Generate random dungeon',
      editorCallback: async (editor, view) => {
        new InsertDungeonModal(this.app, this, async (mapName, cells, objects, edges, options) => {
          const mapId = 'map-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
          await this.saveDungeonToJson(mapId, mapName, cells, objects, edges, options);

          // Debug mode uses source entry point instead of compiled
          const debugFile = this.app.vault.getAbstractFileByPath('WINDROSE-DEBUG.json');
          const codeBlock = debugFile
            ? [
                '```datacorejsx',
                'window.__dmtBasePath = "Projects/dungeon-map-tracker";',
                '',
                'const { DungeonMapTracker } = await dc.require(dc.resolvePath("Dungeon" + "MapTracker.tsx"));',
                '',
                `const mapId = "${mapId}";`,
                `const mapName = "${mapName}";`,
                'const mapType = "grid";',
                '',
                'return <DungeonMapTracker mapId={mapId} mapName={mapName} mapType={mapType} />;',
                '```'
              ].join('\n')
            : [
                '```datacorejsx',
                '',
                'const { View: DungeonMapTracker } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md.md"), "DungeonMapTracker"));',
                '',
                `const mapId = "${mapId}";`,
                `const mapName = "${mapName}";`,
                'const mapType = "grid";',
                '',
                'return <DungeonMapTracker mapId={mapId} mapName={mapName} mapType={mapType} />;',
                '```'
              ].join('\n');

          editor.replaceSelection(codeBlock);
        }).open();
      }
    });
  }

  onunload() {
    if (window.__windrose) {
      window.__windrose.ready = false;
      window.__windrose.obsidian = null;
      window.dispatchEvent(new CustomEvent('windrose:bridge-teardown'));
    }
  }

  /**
   * Get the path to the Windrose data file.
   * Priority: 1) WINDROSE-DEBUG.json override, 2) Auto-discover by filename, 3) Default to vault root
   * @returns {Promise<string>} The resolved data file path
   */
  async getDataFilePath() {
    // 1. Check for debug override at vault root
    const debugFile = this.app.vault.getAbstractFileByPath('WINDROSE-DEBUG.json');
    if (debugFile) {
      try {
        const content = await this.app.vault.read(debugFile);
        const config = JSON.parse(content);
        if (config.dataFilePath) {
          
          return config.dataFilePath;
        }
      } catch (e) {
        
      }
    }
    
    // 2. Auto-discover by filename
    const allFiles = this.app.vault.getFiles();
    const dataFile = allFiles.find(f => f.name === 'windrose-md-data.json');
    if (dataFile) {
      return dataFile.path;
    }
    
    // 3. Default to vault root (file will be created if needed)
    return 'windrose-md-data.json';
  }

  /**
   * Load the dungeon generator module.
   * In debug mode (WINDROSE-DEBUG.json with dungeonGeneratorPath), loads from a .js file directly.
   * Otherwise, extracts from compiled-windrose-md.md.
   * @returns {Promise<Object>} The dungeon generator module exports
   */
  async loadDungeonGenerator() {
    // 1. Check for debug override
    const debugFile = this.app.vault.getAbstractFileByPath('WINDROSE-DEBUG.json');
    if (debugFile) {
      try {
        const debugContent = await this.app.vault.read(debugFile);
        const config = JSON.parse(debugContent);
        if (config.dungeonGeneratorPath) {
          
          const generatorFile = this.app.vault.getAbstractFileByPath(config.dungeonGeneratorPath);
          if (!generatorFile) {
            throw new Error('Debug dungeonGeneratorPath not found: ' + config.dungeonGeneratorPath);
          }
          const code = await this.app.vault.read(generatorFile);
          const moduleFunc = new Function(code);
          return moduleFunc();
        }
      } catch (e) {
        
      }
    }
    
    // 2. Production: Load from compiled markdown
    const allFiles = this.app.vault.getFiles();
    const compiledFile = allFiles.find(f => f.name === 'compiled-windrose-md.md');
    
    if (!compiledFile) {
      throw new Error(
        'Could not find compiled-windrose-md.md in your vault. ' +
        'Please ensure Windrose MapDesigner is properly installed.'
      );
    }
    
    // Read the file content
    const fileContent = await this.app.vault.read(compiledFile);
    
    // Extract the dungeonGenerator code block
    // Format: # dungeonGenerator\n\n```js\n...code...\n```
    const headerPattern = /^# dungeonGenerator\s*\n+```(?:js|javascript)?\n([\s\S]*?)\n```/m;
    const match = fileContent.match(headerPattern);
    
    if (!match) {
      throw new Error(
        'Could not find dungeonGenerator section in compiled-windrose-md.md. ' +
        'The file may be corrupted or from an incompatible version.'
      );
    }
    
    const code = match[1];
    
    // Execute the code to get exports
    // The module uses "return { ... }" pattern
    try {
      const moduleFunc = new Function(code);
      return moduleFunc();
    } catch (e) {
      throw new Error('Failed to load dungeon generator: ' + e.message);
    }
  }

  /**
   * Load the object placer module for dungeon stocking.
   * In debug mode (WINDROSE-DEBUG.json with objectPlacerPath), loads from a .js file directly.
   * Otherwise, extracts from compiled-windrose-md.md.
   * @returns {Promise<Object>} The object placer module exports
   */
  async loadObjectPlacer() {
    // 1. Check for debug override
    const debugFile = this.app.vault.getAbstractFileByPath('WINDROSE-DEBUG.json');
    if (debugFile) {
      try {
        const debugContent = await this.app.vault.read(debugFile);
        const config = JSON.parse(debugContent);
        if (config.objectPlacerPath) {
          
          const placerFile = this.app.vault.getAbstractFileByPath(config.objectPlacerPath);
          if (!placerFile) {
            throw new Error('Debug objectPlacerPath not found: ' + config.objectPlacerPath);
          }
          const code = await this.app.vault.read(placerFile);
          const moduleFunc = new Function(code);
          return moduleFunc();
        }
      } catch (e) {
        
      }
    }

    // 2. Production: Load from compiled markdown
    const allFiles = this.app.vault.getFiles();
    const compiledFile = allFiles.find(f => f.name === 'compiled-windrose-md.md');

    if (!compiledFile) {
      throw new Error(
        'Could not find compiled-windrose-md.md in your vault. ' +
        'Please ensure Windrose MapDesigner is properly installed.'
      );
    }

    // Read the file content
    const fileContent = await this.app.vault.read(compiledFile);

    // Extract the objectPlacer code block
    const headerPattern = /^# objectPlacer\s*\n+```(?:js|javascript)?\n([\s\S]*?)\n```/m;
    const match = fileContent.match(headerPattern);

    if (!match) {
      throw new Error(
        'Could not find objectPlacer section in compiled-windrose-md.md. ' +
        'The file may be corrupted or from an incompatible version.'
      );
    }

    const code = match[1];

    // Execute the code to get exports
    try {
      const moduleFunc = new Function(code);
      return moduleFunc();
    } catch (e) {
      throw new Error('Failed to load object placer: ' + e.message);
    }
  }

  /**
   * Build fog of war data for auto-fog feature.
   * Fogs all cells except entry room cells.
   */
  buildFogOfWar(cells, options) {
    const autoFogEnabled = options?.configOverrides?.autoFogEnabled;
    if (!autoFogEnabled) return null;

    const stockingMeta = options?.stockingMetadata;
    if (!stockingMeta?.rooms || !cells?.length) return null;

    // Find entry room
    const entryRoomId = stockingMeta.entryRoomId;
    const entryRoom = stockingMeta.rooms.find(r => r.id === entryRoomId);

    // Build set of entry room cells to exclude from fog
    const entryRoomCells = new Set();
    if (entryRoom) {
      for (let x = entryRoom.x; x < entryRoom.x + entryRoom.width; x++) {
        for (let y = entryRoom.y; y < entryRoom.y + entryRoom.height; y++) {
          // For circular rooms, check if cell is actually in room
          if (entryRoom.shape === 'circle') {
            const centerX = entryRoom.x + entryRoom.radius;
            const centerY = entryRoom.y + entryRoom.radius;
            const dx = x + 0.5 - centerX;
            const dy = y + 0.5 - centerY;
            if (dx * dx + dy * dy <= entryRoom.radius * entryRoom.radius) {
              entryRoomCells.add(`${x},${y}`);
            }
          } else if (entryRoom.shape === 'composite') {
            // Check if cell is in any of the room's parts
            for (const part of entryRoom.parts) {
              if (x >= part.x && x < part.x + part.width &&
                  y >= part.y && y < part.y + part.height) {
                entryRoomCells.add(`${x},${y}`);
                break;
              }
            }
          } else {
            entryRoomCells.add(`${x},${y}`);
          }
        }
      }
    }

    // Fog all cells except entry room
    const foggedCells = cells
      .filter(c => !entryRoomCells.has(`${c.x},${c.y}`))
      .map(c => ({ col: c.x, row: c.y }));

    return {
      enabled: true,
      foggedCells
    };
  }

  /**
   * Save a generated dungeon directly to the JSON data file
   */
  async saveDungeonToJson(mapId, mapName, cells, objects, edges, options) {
    const SCHEMA_VERSION = 2;
    
    try {
      const dataFilePath = await this.getDataFilePath();
      let allData = { maps: {} };
      
      // Load existing data
      const file = this.app.vault.getAbstractFileByPath(dataFilePath);
      if (file) {
        const content = await this.app.vault.read(file);
        allData = JSON.parse(content);
      }
      
      if (!allData.maps) allData.maps = {};
      
      // Generate layer ID
      const layerId = 'layer-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      
      // Calculate viewport center from generated cells (in grid cell coordinates)
      let centerX = 5, centerY = 5;
      const gridSize = 32;
      if (cells.length > 0) {
        const minX = Math.min(...cells.map(c => c.x));
        const maxX = Math.max(...cells.map(c => c.x));
        const minY = Math.min(...cells.map(c => c.y));
        const maxY = Math.max(...cells.map(c => c.y));
        // Center is in grid cell coordinates, NOT pixels
        centerX = (minX + maxX) / 2;
        centerY = (minY + maxY) / 2;
      }
      
      // Create the map data structure
      const mapData = {
        name: mapName,
        description: "",
        mapType: "grid",
        northDirection: 0,
        customColors: [],
        sidebarCollapsed: false,
        expandedState: false,
        // Store generation settings for re-roll feature
        generationSettings: {
          preset: options.preset,
          configOverrides: options.configOverrides || {},
          distancePerCell: options.distancePerCell || 5,
          distanceUnit: options.distanceUnit || 'ft',
          stockingMetadata: options.stockingMetadata || null
        },
        settings: {
          useGlobalSettings: false,
          overrides: {
            distancePerCellGrid: options.distancePerCell || 5,
            distanceUnitGrid: options.distanceUnit || 'ft'
          }
        },
        uiPreferences: {
          rememberPanZoom: true,
          rememberSidebarState: true,
          rememberExpandedState: false
        },
        lastTextLabelSettings: null,
        schemaVersion: SCHEMA_VERSION,
        activeLayerId: layerId,
        layerPanelVisible: false,
        layers: [{
          id: layerId,
          name: 'Layer 1',
          order: 0,
          visible: true,
          cells: cells,
          edges: edges || [],
          objects: objects || [],
          textLabels: [],
          fogOfWar: this.buildFogOfWar(cells, options)
        }],
        gridSize: gridSize,
        dimensions: { width: 300, height: 300 },
        viewState: {
          zoom: 1.5,
          center: { x: centerX, y: centerY }
        }
      };
      
      // Save to allData
      allData.maps[mapId] = mapData;
      
      // Write back to file
      const jsonString = JSON.stringify(allData, null, 2);
      if (file) {
        await this.app.vault.modify(file, jsonString);
      } else {
        // Create directory if needed
        const dirPath = dataFilePath.substring(0, dataFilePath.lastIndexOf('/'));
        try {
          await this.app.vault.createFolder(dirPath);
        } catch (e) {
          // Folder may already exist
        }
        await this.app.vault.create(dataFilePath, jsonString);
      }
      
    } catch (error) {
      
      throw error;
    }
  }

  async loadSettings() {
    try {
      const data = await this.loadData();
      this.settings = Object.assign({
        version: '0.16.4',
        hexOrientation: 'flat',
        gridLineColor: '#666666',
        gridLineWidth: 1,
        backgroundColor: '#1a1a1a',
        borderColor: '#8b6842',
        coordinateKeyColor: '#c4a57b',
        coordinateTextColor: '#ffffff',
        coordinateTextShadow: '#000000',
        coordinateKeyMode: 'hold',
        expandedByDefault: false,
        // Canvas dimensions
        canvasHeight: 600,
        canvasHeightMobile: 400,
        // Distance measurement settings
        distancePerCellGrid: 5,
        distancePerCellHex: 6,
        distanceUnitGrid: 'ft',
        distanceUnitHex: 'mi',
        gridDiagonalRule: 'alternating',
        distanceDisplayFormat: 'both',
        // Object customization - separate for hex and grid maps
        hexObjectOverrides: {},
        customHexObjects: [],
        customHexCategories: [],
        gridObjectOverrides: {},
        customGridObjects: [],
        customGridCategories: [],
        // Color palette customization
        colorPaletteOverrides: {},
        customPaletteColors: [],
        // Fog of War defaults
        fogOfWarBlurEnabled: false,
        fogOfWarBlurFactor: 0.20,
        // Controls visibility
        alwaysShowControls: false,
        // Object sets
        objectSets: [],
        activeObjectSetId: null,
        objectSetsAutoLoadFolder: ''
      }, data || {});
    } catch (error) {
      
      this.settings = {
        version: '0.16.4',
        hexOrientation: 'flat',
        gridLineColor: '#666666',
        gridLineWidth: 1,
        backgroundColor: '#1a1a1a',
        borderColor: '#8b6842',
        coordinateKeyColor: '#c4a57b',
        coordinateTextColor: '#ffffff',
        coordinateTextShadow: '#000000',
        coordinateKeyMode: 'hold',
        expandedByDefault: false,
        // Canvas dimensions
        canvasHeight: 600,
        canvasHeightMobile: 400,
        // Distance measurement settings
        distancePerCellGrid: 5,
        distancePerCellHex: 6,
        distanceUnitGrid: 'ft',
        distanceUnitHex: 'mi',
        gridDiagonalRule: 'alternating',
        distanceDisplayFormat: 'both',
        // Object customization - separate for hex and grid maps
        hexObjectOverrides: {},
        customHexObjects: [],
        customHexCategories: [],
        gridObjectOverrides: {},
        customGridObjects: [],
        customGridCategories: [],
        // Color palette customization
        colorPaletteOverrides: {},
        customPaletteColors: [],
        // Fog of War defaults
        fogOfWarBlurEnabled: false,
        fogOfWarBlurFactor: 0.20,
        // Controls visibility
        alwaysShowControls: false,
        // Object sets
        objectSets: [],
        activeObjectSetId: null,
        objectSetsAutoLoadFolder: ''
      };
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

// =============================================================================
// SETTINGS TAB CLASS
// =============================================================================

class WindroseMDSettingsTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.settingsChanged = false;
    this.objectFilter = '';
    this.selectedMapType = 'grid'; // 'grid' or 'hex' for object editing
  }
  
  // ---------------------------------------------------------------------------
  // Helper: Get object settings for the selected map type
  // Returns a normalized object { objectOverrides, customObjects, customCategories }
  // ---------------------------------------------------------------------------
  
  getObjectSettingsForMapType() {
    const settings = this.plugin.settings;
    if (this.selectedMapType === 'hex') {
      return {
        objectOverrides: settings.hexObjectOverrides || {},
        customObjects: settings.customHexObjects || [],
        customCategories: settings.customHexCategories || []
      };
    } else {
      return {
        objectOverrides: settings.gridObjectOverrides || {},
        customObjects: settings.customGridObjects || [],
        customCategories: settings.customGridCategories || []
      };
    }
  }
  
  // ---------------------------------------------------------------------------
  // Helper: Update object settings for the selected map type
  // ---------------------------------------------------------------------------
  
  updateObjectSettingsForMapType(updates) {
    if (this.selectedMapType === 'hex') {
      if (updates.objectOverrides !== undefined) {
        this.plugin.settings.hexObjectOverrides = updates.objectOverrides;
      }
      if (updates.customObjects !== undefined) {
        this.plugin.settings.customHexObjects = updates.customObjects;
      }
      if (updates.customCategories !== undefined) {
        this.plugin.settings.customHexCategories = updates.customCategories;
      }
    } else {
      if (updates.objectOverrides !== undefined) {
        this.plugin.settings.gridObjectOverrides = updates.objectOverrides;
      }
      if (updates.customObjects !== undefined) {
        this.plugin.settings.customGridObjects = updates.customObjects;
      }
      if (updates.customCategories !== undefined) {
        this.plugin.settings.customGridCategories = updates.customCategories;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helper: Create collapsible section with details/summary
  // ---------------------------------------------------------------------------
  
  createCollapsibleSection(containerEl, title, renderFn, options = {}) {
    const details = containerEl.createEl('details', { cls: 'dmt-settings-section' });
    if (options.open) details.setAttribute('open', '');
    
    // Store section reference for search filtering
    if (!this.sections) this.sections = [];
    this.sections.push({ details, title });
    
    const summary = details.createEl('summary');
    summary.createEl('span', { text: title });
    
    const contentEl = details.createEl('div', { cls: 'dmt-settings-section-content' });
    
    // Track settings within this section for search
    const settingItems = [];
    const originalCreateEl = contentEl.createEl.bind(contentEl);
    
    // Render the section content
    renderFn(contentEl);
    
    // Collect all setting-item elements for search filtering
    details.settingItems = Array.from(contentEl.querySelectorAll('.setting-item'));
    
    return details;
  }
  
  // ---------------------------------------------------------------------------
  // Helper: Render search bar
  // ---------------------------------------------------------------------------
  

  // ---------------------------------------------------------------------------
  // Main display method - orchestrates section rendering
  // ---------------------------------------------------------------------------

  display() {
    const { containerEl } = this;
    
    // Preserve which sections are currently open before rebuilding
    const openSections = new Set();
    if (this.sections) {
      this.sections.forEach(({ details, title }) => {
        if (details.hasAttribute('open')) {
          openSections.add(title);
        }
      });
    }
    
    containerEl.empty();
    
    // Reset section tracking for search
    this.sections = [];
    
    this.renderSearchBar(containerEl);
    
    // Render collapsible sections (restore open state if previously open)
    this.createCollapsibleSection(containerEl, 'Hex Map Settings', 
      (el) => this.renderHexSettingsContent(el),
      { open: openSections.has('Hex Map Settings') });
    this.createCollapsibleSection(containerEl, 'Color Settings', 
      (el) => this.renderColorSettingsContent(el),
      { open: openSections.has('Color Settings') });
    this.createCollapsibleSection(containerEl, 'Color Palette', 
      (el) => this.renderColorPaletteContent(el),
      { open: openSections.has('Color Palette') });
    this.createCollapsibleSection(containerEl, 'Fog of War', 
      (el) => this.renderFogOfWarSettingsContent(el),
      { open: openSections.has('Fog of War') });
    this.createCollapsibleSection(containerEl, 'Map Behavior', 
      (el) => this.renderMapBehaviorSettingsContent(el),
      { open: openSections.has('Map Behavior') });
    this.createCollapsibleSection(containerEl, 'Distance Measurement', 
      (el) => this.renderDistanceMeasurementSettingsContent(el),
      { open: openSections.has('Distance Measurement') });
    this.createCollapsibleSection(containerEl, 'Object Types', 
      (el) => this.renderObjectTypesContent(el),
      { open: openSections.has('Object Types') });
  }

  
  hide() {
    // Only dispatch event if settings were actually changed
    if (this.settingsChanged) {
      window.dispatchEvent(new CustomEvent('dmt-settings-changed', {
        detail: { timestamp: Date.now() }
      }));
      this.settingsChanged = false;
    }
    
  }
}

// =============================================================================
// TAB RENDER MIXINS
// Methods injected into WindroseMDSettingsTab prototype at assembly time
// =============================================================================

// settingsPlugin-TabRenderCore.js
// WindroseMDSettingsTab render methods - Core (search bar)
// This file is concatenated into the settings plugin template by the assembler

const TabRenderCoreMethods = {
  renderSearchBar(containerEl) {
    const wrapper = containerEl.createEl('div', { cls: 'dmt-settings-search-wrapper' });
    const searchBox = wrapper.createEl('div', { cls: 'dmt-settings-search-box' });
    
    // Search icon
    const searchIcon = searchBox.createEl('span', { cls: 'search-icon' });
    IconHelpers.set(searchIcon, 'search');
    
    // Input
    const input = searchBox.createEl('input', {
      type: 'text',
      placeholder: 'Search settings...'
    });
    
    // Clear button (hidden initially)
    const clearBtn = searchBox.createEl('button', { cls: 'clear-btn' });
    clearBtn.style.display = 'none';
    IconHelpers.set(clearBtn, 'x');
    
    // No results message (hidden initially)
    this.noResultsEl = containerEl.createEl('div', { 
      cls: 'dmt-settings-no-results',
      text: 'No settings found matching your search.'
    });
    this.noResultsEl.style.display = 'none';
    
    // Search handler
    const handleSearch = (query) => {
      const q = query.toLowerCase().trim();
      clearBtn.style.display = q ? 'block' : 'none';
      
      if (!q) {
        // Clear search - show all, collapse sections
        this.sections?.forEach(({ details }) => {
          details.style.display = '';
          details.settingItems?.forEach(item => {
            item.classList.remove('dmt-setting-hidden');
          });
          details.removeAttribute('open');
        });
        this.noResultsEl.style.display = 'none';
        return;
      }
      
      let anyMatches = false;
      
      this.sections?.forEach(({ details, title }) => {
        let sectionHasMatch = title.toLowerCase().includes(q);
        
        details.settingItems?.forEach(item => {
          const nameEl = item.querySelector('.setting-item-name');
          const descEl = item.querySelector('.setting-item-description');
          const name = nameEl?.textContent?.toLowerCase() || '';
          const desc = descEl?.textContent?.toLowerCase() || '';
          
          const matches = name.includes(q) || desc.includes(q);
          
          if (matches) {
            item.classList.remove('dmt-setting-hidden');
            sectionHasMatch = true;
          } else {
            item.classList.add('dmt-setting-hidden');
          }
        });
        
        if (sectionHasMatch) {
          details.style.display = '';
          details.setAttribute('open', '');
          anyMatches = true;
        } else {
          details.style.display = 'none';
        }
      });
      
      this.noResultsEl.style.display = anyMatches ? 'none' : 'block';
    };
    
    input.addEventListener('input', (e) => handleSearch(e.target.value));
    clearBtn.addEventListener('click', () => {
      input.value = '';
      handleSearch('');
      input.focus();
    });
  }

};

// settingsPlugin-TabRenderSettings.js
// WindroseMDSettingsTab render methods - Settings sections
// This file is concatenated into the settings plugin template by the assembler

const TabRenderSettingsMethods = {
  renderHexSettingsContent(containerEl) {
    // Hex Orientation
    new Setting(containerEl)
      .setName('Hex Grid Orientation')
      .setDesc('Default orientation for hex grids (flat-top or pointy-top)')
      .addDropdown(dropdown => dropdown
        .addOption('flat', 'Flat-Top')
        .addOption('pointy', 'Pointy-Top')
        .setValue(this.plugin.settings.hexOrientation)
        .onChange(async (value) => {
          this.plugin.settings.hexOrientation = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Coordinate Key Mode
    new Setting(containerEl)
      .setName('Coordinate Overlay Mode')
      .setDesc('How the C key activates coordinate labels: hold to show temporarily, or toggle on/off')
      .addDropdown(dropdown => dropdown
        .addOption('hold', 'Hold to Show')
        .addOption('toggle', 'Toggle On/Off')
        .setValue(this.plugin.settings.coordinateKeyMode || 'hold')
        .onChange(async (value) => {
          this.plugin.settings.coordinateKeyMode = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Coordinate Text Color
    new Setting(containerEl)
      .setName('Coordinate Text Color')
      .setDesc('Primary color for hex coordinate overlay text (hex format: #RRGGBB)')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.coordinateTextColor)
        .onChange(async (value) => {
          this.plugin.settings.coordinateTextColor = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addText(text => text
        .setPlaceholder('#ffffff')
        .setValue(this.plugin.settings.coordinateTextColor)
        .onChange(async (value) => {
          if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
            this.plugin.settings.coordinateTextColor = value;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default')
        .onClick(async () => {
          this.plugin.settings.coordinateTextColor = '#ffffff';
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));

    // Coordinate Text Shadow
    new Setting(containerEl)
      .setName('Coordinate Text Shadow')
      .setDesc('Shadow/outline color for hex coordinate overlay text (hex format: #RRGGBB)')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.coordinateTextShadow)
        .onChange(async (value) => {
          this.plugin.settings.coordinateTextShadow = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addText(text => text
        .setPlaceholder('#000000')
        .setValue(this.plugin.settings.coordinateTextShadow)
        .onChange(async (value) => {
          if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
            this.plugin.settings.coordinateTextShadow = value;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default')
        .onClick(async () => {
          this.plugin.settings.coordinateTextShadow = '#000000';
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));
  },
  renderColorSettingsContent(containerEl) {
    containerEl.createEl('p', { 
      text: 'These settings control default colors and behavior for all WindroseMD maps in this vault.',
      cls: 'setting-item-description'
    });
    
    // Grid Line Color
    new Setting(containerEl)
      .setName('Grid Line Color')
      .setDesc('Color for grid lines (hex format: #RRGGBB)')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.gridLineColor)
        .onChange(async (value) => {
          this.plugin.settings.gridLineColor = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addText(text => text
        .setPlaceholder('#666666')
        .setValue(this.plugin.settings.gridLineColor)
        .onChange(async (value) => {
          if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
            this.plugin.settings.gridLineColor = value;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default')
        .onClick(async () => {
          this.plugin.settings.gridLineColor = '#666666';
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));

    // Grid Line Width (grid maps only)
    new Setting(containerEl)
      .setName('Grid Line Width')
      .setDesc('Thickness of grid lines in pixels (1-5). Applies to grid maps only.')
      .addSlider(slider => slider
        .setLimits(1, 5, 1)
        .setValue(this.plugin.settings.gridLineWidth ?? 1)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.gridLineWidth = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default (1px)')
        .onClick(async () => {
          this.plugin.settings.gridLineWidth = 1;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));

    // Background Color
    new Setting(containerEl)
      .setName('Background Color')
      .setDesc('Canvas background color (hex format: #RRGGBB)')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.backgroundColor)
        .onChange(async (value) => {
          this.plugin.settings.backgroundColor = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addText(text => text
        .setPlaceholder('#1a1a1a')
        .setValue(this.plugin.settings.backgroundColor)
        .onChange(async (value) => {
          if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
            this.plugin.settings.backgroundColor = value;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default')
        .onClick(async () => {
          this.plugin.settings.backgroundColor = '#1a1a1a';
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));

    // Border Color
    new Setting(containerEl)
      .setName('Border Color')
      .setDesc('Color for painted cell borders (hex format: #RRGGBB)')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.borderColor)
        .onChange(async (value) => {
          this.plugin.settings.borderColor = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addText(text => text
        .setPlaceholder('#8b6842')
        .setValue(this.plugin.settings.borderColor)
        .onChange(async (value) => {
          if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
            this.plugin.settings.borderColor = value;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default')
        .onClick(async () => {
          this.plugin.settings.borderColor = '#8b6842';
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));

    // Coordinate Key Color
    new Setting(containerEl)
      .setName('Coordinate Key Color')
      .setDesc('Background color for coordinate key indicator (hex format: #RRGGBB)')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.coordinateKeyColor)
        .onChange(async (value) => {
          this.plugin.settings.coordinateKeyColor = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addText(text => text
        .setPlaceholder('#c4a57b')
        .setValue(this.plugin.settings.coordinateKeyColor)
        .onChange(async (value) => {
          if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
            this.plugin.settings.coordinateKeyColor = value;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default')
        .onClick(async () => {
          this.plugin.settings.coordinateKeyColor = '#c4a57b';
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));
  },
  renderFogOfWarSettingsContent(containerEl) {
    containerEl.createEl('p', { 
      text: 'Default fog of war appearance settings for new maps. Individual maps can override these in their settings.',
      cls: 'setting-item-description'
    });
    
    // Soft Edges Toggle
    new Setting(containerEl)
      .setName('Soft Edges')
      .setDesc('Enable a blur effect at fog boundaries for a softer, more atmospheric look')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.fogOfWarBlurEnabled)
        .onChange(async (value) => {
          this.plugin.settings.fogOfWarBlurEnabled = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display(); // Refresh to show/hide blur intensity slider
        }));
    
    // Blur Intensity Slider (only show when blur is enabled)
    if (this.plugin.settings.fogOfWarBlurEnabled) {
      const blurPercent = Math.round((this.plugin.settings.fogOfWarBlurFactor || 0.20) * 100);
      
      new Setting(containerEl)
        .setName('Blur Intensity')
        .setDesc(`Size of blur effect as percentage of cell size (currently ${blurPercent}%)`)
        .addSlider(slider => slider
          .setLimits(5, 50, 1)
          .setValue(blurPercent)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.fogOfWarBlurFactor = value / 100;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }))
        .addExtraButton(btn => btn
          .setIcon('rotate-ccw')
          .setTooltip('Reset to default (20%)')
          .onClick(async () => {
            this.plugin.settings.fogOfWarBlurFactor = 0.20;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }));
    }
  },
  renderMapBehaviorSettingsContent(containerEl) {
    // Expanded by Default
    new Setting(containerEl)
      .setName('Start Maps Expanded')
      .setDesc('When enabled, maps will start in expanded (fullscreen) mode by default')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.expandedByDefault)
        .onChange(async (value) => {
          this.plugin.settings.expandedByDefault = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Always Show Controls
    new Setting(containerEl)
      .setName('Always Show Controls')
      .setDesc('Keep map controls visible at all times instead of auto-hiding')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.alwaysShowControls)
        .onChange(async (value) => {
          this.plugin.settings.alwaysShowControls = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Canvas Height (Desktop)
    new Setting(containerEl)
      .setName('Canvas Height (Desktop)')
      .setDesc('Default height in pixels for map canvas on desktop devices')
      .addText(text => text
        .setPlaceholder('600')
        .setValue(String(this.plugin.settings.canvasHeight))
        .onChange(async (value) => {
          const num = parseInt(value);
          if (!isNaN(num)) {
            this.plugin.settings.canvasHeight = num;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }));

    // Canvas Height (Mobile)
    new Setting(containerEl)
      .setName('Canvas Height (Mobile/Touch)')
      .setDesc('Default height in pixels for map canvas on mobile and touch devices')
      .addText(text => text
        .setPlaceholder('400')
        .setValue(String(this.plugin.settings.canvasHeightMobile))
        .onChange(async (value) => {
          const num = parseInt(value);
          if (!isNaN(num)) {
            this.plugin.settings.canvasHeightMobile = num;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }));
  },
  renderDistanceMeasurementSettingsContent(containerEl) {
    // Grid: Distance per cell
    new Setting(containerEl)
      .setName('Grid Map: Distance per Cell')
      .setDesc('Distance each cell represents on grid maps (default: 5 ft for D&D)')
      .addText(text => text
        .setPlaceholder('5')
        .setValue(String(this.plugin.settings.distancePerCellGrid))
        .onChange(async (value) => {
          const num = parseFloat(value);
          if (!isNaN(num) && num > 0) {
            this.plugin.settings.distancePerCellGrid = num;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addDropdown(dropdown => dropdown
        .addOption('ft', 'feet')
        .addOption('m', 'meters')
        .addOption('mi', 'miles')
        .addOption('km', 'kilometers')
        .addOption('yd', 'yards')
        .setValue(this.plugin.settings.distanceUnitGrid)
        .onChange(async (value) => {
          this.plugin.settings.distanceUnitGrid = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Hex: Distance per cell
    new Setting(containerEl)
      .setName('Hex Map: Distance per Hex')
      .setDesc('Distance each hex represents on hex maps (default: 6 miles for world maps)')
      .addText(text => text
        .setPlaceholder('6')
        .setValue(String(this.plugin.settings.distancePerCellHex))
        .onChange(async (value) => {
          const num = parseFloat(value);
          if (!isNaN(num) && num > 0) {
            this.plugin.settings.distancePerCellHex = num;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addDropdown(dropdown => dropdown
        .addOption('mi', 'miles')
        .addOption('km', 'kilometers')
        .addOption('ft', 'feet')
        .addOption('m', 'meters')
        .addOption('yd', 'yards')
        .setValue(this.plugin.settings.distanceUnitHex)
        .onChange(async (value) => {
          this.plugin.settings.distanceUnitHex = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Grid diagonal rule
    new Setting(containerEl)
      .setName('Grid Diagonal Movement')
      .setDesc('How to calculate diagonal distance on grid maps')
      .addDropdown(dropdown => dropdown
        .addOption('alternating', 'Alternating (5-10-5-10, D&D 5e)')
        .addOption('equal', 'Equal (Chebyshev, all moves = 1)')
        .addOption('euclidean', 'True Distance (Euclidean)')
        .setValue(this.plugin.settings.gridDiagonalRule)
        .onChange(async (value) => {
          this.plugin.settings.gridDiagonalRule = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Display format
    new Setting(containerEl)
      .setName('Distance Display Format')
      .setDesc('How to display measured distances')
      .addDropdown(dropdown => dropdown
        .addOption('both', 'Cells and Units (e.g., "3 cells (15 ft)")')
        .addOption('cells', 'Cells Only (e.g., "3 cells")')
        .addOption('units', 'Units Only (e.g., "15 ft")')
        .setValue(this.plugin.settings.distanceDisplayFormat)
        .onChange(async (value) => {
          this.plugin.settings.distanceDisplayFormat = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));
  }

};

// settingsPlugin-TabRenderColors.js
// WindroseMDSettingsTab render methods - Color palette
// This file is concatenated into the settings plugin template by the assembler

const TabRenderColorsMethods = {
  renderColorPaletteContent(containerEl) {
    containerEl.createEl('p', { 
      text: 'Customize the color palette used for drawing cells and objects. Edit built-in colors, add custom colors, or hide colors you don\'t use.',
      cls: 'setting-item-description'
    });
    
    // Add Custom Color button
    new Setting(containerEl)
      .setName('Add Custom Color')
      .setDesc('Create a new color for your palette')
      .addButton(btn => btn
        .setButtonText('+ Add Color')
        .setCta()
        .onClick(() => {
          new ColorEditModal(this.app, this.plugin, null, async () => {
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }).open();
        }));
    
    // Reset All Colors button  
    new Setting(containerEl)
      .setName('Reset Palette')
      .setDesc('Restore all built-in colors to defaults and remove custom colors')
      .addButton(btn => btn
        .setButtonText('Reset All')
        .setWarning()
        .onClick(async () => {
          if (await new ConfirmModal(this.app, {
              message: 'Reset all colors to defaults? This will remove all customizations.',
              confirmText: 'Reset All',
              isDestructive: true
            }).openAndGetValue()) {
            this.plugin.settings.colorPaletteOverrides = {};
            this.plugin.settings.customPaletteColors = [];
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }
        }));
    
    // Render color list
    this.renderColorList(containerEl);
  },
  renderColorList(containerEl) {
    const resolvedColors = ColorHelpers.getResolved(this.plugin.settings);
    const hiddenColors = ColorHelpers.getHidden(this.plugin.settings);
    
    // Separate into visible and hidden
    const visibleColors = resolvedColors.filter(c => !hiddenColors.has(c.id));
    const hiddenBuiltIns = BUILT_IN_COLORS.filter(c => hiddenColors.has(c.id));
    
    // Visible colors container
    const visibleContainer = containerEl.createEl('div', { cls: 'dmt-settings-category' });
    const visibleHeader = visibleContainer.createEl('div', { cls: 'dmt-settings-category-header' });
    visibleHeader.createEl('span', { text: `Active Colors (${visibleColors.length})`, cls: 'dmt-settings-category-label' });
    
    const visibleList = visibleContainer.createEl('div', { cls: 'dmt-color-list' });
    
    visibleColors.forEach(color => {
      this.renderColorRow(visibleList, color, false);
    });
    
    if (visibleColors.length === 0) {
      visibleList.createEl('div', { 
        text: 'No colors visible. Use "Show" to restore hidden colors.',
        cls: 'dmt-settings-empty-message'
      });
    }
    
    // Hidden colors (if any)
    if (hiddenBuiltIns.length > 0) {
      const hiddenContainer = containerEl.createEl('div', { cls: 'dmt-settings-category dmt-settings-category-muted' });
      const hiddenHeader = hiddenContainer.createEl('div', { cls: 'dmt-settings-category-header' });
      hiddenHeader.createEl('span', { text: `Hidden Colors (${hiddenBuiltIns.length})`, cls: 'dmt-settings-category-label' });
      
      const hiddenList = hiddenContainer.createEl('div', { cls: 'dmt-color-list' });
      
      hiddenBuiltIns.forEach(color => {
        // Build display version with override if exists
        const override = this.plugin.settings.colorPaletteOverrides?.[color.id];
        const displayColor = override ? { ...color, ...override, isBuiltIn: true, isModified: true } : { ...color, isBuiltIn: true };
        this.renderColorRow(hiddenList, displayColor, true);
      });
    }
  },
  renderColorRow(containerEl, color, isHidden) {
    const row = containerEl.createEl('div', { cls: 'dmt-color-row' });
    
    // Color swatch - apply opacity if set
    const swatchOpacity = color.opacity ?? 1;
    const swatch = row.createEl('div', { 
      cls: 'dmt-color-row-swatch',
      attr: { style: `background-color: ${color.color}; opacity: ${swatchOpacity}` }
    });
    
    // Label with modified indicator
    const labelContainer = row.createEl('div', { cls: 'dmt-color-row-label' });
    labelContainer.createEl('span', { text: color.label, cls: 'dmt-color-row-name' });
    
    if (color.isModified) {
      labelContainer.createEl('span', { text: ' (modified)', cls: 'dmt-color-row-modified' });
    }
    if (color.isCustom) {
      labelContainer.createEl('span', { text: ' (custom)', cls: 'dmt-color-row-custom' });
    }
    
    // Hex value + opacity if not 100%
    const hexText = swatchOpacity < 1 
      ? `${color.color} @ ${Math.round(swatchOpacity * 100)}%`
      : color.color;
    row.createEl('code', { text: hexText, cls: 'dmt-color-row-hex' });
    
    // Actions
    const actions = row.createEl('div', { cls: 'dmt-color-row-actions' });
    
    // Edit button
    const editBtn = actions.createEl('button', { cls: 'dmt-btn-icon', attr: { 'aria-label': 'Edit color' } });
    IconHelpers.set(editBtn, 'pencil');
    editBtn.addEventListener('click', () => {
      new ColorEditModal(this.app, this.plugin, color, async () => {
        this.settingsChanged = true;
        await this.plugin.saveSettings();
        this.display();
      }).open();
    });
    
    // Show/Hide button (for built-in colors only)
    if (color.isBuiltIn) {
      const visBtn = actions.createEl('button', { cls: 'dmt-btn-icon', attr: { 'aria-label': isHidden ? 'Show color' : 'Hide color' } });
      IconHelpers.set(visBtn, isHidden ? 'eye' : 'eye-off');
      visBtn.addEventListener('click', async () => {
        if (!this.plugin.settings.colorPaletteOverrides) {
          this.plugin.settings.colorPaletteOverrides = {};
        }
        if (!this.plugin.settings.colorPaletteOverrides[color.id]) {
          this.plugin.settings.colorPaletteOverrides[color.id] = {};
        }
        this.plugin.settings.colorPaletteOverrides[color.id].hidden = !isHidden;
        
        // Clean up empty override
        if (Object.keys(this.plugin.settings.colorPaletteOverrides[color.id]).length === 1 
            && !this.plugin.settings.colorPaletteOverrides[color.id].hidden) {
          delete this.plugin.settings.colorPaletteOverrides[color.id];
        }
        
        this.settingsChanged = true;
        await this.plugin.saveSettings();
        this.display();
      });
      
      // Reset button (if modified)
      if (color.isModified) {
        const resetBtn = actions.createEl('button', { cls: 'dmt-btn-icon', attr: { 'aria-label': 'Reset to default' } });
        IconHelpers.set(resetBtn, 'rotate-ccw');
        resetBtn.addEventListener('click', async () => {
          delete this.plugin.settings.colorPaletteOverrides[color.id];
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        });
      }
    }
    
    // Delete button (for custom colors only)
    if (color.isCustom) {
      const delBtn = actions.createEl('button', { cls: 'dmt-btn-icon dmt-btn-danger', attr: { 'aria-label': 'Delete color' } });
      IconHelpers.set(delBtn, 'trash-2');
      delBtn.addEventListener('click', async () => {
        this.plugin.settings.customPaletteColors = this.plugin.settings.customPaletteColors.filter(c => c.id !== color.id);
        this.settingsChanged = true;
        await this.plugin.saveSettings();
        this.display();
      });
    }
  }

};

// settingsPlugin-TabRenderObjects.js
// WindroseMDSettingsTab render methods - Object types
// This file is concatenated into the settings plugin template by the assembler

const TabRenderObjectsMethods = {
  renderObjectTypesContent(containerEl) {
    containerEl.createEl('p', {
      text: 'Customize map objects: modify built-in objects, create custom objects, or hide objects you don\'t use.',
      cls: 'setting-item-description'
    });

    // =========================================================================
    // Object Sets
    // =========================================================================

    this.renderObjectSetsBlock(containerEl);

    containerEl.createEl('div', { cls: 'dmt-set-separator' });

    // Map Type selector dropdown
    new Setting(containerEl)
      .setName('Map Type')
      .setDesc('Select which map type to configure objects for')
      .addDropdown(dropdown => dropdown
        .addOption('grid', 'Grid Maps')
        .addOption('hex', 'Hex Maps')
        .setValue(this.selectedMapType)
        .onChange((value) => {
          this.selectedMapType = value;
          this.display();
        }));
    
    // Get settings for the selected map type
    const mapTypeSettings = this.getObjectSettingsForMapType();
    
    // Add Custom Object button
    new Setting(containerEl)
      .setName('Add Custom Object')
      .setDesc('Create a new map object with your own symbol')
      .addButton(btn => btn
        .setButtonText('+ Add Object')
        .setCta()
        .onClick(() => {
          new ObjectEditModal(this.app, this.plugin, null, async () => {
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }, this.selectedMapType).open();
        }));
    
    // Add Custom Category button
    new Setting(containerEl)
      .setName('Add Custom Category')
      .setDesc('Create a new category to organize objects')
      .addButton(btn => btn
        .setButtonText('+ Add Category')
        .onClick(() => {
          new CategoryEditModal(this.app, this.plugin, null, async () => {
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }, this.selectedMapType).open();
        }));
    
    // Import/Export buttons
    new Setting(containerEl)
      .setName('Import / Export')
      .setDesc('Share object configurations as JSON files')
      .addButton(btn => btn
        .setButtonText('Import')
        .onClick(() => {
          new ImportModal(this.app, this.plugin, async () => {
            this.settingsChanged = true;
            this.display();
          }, this.selectedMapType).open();
        }))
      .addButton(btn => btn
        .setButtonText('Export')
        .onClick(() => {
          new ExportModal(this.app, this.plugin, this.selectedMapType).open();
        }));
    
    // Get resolved data using helpers with map-type-specific settings
    const allCategories = ObjectHelpers.getCategories(mapTypeSettings);
    const allObjects = ObjectHelpers.getResolved(mapTypeSettings);
    const hiddenObjects = ObjectHelpers.getHidden(mapTypeSettings);
    
    // Check if there are any customizations for this map type
    const hasOverrides = Object.keys(mapTypeSettings.objectOverrides || {}).length > 0;
    const hasCustomObjects = (mapTypeSettings.customObjects || []).length > 0;
    const hasCustomCategories = (mapTypeSettings.customCategories || []).length > 0;
    const hasAnyCustomizations = hasOverrides || hasCustomObjects || hasCustomCategories;
    
    // Reset All button (only show if there are customizations)
    if (hasAnyCustomizations) {
      new Setting(containerEl)
        .setName(`Reset ${this.selectedMapType === 'hex' ? 'Hex' : 'Grid'} to Defaults`)
        .setDesc(`Restore built-in objects for ${this.selectedMapType} maps. Does not affect saved sets.`)
        .addButton(btn => btn
          .setButtonText('Reset to Defaults')
          .setWarning()
          .onClick(async () => {
            const counts = [];
            if (hasOverrides) counts.push(`${Object.keys(mapTypeSettings.objectOverrides).length} modification(s)`);
            if (hasCustomObjects) counts.push(`${mapTypeSettings.customObjects.length} custom object(s)`);
            if (hasCustomCategories) counts.push(`${mapTypeSettings.customCategories.length} custom category(ies)`);

            if (await new ConfirmModal(this.app, {
              message: `This will remove ${counts.join(', ')} for ${this.selectedMapType} maps. Saved sets are not affected. Maps using custom objects will show "?" placeholders.`,
              confirmText: 'Reset to Defaults',
              isDestructive: true
            }).openAndGetValue()) {
              this.updateObjectSettingsForMapType({
                objectOverrides: {},
                customObjects: [],
                customCategories: []
              });
              this.settingsChanged = true;
              await this.plugin.saveSettings();
              this.display();
            }
          }));
    }
    
    // Search/filter input
    const searchContainer = containerEl.createDiv({ cls: 'dmt-settings-search-container' });
    const searchInput = searchContainer.createEl('input', {
      type: 'text',
      cls: 'dmt-settings-search-input',
      attr: { placeholder: 'Filter objects...' },
      value: this.objectFilter || ''
    });
    searchInput.addEventListener('input', (e) => {
      this.objectFilter = e.target.value.toLowerCase().trim();
      this.renderObjectList(objectListContainer, allCategories, allObjects, hiddenObjects);
    });
    
    if (this.objectFilter) {
      const clearBtn = searchContainer.createEl('button', {
        cls: 'dmt-settings-search-clear',
        attr: { 'aria-label': 'Clear filter', title: 'Clear filter' }
      });
      IconHelpers.set(clearBtn, 'x');
      clearBtn.onclick = () => {
        this.objectFilter = '';
        searchInput.value = '';
        this.renderObjectList(objectListContainer, allCategories, allObjects, hiddenObjects);
      };
    }
    
    // Object list container (for filtered re-renders)
    const objectListContainer = containerEl.createDiv({ cls: 'dmt-settings-object-list-container' });
    this.renderObjectList(objectListContainer, allCategories, allObjects, hiddenObjects);
  },
  renderObjectList(container, allCategories, allObjects, hiddenObjects) {
    container.empty();
    
    const filter = this.objectFilter || '';
    const isDraggable = !filter; // Disable drag when filtering
    
    // Filter objects if search term present
    const filteredObjects = filter
      ? allObjects.filter(obj => 
          obj.label.toLowerCase().includes(filter) || 
          (obj.symbol && obj.symbol.toLowerCase().includes(filter)) ||
          (obj.iconClass && obj.iconClass.toLowerCase().includes(filter)))
      : allObjects;
    
    const filteredHidden = filter
      ? hiddenObjects.filter(obj =>
          obj.label.toLowerCase().includes(filter) ||
          (obj.symbol && obj.symbol.toLowerCase().includes(filter)) ||
          (obj.iconClass && obj.iconClass.toLowerCase().includes(filter)))
      : hiddenObjects;
    
    // Show "no results" message if filter returns nothing
    if (filter && filteredObjects.length === 0 && filteredHidden.length === 0) {
      container.createDiv({ 
        cls: 'dmt-settings-no-results',
        text: `No objects matching "${filter}"`
      });
      return;
    }
    
    // Render each category (skip 'notes' - note_pin is handled specially in the map UI)
    for (const category of allCategories) {
      if (category.id === 'notes') continue;
      
      let categoryObjects = filteredObjects.filter(obj => obj.category === category.id);
      if (categoryObjects.length === 0 && category.isBuiltIn) continue;
      if (categoryObjects.length === 0 && filter) continue;
      
      // Sort by order
      categoryObjects = categoryObjects.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      
      const categoryContainer = container.createDiv({ cls: 'dmt-settings-category' });
      
      // Category header with object count
      const categoryHeader = categoryContainer.createDiv({ cls: 'dmt-settings-category-header' });
      const labelText = category.label + (categoryObjects.length > 0 ? ` (${categoryObjects.length})` : '');
      categoryHeader.createSpan({ text: labelText, cls: 'dmt-settings-category-label' });
      
      // Edit/Delete for custom categories
      if (category.isCustom) {
        const categoryActions = categoryHeader.createDiv({ cls: 'dmt-settings-category-actions' });
        
        const editBtn = categoryActions.createEl('button', { cls: 'dmt-settings-icon-btn', attr: { 'aria-label': 'Edit category', title: 'Edit category' } });
        IconHelpers.set(editBtn, 'pencil');
        editBtn.onclick = () => {
          new CategoryEditModal(this.app, this.plugin, category, async () => {
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }).open();
        };
        
        // Get unfiltered count for delete validation
        const allCategoryObjects = allObjects.filter(obj => obj.category === category.id);
        const deleteBtn = categoryActions.createEl('button', { cls: 'dmt-settings-icon-btn dmt-settings-icon-btn-danger', attr: { 'aria-label': 'Delete category', title: 'Delete category' } });
        IconHelpers.set(deleteBtn, 'trash-2');
        deleteBtn.onclick = async () => {
          if (allCategoryObjects.length > 0) {
            new Notice(`Cannot delete "${category.label}" - it contains ${allCategoryObjects.length} object(s). Move or delete them first.`);
            return;
          }
          if (await new ConfirmModal(this.app, {
              message: `Delete category "${category.label}"?`,
              confirmText: 'Delete',
              isDestructive: true
            }).openAndGetValue()) {
            const categoriesKey = this.selectedMapType === 'hex' ? 'customHexCategories' : 'customGridCategories';
            if (this.plugin.settings[categoriesKey]) {
              this.plugin.settings[categoriesKey] = this.plugin.settings[categoriesKey].filter(c => c.id !== category.id);
            }
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }
        };
      }
      
      // Object list with drag/drop support
      const objectList = categoryContainer.createDiv({ cls: 'dmt-settings-object-list' });
      objectList.dataset.categoryId = category.id;
      
      // Only enable drag/drop when not filtering
      if (!filter) {
        this.setupDragDropForList(objectList, category);
      }
      
      for (const obj of categoryObjects) {
        this.renderObjectRow(objectList, obj, false, !filter);
      }
    }
    
    // Hidden objects section
    if (filteredHidden.length > 0) {
      const hiddenContainer = container.createDiv({ cls: 'dmt-settings-hidden-section' });
      
      const hiddenHeader = new Setting(hiddenContainer)
        .setName(`Hidden Objects (${filteredHidden.length})`)
        .setDesc('Built-in objects you\'ve hidden from the palette');
      
      const hiddenList = hiddenContainer.createDiv({ cls: 'dmt-settings-object-list dmt-settings-hidden-list' });
      hiddenList.style.display = 'none';
      
      hiddenHeader.addButton(btn => btn
        .setButtonText('Show')
        .onClick(() => {
          const isVisible = hiddenList.style.display !== 'none';
          hiddenList.style.display = isVisible ? 'none' : 'block';
          btn.setButtonText(isVisible ? 'Show' : 'Hide');
        }));
      
      for (const obj of filteredHidden) {
        this.renderObjectRow(hiddenList, obj, true);
      }
    }
  },

  // ---------------------------------------------------------------------------
  // Drag/drop setup for object lists
  // ---------------------------------------------------------------------------
  
  setupDragDropForList(objectList, category) {
    objectList.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      const dragging = objectList.querySelector('.dmt-dragging');
      if (!dragging) return;
      
      const afterElement = DragHelpers.getAfterElement(objectList, e.clientY);
      if (afterElement == null) {
        objectList.appendChild(dragging);
      } else {
        objectList.insertBefore(dragging, afterElement);
      }
    });
    
    objectList.addEventListener('dragenter', (e) => {
      e.preventDefault();
    });
    
    objectList.addEventListener('drop', async (e) => {
      e.preventDefault();
      
      // Get the correct settings keys for the selected map type
      const overridesKey = this.selectedMapType === 'hex' ? 'hexObjectOverrides' : 'gridObjectOverrides';
      const customObjectsKey = this.selectedMapType === 'hex' ? 'customHexObjects' : 'customGridObjects';
      
      // Get new order from DOM positions
      const rows = [...objectList.querySelectorAll('.dmt-settings-object-row')];
      
      // Get default ID order for this category
      const defaultIdOrder = ObjectHelpers.getDefaultIdOrder(category.id, this.getObjectSettingsForMapType());
      
      // Apply new orders to settings
      rows.forEach((row, actualPosition) => {
        const id = row.dataset.objectId;
        const isBuiltIn = row.dataset.isBuiltIn === 'true';
        const newOrder = actualPosition * 10;
        
        if (isBuiltIn) {
          const defaultPosition = defaultIdOrder.indexOf(id);
          
          if (actualPosition === defaultPosition) {
            // In default position - remove order override if present
            if (this.plugin.settings[overridesKey]?.[id]) {
              delete this.plugin.settings[overridesKey][id].order;
              if (Object.keys(this.plugin.settings[overridesKey][id]).length === 0) {
                delete this.plugin.settings[overridesKey][id];
              }
            }
          } else {
            // Not in default position - save order override
            if (!this.plugin.settings[overridesKey]) {
              this.plugin.settings[overridesKey] = {};
            }
            if (!this.plugin.settings[overridesKey][id]) {
              this.plugin.settings[overridesKey][id] = {};
            }
            this.plugin.settings[overridesKey][id].order = newOrder;
          }
          
          // Update modified indicator in DOM immediately
          const labelEl = row.querySelector('.dmt-settings-object-label');
          if (labelEl) {
            const override = this.plugin.settings[overridesKey]?.[id];
            const hasAnyOverride = override && Object.keys(override).length > 0;
            labelEl.classList.toggle('dmt-settings-modified', !!hasAnyOverride);
          }
        } else {
          // Custom objects - always save order
          const customObjects = this.plugin.settings[customObjectsKey] || [];
          const customObj = customObjects.find(o => o.id === id);
          if (customObj) {
            customObj.order = newOrder;
          }
        }
      });
      
      this.settingsChanged = true;
      await this.plugin.saveSettings();
    });
  },
  renderObjectRow(container, obj, isHiddenSection = false, canDrag = false) {
    const row = container.createDiv({ cls: 'dmt-settings-object-row' });
    
    // Get the correct settings keys for the selected map type
    const overridesKey = this.selectedMapType === 'hex' ? 'hexObjectOverrides' : 'gridObjectOverrides';
    const customObjectsKey = this.selectedMapType === 'hex' ? 'customHexObjects' : 'customGridObjects';
    
    // Data attributes for drag/drop
    row.dataset.objectId = obj.id;
    row.dataset.isBuiltIn = String(!!obj.isBuiltIn);
    row.dataset.originalOrder = String(obj.order ?? 0);
    
    // Drag handle (only if draggable and not in hidden section)
    if (canDrag && !isHiddenSection) {
      row.setAttribute('draggable', 'true');
      row.classList.add('dmt-draggable');
      
      const dragHandle = row.createSpan({ cls: 'dmt-drag-handle' });
      IconHelpers.set(dragHandle, 'grip-vertical');
      
      row.style.userSelect = 'none';
      row.style.webkitUserSelect = 'none';
      
      row.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', obj.id);
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => {
          row.classList.add('dmt-dragging');
        }, 0);
      });
      
      row.addEventListener('dragend', (e) => {
        row.classList.remove('dmt-dragging');
      });
    }
    
    // Symbol, Icon, or Image
    const symbolEl = row.createSpan({ cls: 'dmt-settings-object-symbol' });
    ObjectHelpers.renderObjectSymbol(obj, symbolEl, this.app);
    
    // Label
    const labelEl = row.createSpan({ text: obj.label, cls: 'dmt-settings-object-label' });
    if (obj.isModified) {
      labelEl.addClass('dmt-settings-modified');
    }
    
    // Actions
    const actions = row.createDiv({ cls: 'dmt-settings-object-actions' });
    
    // Edit button
    const editBtn = actions.createEl('button', { cls: 'dmt-settings-icon-btn', attr: { 'aria-label': 'Edit', title: 'Edit object' } });
    IconHelpers.set(editBtn, 'pencil');
    editBtn.onclick = () => {
      new ObjectEditModal(this.app, this.plugin, obj, async () => {
        this.settingsChanged = true;
        await this.plugin.saveSettings();
        this.display();
      }, this.selectedMapType).open();
    };
    
    if (obj.isBuiltIn) {
      if (isHiddenSection) {
        // Unhide button
        const unhideBtn = actions.createEl('button', { cls: 'dmt-settings-icon-btn', attr: { 'aria-label': 'Unhide', title: 'Show in palette' } });
        IconHelpers.set(unhideBtn, 'eye');
        unhideBtn.onclick = async () => {
          if (this.plugin.settings[overridesKey]?.[obj.id]) {
            delete this.plugin.settings[overridesKey][obj.id].hidden;
            if (Object.keys(this.plugin.settings[overridesKey][obj.id]).length === 0) {
              delete this.plugin.settings[overridesKey][obj.id];
            }
          }
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        };
      } else {
        // Hide button
        const hideBtn = actions.createEl('button', { cls: 'dmt-settings-icon-btn', attr: { 'aria-label': 'Hide', title: 'Hide from palette' } });
        IconHelpers.set(hideBtn, 'eye-off');
        hideBtn.onclick = async () => {
          if (!this.plugin.settings[overridesKey]) {
            this.plugin.settings[overridesKey] = {};
          }
          if (!this.plugin.settings[overridesKey][obj.id]) {
            this.plugin.settings[overridesKey][obj.id] = {};
          }
          this.plugin.settings[overridesKey][obj.id].hidden = true;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        };
      }
      
      // Reset button (only for modified)
      if (obj.isModified) {
        const resetBtn = actions.createEl('button', { cls: 'dmt-settings-icon-btn', attr: { 'aria-label': 'Reset to default', title: 'Reset to default' } });
        IconHelpers.set(resetBtn, 'rotate-ccw');
        resetBtn.onclick = async () => {
          if (await new ConfirmModal(this.app, {
              message: `Reset "${obj.label}" to its default symbol and name?`,
              confirmText: 'Reset',
              isDestructive: true
            }).openAndGetValue()) {
            if (this.plugin.settings[overridesKey]) {
              delete this.plugin.settings[overridesKey][obj.id];
            }
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }
        };
      }
    } else {
      // Copy to other map type button for custom objects
      const targetType = this.selectedMapType === 'hex' ? 'grid' : 'hex';
      const targetLabel = targetType === 'hex' ? 'Hex' : 'Grid';
      const copyBtn = actions.createEl('button', { cls: 'dmt-settings-icon-btn', attr: { 'aria-label': `Copy to ${targetLabel}`, title: `Copy to ${targetLabel}` } });
      IconHelpers.set(copyBtn, 'copy');
      copyBtn.onclick = async () => {
        const targetObjectsKey = targetType === 'hex' ? 'customHexObjects' : 'customGridObjects';
        const targetCategoriesKey = targetType === 'hex' ? 'customHexCategories' : 'customGridCategories';

        if (!this.plugin.settings[targetObjectsKey]) {
          this.plugin.settings[targetObjectsKey] = [];
        }

        // Generate new unique ID
        const newId = 'custom-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

        // Check if category exists in target
        let targetCategory = obj.category;
        const targetCategories = this.plugin.settings[targetCategoriesKey] || [];
        const builtInCategoryIds = ObjectHelpers.getCategories({
          objectOverrides: {},
          customObjects: [],
          customCategories: []
        }).map(c => c.id);

        if (!builtInCategoryIds.includes(obj.category) && !targetCategories.find(c => c.id === obj.category)) {
          // Custom category doesn't exist in target - copy it over
          const sourceCategoriesKey = this.selectedMapType === 'hex' ? 'customHexCategories' : 'customGridCategories';
          const sourceCategories = this.plugin.settings[sourceCategoriesKey] || [];
          const sourceCat = sourceCategories.find(c => c.id === obj.category);
          if (sourceCat) {
            if (!this.plugin.settings[targetCategoriesKey]) {
              this.plugin.settings[targetCategoriesKey] = [];
            }
            this.plugin.settings[targetCategoriesKey].push({ ...sourceCat });
          }
        }

        // Copy the object with new ID
        const copiedObj = { ...obj };
        delete copiedObj.isBuiltIn;
        delete copiedObj.isModified;
        delete copiedObj.isHidden;
        copiedObj.id = newId;
        copiedObj.category = targetCategory;

        this.plugin.settings[targetObjectsKey].push(copiedObj);

        this.settingsChanged = true;
        await this.plugin.saveSettings();
        new Notice(`Copied "${obj.label}" to ${targetLabel} maps`);
      };

      // Delete button for custom objects
      const deleteBtn = actions.createEl('button', { cls: 'dmt-settings-icon-btn dmt-settings-icon-btn-danger', attr: { 'aria-label': 'Delete', title: 'Delete object' } });
      IconHelpers.set(deleteBtn, 'trash-2');
      deleteBtn.onclick = async () => {
        if (await new ConfirmModal(this.app, {
            message: `Delete "${obj.label}"? Maps using this object will show a "?" placeholder.`,
            confirmText: 'Delete',
            isDestructive: true
          }).openAndGetValue()) {
          if (this.plugin.settings[customObjectsKey]) {
            this.plugin.settings[customObjectsKey] = this.plugin.settings[customObjectsKey].filter(o => o.id !== obj.id);
          }
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }
      };
    }
  },

  // ---------------------------------------------------------------------------
  // Object Sets block - rendered at top of Object Types section
  // ---------------------------------------------------------------------------

  renderObjectSetsBlock(containerEl) {
    const s = this.plugin.settings;
    const sets = s.objectSets || [];

    containerEl.createEl('div', { cls: 'dmt-settings-subheading', text: 'Object Sets' });
    containerEl.createEl('p', {
      text: 'Save and swap between named collections of object customizations.',
      cls: 'setting-item-description'
    });

    // Active Set indicator
    const activeSet = sets.find(st => st.id === s.activeObjectSetId);
    const isDirty = ObjectSetHelpers.isDirty(this.plugin);

    if (activeSet) {
      const bar = containerEl.createDiv({ cls: 'dmt-set-active-bar' });
      bar.createSpan({ text: 'Active set: ' });
      bar.createSpan({ text: activeSet.name, cls: 'dmt-set-active-name' });
      if (isDirty) {
        bar.createSpan({ text: ' (modified)', cls: 'dmt-set-modified-badge' });
      }
    } else if (isDirty) {
      const bar = containerEl.createDiv({ cls: 'dmt-set-active-bar dmt-set-modified-bar' });
      bar.createSpan({ text: 'Objects modified from defaults', cls: 'dmt-set-modified-badge' });
    }

    // Active Set dropdown
    new Setting(containerEl)
      .setName('Active Set')
      .setDesc('Switch to a saved set (overwrites current objects)')
      .addDropdown(dropdown => {
        dropdown.addOption('__defaults__', 'Defaults (built-in)');
        for (const set of sets) {
          const scope = [];
          if (set.data.hex) scope.push('hex');
          if (set.data.grid) scope.push('grid');
          dropdown.addOption(set.id, set.name + (scope.length ? ' [' + scope.join('+') + ']' : ''));
        }
        dropdown.setValue(s.activeObjectSetId || '__defaults__');
        dropdown.onChange(async (value) => {
          // Prompt to save current objects before switching
          if (isDirty) {
            if (await new ConfirmModal(this.app, {
              message: 'Save your current objects as a set before switching?',
              confirmText: 'Save',
              cancelText: value === '__defaults__' ? 'Reset Without Saving' : 'Switch Without Saving'
            }).openAndGetValue()) {
              const name = await new PromptModal(this.app, {
                message: 'Name for the saved set:',
                defaultValue: 'My Objects'
              }).openAndGetValue();
              if (name) {
                ObjectSetHelpers.saveCurrentAsSet(this.plugin, name);
              }
            }
          }

          if (value === '__defaults__') {
            ObjectSetHelpers.resetToDefaults(this.plugin);
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            window.dispatchEvent(new CustomEvent('dmt-settings-changed', {
              detail: { timestamp: Date.now() }
            }));
            this.display();
            return;
          }

          ObjectSetHelpers.activateSet(this.plugin, value);
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          window.dispatchEvent(new CustomEvent('dmt-settings-changed', {
            detail: { timestamp: Date.now() }
          }));
          this.display();
        });
      });

    // Saved Sets list
    if (sets.length > 0) {
      const listContainer = containerEl.createDiv({ cls: 'dmt-set-list' });
      for (const set of sets) {
        const row = listContainer.createDiv({ cls: 'dmt-set-row' });
        if (set.id === s.activeObjectSetId) row.addClass('dmt-set-row-active');

        // Name
        row.createSpan({ text: set.name, cls: 'dmt-set-name' });

        // Scope badges
        const badges = row.createSpan({ cls: 'dmt-set-badges' });
        if (set.data.hex) badges.createSpan({ text: 'hex', cls: 'dmt-set-badge' });
        if (set.data.grid) badges.createSpan({ text: 'grid', cls: 'dmt-set-badge' });
        badges.createSpan({ text: set.source, cls: 'dmt-set-badge dmt-set-badge-source' });

        // Actions
        const actions = row.createDiv({ cls: 'dmt-set-actions' });

        const renameBtn = actions.createEl('button', {
          cls: 'dmt-settings-icon-btn',
          attr: { 'aria-label': 'Rename', title: 'Rename set' }
        });
        IconHelpers.set(renameBtn, 'pencil');
        renameBtn.onclick = () => {
          new ObjectSetRenameModal(this.app, set.name, async (newName) => {
            ObjectSetHelpers.renameSet(this.plugin, set.id, newName);
            await this.plugin.saveSettings();
            this.display();
          }).open();
        };

        const exportBtn = actions.createEl('button', {
          cls: 'dmt-settings-icon-btn',
          attr: { 'aria-label': 'Export', title: 'Export set to folder' }
        });
        IconHelpers.set(exportBtn, 'download');
        exportBtn.onclick = () => {
          new ObjectSetExportModal(this.app, this.plugin, set).open();
        };

        const deleteBtn = actions.createEl('button', {
          cls: 'dmt-settings-icon-btn dmt-settings-icon-btn-danger',
          attr: { 'aria-label': 'Delete', title: 'Delete set' }
        });
        IconHelpers.set(deleteBtn, 'trash-2');
        deleteBtn.onclick = async () => {
          if (await new ConfirmModal(this.app, {
              message: 'Delete set "' + set.name + '"?',
              confirmText: 'Delete',
              isDestructive: true
            }).openAndGetValue()) {
            ObjectSetHelpers.deleteSet(this.plugin, set.id);
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }
        };
      }
    }

    // Action buttons
    const actionSetting = new Setting(containerEl)
      .setName('Manage Sets');

    actionSetting.addButton(btn => btn
      .setButtonText('Save Current as Set')
      .onClick(async () => {
        const name = await new PromptModal(this.app, {
          message: 'Name for the new set:',
          defaultValue: 'My Objects'
        }).openAndGetValue();
        if (!name) return;
        ObjectSetHelpers.saveCurrentAsSet(this.plugin, name);
        await this.plugin.saveSettings();
        new Notice('Saved set: ' + name);
        this.display();
      }));

    actionSetting.addButton(btn => btn
      .setButtonText('Import from Folder')
      .onClick(() => {
        new ObjectSetImportModal(this.app, this.plugin, async () => {
          this.settingsChanged = true;
          this.display();
        }).open();
      }));

    // Auto-Load Folder
    new Setting(containerEl)
      .setName('Auto-Load Folder')
      .setDesc('Vault folder to scan for object set packages on startup')
      .addSearch(search => {
        new FolderSuggest(this.app, search.inputEl);
        search
          .setPlaceholder('e.g. windrose-objects')
          .setValue(s.objectSetsAutoLoadFolder || '')
          .onChange(async (value) => {
            s.objectSetsAutoLoadFolder = value.trim();
            await this.plugin.saveSettings();
          });
      })
      .addButton(btn => btn
        .setButtonText('Scan Now')
        .onClick(async () => {
          const added = await ObjectSetHelpers.scanAutoLoadFolder(this.plugin);
          await this.plugin.saveSettings();
          if (added > 0) {
            new Notice('Found ' + added + ' new set(s)');
          } else {
            new Notice('No new sets found');
          }
          this.display();
        }));
  }

};

// Mix in the render methods to WindroseMDSettingsTab
Object.assign(WindroseMDSettingsTab.prototype, TabRenderCoreMethods);
Object.assign(WindroseMDSettingsTab.prototype, TabRenderSettingsMethods);
Object.assign(WindroseMDSettingsTab.prototype, TabRenderColorsMethods);
Object.assign(WindroseMDSettingsTab.prototype, TabRenderObjectsMethods);

module.exports = WindroseMDSettingsPlugin;