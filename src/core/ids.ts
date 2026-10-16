/**
 * Shared id minting. Persisted ids look like `<prefix>-<epoch ms>-<random base36>`.
 * The dominant shape uses 9 random chars; a few historical call sites (walls,
 * gaps, terrain strokes, curve splits, shapes, regions, outlines) use 6, kept
 * via `randomLength` so stored id format does not change.
 */

export interface MintIdOptions {
  /** Number of random base36 characters (default 9). */
  randomLength?: number;
}

const DEFAULT_RANDOM_LENGTH = 9;

export function mintId(prefix: string, options?: MintIdOptions): string {
  const length = options?.randomLength ?? DEFAULT_RANDOM_LENGTH;
  return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 2 + length);
}
