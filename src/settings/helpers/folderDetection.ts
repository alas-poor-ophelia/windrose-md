import type { App } from 'obsidian';
import { Notice } from 'obsidian';
import { scanTilesetFolder } from '../../assets/tilesetOperations';
import { runImportDetectionPass } from '../../assets/importDetectionPass';
import {
  loadTileMetadata,
  saveTileMetadata,
  setTileMetadataForRender,
} from '../../persistence/tileMetadata';

// folderDetection.ts
// Auto-detection for folder-added tilesets, used by the declarative tile
// set definitions (settingDefinitionLists.ts).

/** Debounce before a committed folder path triggers auto-detection. */
const FOLDER_DETECT_DEBOUNCE_MS = 1200;

const detectionInFlight = new Set<string>();

/**
 * Auto-detection for folder-added tilesets — the folder path's "import
 * moment", mirroring what the Dungeondraft import does for packs. Without
 * this, folder sets only ever get signals from the tile browser's idle scan
 * and never get render-mode/footprint predictions at all.
 */
async function runFolderDetection(app: App, rawPath: string): Promise<void> {
  const folder = rawPath.trim().replace(/\/+$/, '');
  if (folder === '' || detectionInFlight.has(folder)) return;
  detectionInFlight.add(folder);
  try {
    const tiles = await scanTilesetFolder(app, folder);
    if (tiles.length === 0) return;

    const metadata = await loadTileMetadata(app);
    // Import-moment guard (2026-06-09 RCA): prior metadata for any tile in
    // the folder means this set was known before — and may have placements —
    // so render-mode predictions are withheld; signals/depth/span are safe.
    const hasPrior = tiles.some(t => metadata[t.vaultPath] != null);
    const scanCount = tiles.filter(t => {
      const e = metadata[t.vaultPath];
      return e?.alphaCoverage == null || e?.srcW == null;
    }).length;

    const progress = scanCount > 0
      ? new Notice(`Windrose: scanning ${scanCount} tile(s) in "${folder}"…`, 0)
      : null;
    try {
      const { metadata: next, stats } = await runImportDetectionPass(app, tiles, metadata, {
        applyRenderMode: !hasPrior,
        onScanProgress: (done, total) => {
          progress?.setMessage(`Windrose: scanning tiles ${done}/${total}…`);
        },
      });
      if (stats.scanned + stats.depth + stats.region + stats.spans === 0) return;
      await saveTileMetadata(app, next);
      setTileMetadataForRender(next);
      new Notice(
        `Tile detection ("${folder}"): ${stats.scanned} scanned · ` +
        `${stats.depth} tiered · ${stats.region} terrain · ${stats.spans} multi-cell`,
      );
    } finally {
      progress?.hide();
    }
  } catch (e) {
    console.error('[Windrose] Folder tile detection failed:', folder, e);
  } finally {
    detectionInFlight.delete(folder);
  }
}

export { runFolderDetection, FOLDER_DETECT_DEBOUNCE_MS };
