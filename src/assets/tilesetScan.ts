/**
 * tilesetScan.ts
 * Folder scanning for tile images (adapter.list based, concurrent scans deduped).
 */

import type { TileEntry } from '#types/tiles/tile.types';
import type { App } from 'obsidian';
import { mintTileId } from './tileIds';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

/**
 * Scan a vault folder for tile images using adapter.list() for folder-scoped
 * listing instead of vault.getFiles() which walks every file in the vault.
 * Returns TileEntry[] with subfolder-based categories.
 */
// In-flight scans keyed by normalized folder (MEM-11): a settings save
// rebuilds tilesets in EVERY mounted map at once; concurrent requests for the
// same folder share one walk. Each caller gets its own array copy.
const inFlightScans = new Map<string, Promise<TileEntry[]>>();

async function scanTilesetFolder(app: App, folderPath: string): Promise<TileEntry[]> {
  const key = folderPath.endsWith('/') ? folderPath.slice(0, -1) : folderPath;
  let scan = inFlightScans.get(key);
  if (scan == null) {
    scan = walkTilesetFolder(app, key).finally(() => { inFlightScans.delete(key); });
    inFlightScans.set(key, scan);
  }
  return [...(await scan)];
}

async function walkTilesetFolder(app: App, folderPath: string): Promise<TileEntry[]> {
  const normalizedFolder = folderPath.endsWith('/')
    ? folderPath.slice(0, -1)
    : folderPath;

  const tiles: TileEntry[] = [];
  const seenIds = new Set<string>();

  // Recursively collect image files via adapter.list (folder-scoped, not vault-wide)
  const queue = [normalizedFolder];
  while (queue.length > 0) {
    const dir = queue.pop();
    if (dir == null) continue;
    let listing: { files: string[]; folders: string[] };
    try {
      listing = await app.vault.adapter.list(dir);
    } catch {
      continue; // folder may not exist
    }

    for (const sub of listing.folders) {
      queue.push(sub);
    }

    for (const filePath of listing.files) {
      const dotIdx = filePath.lastIndexOf('.');
      if (dotIdx < 0) continue;
      const ext = filePath.slice(dotIdx + 1).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) continue;

      const relativePath = filePath.slice(normalizedFolder.length + 1);
      const parts = relativePath.split('/');
      const category = parts.length > 1 ? parts.slice(0, -1).join('/') : undefined;

      // Auto-derive tags from subfolder path segments
      const tags = parts.length > 1 ? parts.slice(0, -1) : undefined;

      const slashIdx = filePath.lastIndexOf('/');
      const filename = slashIdx >= 0 ? filePath.slice(slashIdx + 1) : filePath;
      const id = mintTileId(relativePath, seenIds);

      tiles.push({ id, filename, vaultPath: filePath, category, tags });
    }
  }

  return tiles;
}

export { scanTilesetFolder };
