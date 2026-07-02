/**
 * Category normalization & cross-pack merge engine.
 *
 * Tile packs arrive organized by import-time folder structure, producing dozens of
 * inconsistent sibling folders ("Hex Forest", "Forest Hex Tiles", "Foliage/Forest")
 * that should be ONE category. This engine collapses them:
 *
 *   1. tokenize a raw folder name (split parens/camelCase/delimiters, lowercase, strip non-alpha)
 *   2. drop grid/packaging NOISE words ("hex", "tiles", "set", ...)
 *   3. ALIAS synonyms/material variants to a canonical token ("flooring"->"floors", "plank"->"wood")
 *   4. greedily cluster the remaining token sets by Sorensen-Dice >= MERGE_THRESHOLD;
 *      the curated/"Core" pack's folder seeds the canonical label.
 *
 * Tuned for recall (~70-85% accuracy) over a clean first pass — every merge is meant to be
 * reviewable on import and mass-editable later. This module is PURE and data-agnostic; wiring to
 * real TileEntry.category happens at the call site (Phase 2), as a read-time projection.
 */

const MERGE_THRESHOLD = 0.6;

const NOISE: ReadonlySet<string> = new Set([
  'hex', 'hexes', 'hexagonal', 'square', 'squares', 'grid', 'gridded',
  'tile', 'tiles', 'tileset', 'tilesets', 'set', 'sets', 'pack', 'packs',
  'assets', 'art', 'the', 'and', 'of', 'a', 'an',
]);

const ALIAS: ReadonlyMap<string, string> = new Map([
  ['flooring', 'floors'], ['floor', 'floors'],
  ['plank', 'wood'], ['planks', 'wood'], ['boards', 'wood'], ['timber', 'wood'], ['wooden', 'wood'],
  ['flagstone', 'stone'], ['cobble', 'stone'], ['cobbles', 'stone'], ['cobblestone', 'stone'],
  ['cavern', 'caverns'], ['cave', 'caverns'], ['caves', 'caverns'],
  ['wall', 'walls'],
  ['door', 'doors'], ['portal', 'doors'], ['portals', 'doors'],
  ['furnishing', 'furniture'], ['furnishings', 'furniture'],
  ['crate', 'containers'], ['crates', 'containers'], ['barrel', 'containers'],
  ['barrels', 'containers'], ['basket', 'containers'], ['container', 'containers'],
  ['river', 'rivers'], ['coast', 'coasts'], ['lake', 'lakes'], ['water', 'rivers'],
]);

interface FolderInput {
  /** the messy import-time folder/category name */
  raw: string;
  /** pack id, retained as provenance (Pack becomes a filter facet, not a rail row) */
  pack: string;
  /** true if from the curated/"Core" pack — its folder seeds the canonical label */
  curated?: boolean;
}

interface MergeMember {
  raw: string;
  pack: string;
  /** Dice score vs the cluster at join time (1 for the seed folder) */
  score: number;
}

interface MergeCluster {
  /** canonical display label */
  label: string;
  /** canonical normalized token set */
  tokens: ReadonlySet<string>;
  /** source folders collapsed into this cluster */
  members: MergeMember[];
  /** true when more than one source folder collapsed here */
  merged: boolean;
}

/**
 * Normalize a raw folder name into a token set: drop [bracketed] runs, split
 * parens/camelCase/delimiters, lowercase, strip non-alpha, drop NOISE, then
 * apply ALIAS (and drop NOISE again).
 */
function normalizeTokens(raw: string): Set<string> {
  const out = new Set<string>();
  const spaced = raw
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2');
  for (const piece of spaced.split(/[/_\-\s&,]+/)) {
    let tok = piece.toLowerCase().replace(/[^a-z]/g, '');
    if (tok === '' || NOISE.has(tok)) {
      continue;
    }
    const aliased = ALIAS.get(tok);
    if (aliased !== undefined) {
      tok = aliased;
    }
    if (NOISE.has(tok)) {
      continue;
    }
    out.add(tok);
  }
  return out;
}

const HEX_WORDS: ReadonlySet<string> = new Set(['hex', 'hexes', 'hexagonal', 'hexagon']);
const GRID_WORDS: ReadonlySet<string> = new Set(['square', 'squares', 'grid', 'gridded', 'gridmap']);

