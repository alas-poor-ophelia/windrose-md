/**
 * bundleStatus.ts
 * Pure wording for tile-bundle status: the per-folder badge in the Tile sets
 * settings section and the tile browser's empty-state notices. Inputs come
 * from the bundle registry (getBundleStateInfo); nothing here reads the vault.
 *
 * `folder-absent` is the registry's answer for a folder that does not exist
 * at all. That is a mistyped or deleted path, not a bundle that has yet to
 * sync, so it never produces a "not on this device" notice.
 */

import type { BundleState } from '../../assets/bundles/bundleRegistry';

interface BundleStateLike {
  state: BundleState;
  reason: string;
}

interface BundleBadgeCounts {
  /** Image files found by the loose scan; null while unknown. */
  looseFiles?: number | null;
  /** Bundled tile entries (mounted/partial). */
  tiles?: number;
  /** Shard files and their total size; null while unknown. */
  shards?: { count: number; bytes: number } | null;
}

interface BundleNotice {
  folder: string;
  kind: 'not-on-device' | 'failed';
  /** Heading shown above the sentence (the folder), or null when the sentence names it. */
  title: string | null;
  message: string;
}

const NOT_SYNCED_MESSAGE = "This pack's bundle files have not synced to this device. In Sync settings, turn on Sync all other types.";

/** `index-missing` with the marker present: an import on this device stopped before its commit point. */
const INCOMPLETE_MESSAGE = 'Tile bundle is incomplete (import did not finish). Import the pack again to complete it.';

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function formatMegabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

/** Short status line for one tileset folder. Null info = not looked at yet. */
function formatBundleBadge(info: BundleStateLike | null, counts: BundleBadgeCounts = {}): string {
  if (info == null) return 'Checking folder…';
  switch (info.state) {
    case 'loose':
      return counts.looseFiles == null ? 'Loose: counting files…' : `Loose: ${plural(counts.looseFiles, 'file', 'files')}`;
    case 'mounted':
    case 'partial': {
      let line = `Bundled: ${plural(counts.tiles ?? 0, 'tile', 'tiles')}`;
      if (counts.shards != null) {
        line += ` in ${plural(counts.shards.count, 'shard', 'shards')}, ${formatMegabytes(counts.shards.bytes)}`;
      }
      if (info.state === 'partial') line += ' (some tiles unreadable)';
      return line;
    }
    case 'not-on-device':
      if (info.reason === 'folder-absent') return 'Folder not found';
      return info.reason === 'index-missing' ? 'Tile bundle is incomplete (import did not finish)' : 'Bundle not on this device yet';
    case 'unmounted-corrupt':
      return `Bundle could not be loaded (${info.reason !== '' ? info.reason : 'corrupt index'})`;
    case 'unsupported-version':
      return 'Bundle needs a newer plugin version';
  }
}

/** True when the badge describes a problem the user should notice. */
function isBundleBadgeProblem(info: BundleStateLike | null): boolean {
  if (info == null) return false;
  return info.state === 'unmounted-corrupt' || info.state === 'unsupported-version'
    || (info.state === 'not-on-device' && info.reason !== 'folder-absent');
}

/** Empty-state notices for every registered folder whose bundle serves nothing. */
function collectBundleNotices(
  folders: readonly string[],
  getInfo: (folder: string) => BundleStateLike | null,
): BundleNotice[] {
  const notices: BundleNotice[] = [];
  const seen = new Set<string>();
  for (const raw of folders) {
    const folder = raw.trim().replace(/\/+$/, '');
    if (folder === '' || seen.has(folder)) continue;
    seen.add(folder);
    const info = getInfo(folder);
    if (info == null) continue;
    if (info.state === 'not-on-device' && info.reason === 'index-missing') {
      notices.push({ folder, kind: 'failed', title: folder, message: INCOMPLETE_MESSAGE });
    } else if (info.state === 'not-on-device' && info.reason !== 'folder-absent') {
      notices.push({ folder, kind: 'not-on-device', title: folder, message: NOT_SYNCED_MESSAGE });
    } else if (info.state === 'unmounted-corrupt' || info.state === 'unsupported-version') {
      const reason = info.state === 'unsupported-version'
        ? 'needs a newer plugin version'
        : (info.reason !== '' ? info.reason : 'corrupt index');
      notices.push({ folder, kind: 'failed', title: null, message: `Tile bundle in ${folder} could not be loaded (${reason}).` });
    }
  }
  return notices;
}

/**
 * Whether the tile browser's empty state should show the bundle notices.
 * Only when the tilesets in scope contribute no tiles at all and no filter
 * (search, tag, pack, category) is narrowing them, or when every registered
 * folder is in a failure state. A filter that yields nothing is not a bundle
 * problem, and one broken folder must not explain another's empty result.
 */
function shouldShowBundleNotice(opts: {
  notices: readonly BundleNotice[];
  folders: readonly string[];
  scopedTileCount: number;
  filtersActive: boolean;
}): boolean {
  if (opts.notices.length === 0) return false;
  const distinct = new Set(opts.folders.map(f => f.trim().replace(/\/+$/, '')).filter(f => f !== ''));
  if (distinct.size > 0 && opts.notices.length >= distinct.size) return true;
  return opts.scopedTileCount === 0 && !opts.filtersActive;
}

export {
  formatBundleBadge, isBundleBadgeProblem, collectBundleNotices, shouldShowBundleNotice, formatMegabytes,
  NOT_SYNCED_MESSAGE, INCOMPLETE_MESSAGE,
};
export type { BundleBadgeCounts, BundleNotice, BundleStateLike };
