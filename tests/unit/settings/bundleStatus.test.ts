import { describe, it, expect } from 'vitest';
import {
  formatBundleBadge, isBundleBadgeProblem, collectBundleNotices, formatMegabytes, NOT_SYNCED_MESSAGE,
  INCOMPLETE_MESSAGE, shouldShowBundleNotice,
} from '../../../src/settings/helpers/bundleStatus';
import type { BundleStateLike } from '../../../src/settings/helpers/bundleStatus';

describe('formatBundleBadge', () => {
  it('reports loose folders with the scanned file count', () => {
    expect(formatBundleBadge({ state: 'loose', reason: '' }, { looseFiles: 42 })).toBe('Loose: 42 files');
    expect(formatBundleBadge({ state: 'loose', reason: '' }, { looseFiles: 1 })).toBe('Loose: 1 file');
    expect(formatBundleBadge({ state: 'loose', reason: '' }, { looseFiles: null })).toBe('Loose: counting files…');
  });

  it('reports bundled folders with tiles, shards and size', () => {
    const info: BundleStateLike = { state: 'mounted', reason: '' };
    expect(formatBundleBadge(info, { tiles: 5400, shards: { count: 12, bytes: 3.5 * 1024 * 1024 } }))
      .toBe('Bundled: 5400 tiles in 12 shards, 3.5 MB');
    expect(formatBundleBadge(info, { tiles: 3, shards: null })).toBe('Bundled: 3 tiles');
    expect(formatBundleBadge({ state: 'partial', reason: '' }, { tiles: 2, shards: { count: 1, bytes: 0 } }))
      .toBe('Bundled: 2 tiles in 1 shard, 0.0 MB (some tiles unreadable)');
  });

  it('words every failure state', () => {
    expect(formatBundleBadge({ state: 'not-on-device', reason: 'marker-missing' })).toBe('Bundle not on this device yet');
    expect(formatBundleBadge({ state: 'not-on-device', reason: 'folder-absent' })).toBe('Folder not found');
    expect(formatBundleBadge({ state: 'unmounted-corrupt', reason: 'index-hash-mismatch' }))
      .toBe('Bundle could not be loaded (index-hash-mismatch)');
    expect(formatBundleBadge({ state: 'unsupported-version', reason: 'major 2' })).toBe('Bundle needs a newer plugin version');
    expect(formatBundleBadge(null)).toBe('Checking folder…');
  });

  it('flags problems but not an absent folder', () => {
    expect(isBundleBadgeProblem({ state: 'not-on-device', reason: 'index-missing' })).toBe(true);
    expect(isBundleBadgeProblem({ state: 'not-on-device', reason: 'folder-absent' })).toBe(false);
    expect(isBundleBadgeProblem({ state: 'mounted', reason: '' })).toBe(false);
  });

  it('rounds megabytes above ten', () => {
    expect(formatMegabytes(123.4 * 1024 * 1024)).toBe('123 MB');
  });
});

describe('collectBundleNotices', () => {
  const states: Record<string, BundleStateLike> = {
    'Packs/synced': { state: 'mounted', reason: '' },
    'Packs/pending': { state: 'not-on-device', reason: 'marker-missing' },
    'Packs/typo': { state: 'not-on-device', reason: 'folder-absent' },
    'Packs/broken': { state: 'unmounted-corrupt', reason: 'index-hash-mismatch' },
    'Packs/future': { state: 'unsupported-version', reason: 'major 2' },
  };
  const getInfo = (f: string): BundleStateLike | null => states[f] ?? null;

  it('lists not-synced and failed bundles, skipping serving, absent and unknown folders', () => {
    const notices = collectBundleNotices(
      ['Packs/synced', 'Packs/pending/', 'Packs/typo', 'Packs/broken', 'Packs/future', 'Packs/unknown', '', 'Packs/pending'],
      getInfo,
    );
    expect(notices).toEqual([
      { folder: 'Packs/pending', kind: 'not-on-device', title: 'Packs/pending', message: NOT_SYNCED_MESSAGE },
      { folder: 'Packs/broken', kind: 'failed', title: null, message: 'Tile bundle in Packs/broken could not be loaded (index-hash-mismatch).' },
      { folder: 'Packs/future', kind: 'failed', title: null, message: 'Tile bundle in Packs/future could not be loaded (needs a newer plugin version).' },
    ]);
  });
});

describe('incomplete local import (index-missing)', () => {
  it('words index-missing as an unfinished import, not a Sync problem', () => {
    expect(formatBundleBadge({ state: 'not-on-device', reason: 'index-missing' }))
      .toBe('Tile bundle is incomplete (bundling did not finish)');
    expect(formatBundleBadge({ state: 'not-on-device', reason: 'no-index-no-shards' })).toBe('Bundle not on this device yet');
    const notices = collectBundleNotices(['P/half', 'P/sync'], f => (f === 'P/half'
      ? { state: 'not-on-device', reason: 'index-missing' }
      : { state: 'not-on-device', reason: 'marker-missing' }));
    expect(notices).toEqual([
      { folder: 'P/half', kind: 'failed', title: 'P/half', message: INCOMPLETE_MESSAGE },
      { folder: 'P/sync', kind: 'not-on-device', title: 'P/sync', message: NOT_SYNCED_MESSAGE },
    ]);
    expect(INCOMPLETE_MESSAGE).toContain('Tile bundle is incomplete (bundling did not finish)');
  });
});

describe('in-progress bundling', () => {
  const info = { state: 'not-on-device' as const, reason: 'index-missing' };
  it('shows Bundling... and no problem while a write runs', () => {
    expect(formatBundleBadge(info, { writing: true })).toBe('Bundling…');
    expect(isBundleBadgeProblem(info, true)).toBe(false);
    expect(isBundleBadgeProblem(info, false)).toBe(true);
    expect(formatBundleBadge(info, { writing: false })).toBe('Tile bundle is incomplete (bundling did not finish)');
  });
  it('words the browser notice for a hand-registered folder', () => {
    expect(INCOMPLETE_MESSAGE).toBe('Tile bundle is incomplete (bundling did not finish). Bundle the folder again, or re-import the pack, to complete it.');
  });
});

describe('shouldShowBundleNotice', () => {
  const notice = { folder: 'P/broken', kind: 'failed' as const, title: null, message: 'x' };
  const folders = ['P/broken', 'P/good'];

  it('hides the panel when a filter, not the bundle, emptied the list', () => {
    expect(shouldShowBundleNotice({ notices: [notice], folders, scopedTileCount: 0, filtersActive: true })).toBe(false);
    expect(shouldShowBundleNotice({ notices: [notice], folders, scopedTileCount: 12, filtersActive: false })).toBe(false);
  });

  it('shows the panel when the tilesets in scope contribute no tiles and nothing filters', () => {
    expect(shouldShowBundleNotice({ notices: [notice], folders, scopedTileCount: 0, filtersActive: false })).toBe(true);
  });

  it('shows the panel whenever every registered folder is failing', () => {
    expect(shouldShowBundleNotice({ notices: [notice], folders: ['P/broken/', 'P/broken'], scopedTileCount: 5, filtersActive: true }))
      .toBe(true);
  });

  it('never shows without notices', () => {
    expect(shouldShowBundleNotice({ notices: [], folders, scopedTileCount: 0, filtersActive: false })).toBe(false);
  });
});
