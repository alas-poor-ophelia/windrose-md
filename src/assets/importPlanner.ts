/**
 * importPlanner.ts
 *
 * Pure engines behind the "Add tiles" import wizard:
 *   - step ② "Map folders → tiers": aggregate per-tile depth predictions into
 *     one confident-or-check tier vote per subfolder.
 *   - step ③ "Tags": mine candidate tags from filenames with counts, matched
 *     paths, and a sample filename for the highlight row.
 *
 * Both are pure functions over TileEntry[] so the wizard modal stays a thin
 * shell and the logic is unit-testable.
 */

import type { TileEntry, TileLayerRole } from '#types/tiles/tile.types';
import { predictDepthTier, extractTokens } from './depthPredictor';
import { NOISE } from './categoryMerge';

/** Winning tier's mean confidence must reach this for the 'auto' badge. */
export const TIER_AUTO_THRESHOLD = 0.3;
/** A mined tag must match at least this many tiles to be suggested. */
export const TAG_MIN_COUNT = 2;
/** Cap on suggestions so a 3000-file pack doesn't produce a wall of rows. */
export const TAG_MAX_SUGGESTIONS = 30;
/** Tokens shorter than this are variant letters/particles, not tags. */
const TAG_MIN_LENGTH = 3;

export interface FolderTierRow {
  /** Raw category path as scanned ('' for files at the folder root). */
  category: string;
  /** Human display path: 'Floors / Stone' ('(root)' for loose files). */
  displayPath: string;
  tileCount: number;
  /** Confidence-weighted majority vote across the folder's tiles. */
  tier: TileLayerRole;
  /** True when the vote is confident; false renders the 'check' badge. */
  auto: boolean;
  /** Vault paths in this folder — Finish applies the chosen tier to these. */
  paths: string[];
}

/**
 * Group tiles by subfolder category and vote a depth tier per folder.
 * Rows come back in scan order (stable for the wizard's table).
 */
export function aggregateFolderTiers(tiles: TileEntry[]): FolderTierRow[] {
  const groups = new Map<string, TileEntry[]>();
  for (const tile of tiles) {
    const key = tile.category ?? '';
    const group = groups.get(key);
    if (group != null) group.push(tile);
    else groups.set(key, [tile]);
  }

  const rows: FolderTierRow[] = [];
  for (const [category, group] of groups) {
    const scores: Record<TileLayerRole, number> = {
      ground: 0, structure: 0, props: 0, decoration: 0,
    };
    for (const tile of group) {
      const { tier, confidence } = predictDepthTier(tile, undefined);
      scores[tier] += confidence;
    }
    let winner: TileLayerRole = 'props';
    let best = 0;
    for (const tier of Object.keys(scores) as TileLayerRole[]) {
      if (scores[tier] > best) {
        best = scores[tier];
        winner = tier;
      }
    }
    rows.push({
      category,
      displayPath: category === '' ? '(root)' : category.split('/').join(' / '),
      tileCount: group.length,
      tier: winner,
      auto: best / group.length >= TIER_AUTO_THRESHOLD,
      paths: group.map(t => t.vaultPath),
    });
  }
  return rows;
}

export interface TagSuggestion {
  tag: string;
  /** Number of distinct tiles whose filename contains the token. */
  count: number;
  /** Vault paths of the matching tiles — apply writes the tag to these. */
  paths: string[];
  /** First matching filename, with the matched span for highlighting. */
  sample: { filename: string; start: number; length: number };
}

/**
 * Mine candidate tags from filenames: tokenize, drop noise/short/numeric
 * tokens and tokens the tile's own subfolder already supplies as folder
 * tags, then count distinct tiles per token.
 */
export function mineFilenameTags(tiles: TileEntry[]): TagSuggestion[] {
  const byTag = new Map<string, { paths: string[]; sample: TagSuggestion['sample'] }>();

  for (const tile of tiles) {
    // Tokens the subfolder already supplies via folderTags — redundant as
    // mined suggestions for THIS tile (but still countable from other folders).
    const folderTokens = new Set<string>();
    for (const segment of (tile.category ?? '').split('/')) {
      for (const tok of extractTokens(segment)) folderTokens.add(tok);
    }

    const seen = new Set<string>();
    for (const tok of extractTokens(tile.filename)) {
      if (tok.length < TAG_MIN_LENGTH || NOISE.has(tok) || folderTokens.has(tok)) continue;
      if (seen.has(tok)) continue;
      seen.add(tok);

      let entry = byTag.get(tok);
      if (entry == null) {
        const lower = tile.filename.toLowerCase();
        const start = lower.indexOf(tok);
        entry = { paths: [], sample: { filename: tile.filename, start, length: tok.length } };
        byTag.set(tok, entry);
      }
      entry.paths.push(tile.vaultPath);
    }
  }

  return Array.from(byTag.entries())
    .filter(([, e]) => e.paths.length >= TAG_MIN_COUNT)
    .sort((a, b) => b[1].paths.length - a[1].paths.length || a[0].localeCompare(b[0]))
    .slice(0, TAG_MAX_SUGGESTIONS)
    .map(([tag, e]) => ({ tag, count: e.paths.length, paths: e.paths, sample: e.sample }));
}