/**
 * Detect the geometry a folder/tag set EXPLICITLY declares, for the tile drawer's
 * silent hex-vs-grid scope. Conservative by design: returns a geometry only on a
 * positive, unambiguous signal; absent (undefined) means geometry-agnostic and the
 * tile shows on every map type ("a crate is a crate"). A folder/tag set that names
 * BOTH geometries is treated as agnostic rather than guessed. Returned values match
 * the map's own `mapType` vocabulary ('hex' | 'grid') so the caller can compare directly.
 */
function detectTileGeometry(raw: string, tags?: readonly string[]): 'hex' | 'grid' | undefined {
  let hex = false;
  let grid = false;
  const spaced = (raw + ' ' + (tags?.join(' ') ?? ''))
    .replace(/[()]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2');
  for (const piece of spaced.split(/[/_\-\s&,#]+/)) {
    const tok = piece.toLowerCase().replace(/[^a-z]/g, '');
    if (tok === '') {
      continue;
    }
    if (HEX_WORDS.has(tok)) {
      hex = true;
    } else if (GRID_WORDS.has(tok)) {
      grid = true;
    }
  }
  if (hex === grid) {
    return undefined; // neither signalled, or both did → agnostic
  }
  return hex ? 'hex' : 'grid';
}

/**
 * Human-readable label for a raw folder: strip [bracketed] runs (pack/artist
 * prefixes like "[EA]"), parens, and NOISE words but keep original casing and
 * order. Falls back through the bracket-stripped raw, then the trimmed raw, if
 * every word was noise.
 */
function cleanLabel(raw: string): string {
  const debracketed = raw.replace(/\[[^\]]*\]/g, ' ');
  const words = debracketed
    .trim()
    .replace(/[()]/g, ' ')
    .split(/\s+/)
    .filter(w => {
      const t = w.toLowerCase().replace(/[^a-z]/g, '');
      return !NOISE.has(t);
    });
  const label = words.join(' ').replace(/\s+&\s+/g, ' & ').replace(/\s+,/g, ',').trim();
  if (label !== '') return label;
  // Bracket-only names ("[EA]") keep their inner text rather than the brackets.
  const inner = raw.replace(/[[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  return inner === '' ? raw.trim() : inner;
}

/** Sorensen-Dice coefficient on two token sets. 0 if either is empty. */
function diceCoefficient(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) {
      intersection += 1;
    }
  }
  return (2 * intersection) / (a.size + b.size);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Greedily cluster folders by Dice similarity of their token sets (declaration order,
 * highest-scoring cluster wins, threshold MERGE_THRESHOLD). The curated/"Core" pack's
 * folder, when it joins, takes over the cluster's canonical label and token set.
 */
function clusterCategories(folders: readonly FolderInput[]): MergeCluster[] {
  const clusters: MergeCluster[] = [];

  for (const f of folders) {
    const tokens = normalizeTokens(f.raw);

    let best: MergeCluster | null = null;
    let bestScore = 0;
    for (const c of clusters) {
      const score = diceCoefficient(tokens, c.tokens);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }

    if (best !== null && bestScore >= MERGE_THRESHOLD) {
      best.members.push({ raw: f.raw, pack: f.pack, score: round2(bestScore) });
      best.merged = true;
      if (f.curated === true) {
        best.label = cleanLabel(f.raw);
        best.tokens = tokens;
      }
    } else {
      clusters.push({
        label: cleanLabel(f.raw),
        tokens,
        members: [{ raw: f.raw, pack: f.pack, score: 1 }],
        merged: false,
      });
    }
  }

  return clusters;
}

/**
 * Humanize a tileset/pack name for chip + filter display: split camelCase and
 * acronym-word runs, normalize separators, and drop trailing version/dev tokens.
 * "FCWallsDev1" → "FC Walls", "hex_samples_v2" → "hex samples", "Hex Samples"
 * unchanged. Falls back to the raw name if humanizing empties it.
 */
function humanizePackName(name: string): string {
  let s = name
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // ACRONYMWord → ACRONYM Word
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')     // camelCase → spaced
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Drop a trailing dev/version/build marker (with optional number), then a
  // bare trailing number — both only when preceded by a space, so single-word
  // names and embedded digits survive.
  s = s.replace(/\s+(dev|build|rev|version|ver|v)\s*\d*$/i, '').trim();
  s = s.replace(/\s+\d+$/, '').trim();
  return s === '' ? name.trim() : s;
}

export {
  MERGE_THRESHOLD,
  NOISE,
  ALIAS,
  normalizeTokens,
  cleanLabel,
  detectTileGeometry,
  humanizePackName,
  diceCoefficient,
  clusterCategories,
};
export type { FolderInput, MergeMember, MergeCluster };
