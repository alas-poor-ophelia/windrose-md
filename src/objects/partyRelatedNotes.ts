/**
 * partyRelatedNotes.ts
 *
 * Related-notes expansion for party pin results: for each in-range note,
 * find other vault notes sharing its tags, or notes that link to it
 * (backlinks). Lookups consume a caller-provided source backed by
 * Obsidian's in-memory metadata caches — no file reads here.
 *
 * Lists are capped with an explicit overflow count so the UI and the
 * generated note can render "+N more" instead of truncating silently.
 */

/** Related notes for one result, capped */
export interface RelatedNotes {
  paths: string[];
  /** How many further related notes the cap cut off */
  overflow: number;
}

/** Minimal metadata surface consumed by the lookups */
export interface RelatedNotesSource {
  /** Every markdown note path with its tags (lowercased, no leading #) */
  noteTags: () => Iterable<[string, string[]]>;
  /** resolvedLinks-shaped map: source path → { target path: link count } */
  resolvedLinks: () => Record<string, Record<string, number>>;
}

interface RelatedNotesOptions {
  /** Tags that selected the result set — excluded from similarity (PP-27) */
  excludeTags?: string[];
  /** Paths never reported (the note itself is always excluded) */
  excludePaths?: string[];
  /** Maximum related paths returned */
  cap: number;
}

/**
 * Extract a note's tags from an Obsidian metadata cache entry:
 * inline tags plus frontmatter tags (string, comma string, or array).
 * Returned lowercased without the leading #.
 */
function extractCacheTags(cache: {
  tags?: Array<{ tag: string }>;
  frontmatter?: Record<string, unknown>;
} | null): string[] {
  if (cache == null) return [];
  const collected = new Set<string>();

  for (const entry of cache.tags ?? []) {
    collected.add(entry.tag.replace(/^#/, '').toLowerCase());
  }

  const rawFrontmatterTags = cache.frontmatter?.tags ?? cache.frontmatter?.tag;
  const frontmatterTags = Array.isArray(rawFrontmatterTags)
    ? rawFrontmatterTags
    : typeof rawFrontmatterTags === 'string'
      ? rawFrontmatterTags.split(',')
      : [];
  for (const tag of frontmatterTags) {
    if (typeof tag !== 'string') continue;
    const cleaned = tag.replace(/^#/, '').trim().toLowerCase();
    if (cleaned !== '') collected.add(cleaned);
  }

  return Array.from(collected);
}

/**
 * Other vault notes sharing at least one of the note's tags.
 * Ranked by shared-tag count, ties broken by path.
 */
function getRelatedByTags(
  source: RelatedNotesSource,
  notePath: string,
  options: RelatedNotesOptions
): RelatedNotes {
  const excluded = new Set([notePath, ...(options.excludePaths ?? [])]);
  const excludedTags = new Set((options.excludeTags ?? []).map(t => t.replace(/^#/, '').toLowerCase()));

  let ownTags: Set<string> | null = null;
  const candidates: Array<[string, string[]]> = [];
  for (const [path, tags] of source.noteTags()) {
    if (path === notePath) {
      ownTags = new Set(tags.filter(t => !excludedTags.has(t)));
    }
    if (!excluded.has(path)) candidates.push([path, tags]);
  }
  if (ownTags == null || ownTags.size === 0) return { paths: [], overflow: 0 };

  const scored: Array<{ path: string; shared: number }> = [];
  for (const [path, tags] of candidates) {
    const shared = tags.filter(t => ownTags.has(t)).length;
    if (shared > 0) scored.push({ path, shared });
  }
  scored.sort((a, b) => b.shared - a.shared || a.path.localeCompare(b.path));

  return {
    paths: scored.slice(0, options.cap).map(s => s.path),
    overflow: Math.max(0, scored.length - options.cap)
  };
}

/**
 * Notes that link to the given note.
 * Ranked by link count, ties broken by path.
 */
function getRelatedByBacklinks(
  source: RelatedNotesSource,
  notePath: string,
  options: RelatedNotesOptions
): RelatedNotes {
  const excluded = new Set([notePath, ...(options.excludePaths ?? [])]);
  const links = source.resolvedLinks();

  const scored: Array<{ path: string; count: number }> = [];
  for (const sourcePath of Object.keys(links)) {
    if (excluded.has(sourcePath)) continue;
    const count = links[sourcePath][notePath];
    if (count != null && count > 0) scored.push({ path: sourcePath, count });
  }
  scored.sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));

  return {
    paths: scored.slice(0, options.cap).map(s => s.path),
    overflow: Math.max(0, scored.length - options.cap)
  };
}

export { extractCacheTags, getRelatedByTags, getRelatedByBacklinks };
