/**
 * partyRelatedNotes Unit Tests
 */

import { describe, it, expect } from 'vitest';

import type { RelatedNotesSource } from '../../../src/objects/partyRelatedNotes';
import {
  extractCacheTags,
  getRelatedByTags,
  getRelatedByBacklinks,
} from '../../../src/objects/partyRelatedNotes';

function makeSource(
  noteTags: Record<string, string[]>,
  resolvedLinks: Record<string, Record<string, number>> = {}
): RelatedNotesSource {
  return {
    noteTags: () => Object.entries(noteTags),
    resolvedLinks: () => resolvedLinks,
  };
}

describe('extractCacheTags', () => {
  it('collects inline and frontmatter tags, normalized', () => {
    const tags = extractCacheTags({
      tags: [{ tag: '#Settlement' }, { tag: '#visited' }],
      frontmatter: { tags: ['Coastal', '#trade'] },
    });
    expect(tags.sort()).toEqual(['coastal', 'settlement', 'trade', 'visited']);
  });

  it('splits comma-separated frontmatter tag strings', () => {
    expect(extractCacheTags({ frontmatter: { tags: 'a, b,c' } }).sort()).toEqual(['a', 'b', 'c']);
  });

  it('handles missing caches and duplicate tags', () => {
    expect(extractCacheTags(null)).toEqual([]);
    expect(extractCacheTags({ tags: [{ tag: '#x' }], frontmatter: { tags: 'x' } })).toEqual(['x']);
  });
});

describe('getRelatedByTags', () => {
  const source = makeSource({
    'Town.md': ['settlement', 'coastal'],
    'Port.md': ['settlement', 'coastal', 'trade'],
    'Village.md': ['settlement'],
    'Lair.md': ['dungeon'],
    'Party - Nearby.md': ['settlement'],
  });

  it('finds notes sharing tags, ranked by overlap', () => {
    const related = getRelatedByTags(source, 'Town.md', { cap: 5 });
    expect(related.paths).toEqual(['Port.md', 'Party - Nearby.md', 'Village.md']);
    expect(related.overflow).toBe(0);
  });

  it('excludes configured paths and the note itself', () => {
    const related = getRelatedByTags(source, 'Town.md', {
      cap: 5,
      excludePaths: ['Party - Nearby.md'],
    });
    expect(related.paths).toEqual(['Port.md', 'Village.md']);
  });

  it('ignores the filter tags that selected the result set', () => {
    const related = getRelatedByTags(source, 'Town.md', {
      cap: 5,
      excludeTags: ['settlement'],
      excludePaths: ['Party - Nearby.md'],
    });
    // Only 'coastal' similarity remains
    expect(related.paths).toEqual(['Port.md']);
  });

  it('caps results with an explicit overflow count', () => {
    const related = getRelatedByTags(source, 'Town.md', { cap: 1 });
    expect(related.paths).toEqual(['Port.md']);
    expect(related.overflow).toBe(2);
  });

  it('returns empty for notes without tags', () => {
    const bare = makeSource({ 'Empty.md': [], 'Other.md': ['x'] });
    expect(getRelatedByTags(bare, 'Empty.md', { cap: 5 }).paths).toEqual([]);
  });
});

describe('getRelatedByBacklinks', () => {
  const source = makeSource({}, {
    'Journal.md': { 'Town.md': 3 },
    'Rumors.md': { 'Town.md': 1, 'Lair.md': 2 },
    'Town.md': { 'Town.md': 1 },
    'Party - Nearby.md': { 'Town.md': 1 },
  });

  it('finds linking notes ranked by link count, excluding self', () => {
    const related = getRelatedByBacklinks(source, 'Town.md', { cap: 5 });
    expect(related.paths).toEqual(['Journal.md', 'Party - Nearby.md', 'Rumors.md']);
  });

  it('excludes configured paths and caps with overflow', () => {
    const related = getRelatedByBacklinks(source, 'Town.md', {
      cap: 1,
      excludePaths: ['Party - Nearby.md'],
    });
    expect(related.paths).toEqual(['Journal.md']);
    expect(related.overflow).toBe(1);
  });

  it('returns empty when nothing links to the note', () => {
    expect(getRelatedByBacklinks(source, 'Lonely.md', { cap: 5 }).paths).toEqual([]);
  });
});
