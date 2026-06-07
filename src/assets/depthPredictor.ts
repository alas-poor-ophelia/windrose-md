import type { TileEntry, TileLayerRole, TileMetadataEntry, TileMetadataStore } from '#types/tiles/tile.types';

const DD_PATH_TO_DEPTH: Record<string, TileLayerRole> = {
  'textures/terrain': 'ground',
  'textures/patterns': 'ground',
  'textures/tilesets': 'ground',
  'textures/walls': 'structure',
  'textures/materials': 'structure',
  'textures/portals': 'structure',
  'textures/paths': 'structure',
  'textures/lights': 'decoration',
  'textures/objects': 'props',
};

const DD_TAG_TO_DEPTH: Record<string, TileLayerRole> = {
  furniture: 'props',
  lighting: 'decoration',
  interior: 'props',
  exterior: 'props',
  natural: 'props',
  structural: 'structure',
  administration: 'props',
  animals: 'props',
  armor: 'props',
  obstacle: 'structure',
  pillar: 'structure',
  magic: 'decoration',
  'molds and stains': 'decoration',
  'planks and debris': 'decoration',
  'paper and books': 'props',
  mine: 'structure',
  mill: 'structure',
  ocean: 'ground',
  cobweb: 'decoration',
};

const HEAD_NOUN_KEYWORDS: Record<string, TileLayerRole> = {
  // Ground — surfaces, terrain, floors
  floor: 'ground', floors: 'ground', ground: 'ground', terrain: 'ground',
  grass: 'ground', dirt: 'ground', sand: 'ground', mud: 'ground',
  gravel: 'ground', cobblestone: 'ground', cobble: 'ground',
  pavement: 'ground', paving: 'ground', flagstone: 'ground',
  tile: 'ground', tiles: 'ground', planks: 'ground',
  lava: 'ground', ice: 'ground', snow: 'ground',
  swamp: 'ground', marsh: 'ground', water: 'ground',
  ocean: 'ground', river: 'ground', pond: 'ground', lake: 'ground',
  cave: 'ground', carpet: 'ground', rug: 'ground',

  // Structure — walls, architectural elements
  wall: 'structure', walls: 'structure',
  door: 'structure', doors: 'structure',
  gate: 'structure', gates: 'structure',
  pillar: 'structure', pillars: 'structure',
  column: 'structure', columns: 'structure',
  arch: 'structure', arches: 'structure', archway: 'structure',
  fence: 'structure', fences: 'structure',
  railing: 'structure', railings: 'structure',
  bridge: 'structure', bridges: 'structure',
  stairs: 'structure', staircase: 'structure', stairway: 'structure',
  step: 'structure', steps: 'structure',
  ladder: 'structure', ladders: 'structure',
  roof: 'structure', roofs: 'structure', ceiling: 'structure',
  window: 'structure', windows: 'structure',
  beam: 'structure', beams: 'structure', buttress: 'structure',
  portal: 'structure', portcullis: 'structure', drawbridge: 'structure',
  trapdoor: 'structure', hatch: 'structure',
  pit: 'structure', cliff: 'structure', cliffs: 'structure',
  ledge: 'structure', platform: 'structure', balcony: 'structure',
  rampart: 'structure', battlement: 'structure', parapet: 'structure',
  tower: 'structure',

  // Props — objects, furniture, interactables
  table: 'props', tables: 'props',
  chair: 'props', chairs: 'props',
  bench: 'props', benches: 'props',
  stool: 'props', stools: 'props', throne: 'props',
  bed: 'props', beds: 'props',
  mattress: 'props', mattresses: 'props',
  ottoman: 'props', ottomans: 'props',
  armchair: 'props', armchairs: 'props',
  couch: 'props', sofa: 'props', desk: 'props',
  shelf: 'props', shelves: 'props',
  bookshelf: 'props', bookshelves: 'props',
  cabinet: 'props', wardrobe: 'props', dresser: 'props',
  nightstand: 'props', counter: 'props',
  chest: 'props', chests: 'props',
  barrel: 'props', barrels: 'props',
  crate: 'props', crates: 'props',
  box: 'props', boxes: 'props',
  sack: 'props', sacks: 'props', bag: 'props',
  basket: 'props', urn: 'props',
  pot: 'props', pots: 'props', cauldron: 'props',
  lever: 'props', switch: 'props',
  trap: 'props', traps: 'props',
  spike: 'props', spikes: 'props',
  anvil: 'props', forge: 'props', furnace: 'props', oven: 'props',
  well: 'props', fountain: 'props',
  altar: 'props', shrine: 'props',
  statue: 'props', statues: 'props',
  sarcophagus: 'props', coffin: 'props', tomb: 'props', grave: 'props',
  fireplace: 'props', hearth: 'props',
  mirror: 'props', clock: 'props',
  book: 'props', books: 'props', scroll: 'props', map: 'props',
  weapon: 'props', weapons: 'props', armor: 'props', shield: 'props',
  rack: 'props',
  tree: 'props', trees: 'props',
  bush: 'props', shrub: 'props',
  boulder: 'props', rock: 'props', rocks: 'props',
  log: 'props', stump: 'props',
  mushroom: 'props', mushrooms: 'props',

  // Decoration — overlays, effects, detail
  candle: 'decoration', candles: 'decoration',
  torch: 'decoration', torches: 'decoration',
  lantern: 'decoration', lanterns: 'decoration',
  lamp: 'decoration', lamps: 'decoration',
  chandelier: 'decoration', sconce: 'decoration',
  brazier: 'decoration', campfire: 'decoration', fire: 'decoration',
  banner: 'decoration', banners: 'decoration',
  flag: 'decoration', flags: 'decoration',
  tapestry: 'decoration', painting: 'decoration', portrait: 'decoration',
  sign: 'decoration', plaque: 'decoration',
  moss: 'decoration', vine: 'decoration', vines: 'decoration', ivy: 'decoration',
  cobweb: 'decoration', cobwebs: 'decoration', web: 'decoration',
  crack: 'decoration', cracks: 'decoration',
  stain: 'decoration', stains: 'decoration',
  mold: 'decoration', molds: 'decoration',
  debris: 'decoration', rubble: 'decoration', dust: 'decoration',
  blood: 'decoration', splatter: 'decoration', scratch: 'decoration',
  curtain: 'decoration', curtains: 'decoration',
  drape: 'decoration', drapes: 'decoration',
  rope: 'decoration', chain: 'decoration', chains: 'decoration',
  skull: 'decoration', bone: 'decoration', bones: 'decoration',
  skeleton: 'decoration',
  flower: 'decoration', flowers: 'decoration',
  plant: 'decoration', fern: 'decoration',
  overlay: 'decoration', decal: 'decoration', effect: 'decoration',
  glow: 'decoration', symbol: 'decoration',
  rune: 'decoration', runes: 'decoration',
};

interface DepthPrediction {
  tier: TileLayerRole;
  confidence: number;
}

function extractTokens(filename: string): string[] {
  const dotIdx = filename.indexOf('.');
  const name = dotIdx > 0 ? filename.slice(0, dotIdx) : filename;
  return name
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .split(/[_\-\s]+/)
    .map(t => t.toLowerCase().replace(/\d+[a-z]?$/, ''))
    .filter(t => t.length > 0);
}

function predictDepthTier(
  tile: TileEntry,
  entry: TileMetadataEntry | undefined
): DepthPrediction {
  const scores: Record<TileLayerRole, number> = {
    ground: 0, structure: 0, props: 0, decoration: 0,
  };

  // Signal 1: DD source path (weight 0.50)
  const sourceType = entry?.ddSourceType;
  if (sourceType != null) {
    const key = `textures/${sourceType}`;
    const mapped = DD_PATH_TO_DEPTH[key];
    if (mapped != null) scores[mapped] += 0.50;
  }

  // Signal 2: Head noun from filename (weight 0.30)
  const tokens = extractTokens(tile.filename);
  if (tokens.length > 0) {
    const last = tokens[tokens.length - 1];
    const first = tokens[0];
    const lastMatch = HEAD_NOUN_KEYWORDS[last];
    const firstMatch = tokens.length > 1 ? HEAD_NOUN_KEYWORDS[first] : undefined;
    if (lastMatch != null) {
      scores[lastMatch] += 0.30;
    } else if (firstMatch != null) {
      scores[firstMatch] += 0.25;
    }
  }

  // Signal 3: Tags + category (weight 0.15)
  const allTags = [
    ...(tile.tags ?? []),
    ...(entry?.importTags ?? []),
    ...(entry?.userTags ?? []),
  ];
  if (tile.category != null) allTags.push(tile.category);
  for (const tag of allTags) {
    const mapped = DD_TAG_TO_DEPTH[tag.toLowerCase()];
    if (mapped != null) {
      scores[mapped] += 0.15 / Math.max(allTags.length, 1);
    }
    const tagTokens = extractTokens(tag);
    for (const t of tagTokens) {
      const kw = HEAD_NOUN_KEYWORDS[t];
      if (kw != null) {
        scores[kw] += 0.05 / Math.max(allTags.length, 1);
      }
    }
  }

  let best: TileLayerRole = 'props';
  let bestScore = 0;
  for (const [tier, score] of Object.entries(scores) as Array<[TileLayerRole, number]>) {
    if (score > bestScore) {
      bestScore = score;
      best = tier;
    }
  }

  return { tier: best, confidence: Math.min(bestScore, 1.0) };
}

function predictDepthTiers(
  tiles: TileEntry[],
  metadata: TileMetadataStore
): Map<string, DepthPrediction> {
  const results = new Map<string, DepthPrediction>();
  for (const tile of tiles) {
    const entry = metadata[tile.vaultPath];
    results.set(tile.vaultPath, predictDepthTier(tile, entry));
  }
  return results;
}

export { extractTokens, predictDepthTier, predictDepthTiers, HEAD_NOUN_KEYWORDS, DD_PATH_TO_DEPTH, DD_TAG_TO_DEPTH };
export type { DepthPrediction };
