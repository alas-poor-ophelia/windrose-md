import type { SettingsTabThis } from './settingsTabContext';
import type { App } from 'obsidian';
import { Notice, Setting } from 'obsidian';
import { FolderSuggest } from '../helpers/FolderSuggest';
import { AddTilesModal } from '../modals/AddTilesModal';
import { scanTilesetFolder } from '../../assets/tilesetOperations';
import { runImportDetectionPass } from '../../assets/importDetectionPass';
import {
  loadTileMetadata,
  saveTileMetadata,
  setTileMetadataForRender,
} from '../../persistence/tileMetadata';

// settingsPlugin-TabRenderTilesets.ts
// WindroseMDSettingsTab render methods - Tileset configuration

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

export const TabRenderTilesetsMethods = {
  renderTilesetFoldersContent(this: SettingsTabThis, containerEl: HTMLElement): void {
    const s = this.plugin.settings;
    const folders = s.tilesetFolders ?? [];

    containerEl.createEl('p', {
      text: 'Configure vault folders containing hex tile images. Each folder becomes a tileset available to all hex maps. Subfolders are used as tile categories.',
      cls: 'setting-item-description'
    });

    // List existing folders
    for (let i = 0; i < folders.length; i++) {
      const folderPath = folders[i];
      new Setting(containerEl)
        .setName('Tile Folder ' + (i + 1))
        .addSearch(search => {
          new FolderSuggest(this.app, search.inputEl);
          let detectTimer: number | undefined;
          search
            .setPlaceholder('e.g. Assets/Tiles/Baumgart')
            .setValue(folderPath)
            .onChange(async (value: string) => {
              const updated = [...(s.tilesetFolders ?? [])];
              updated[i] = value.trim();
              s.tilesetFolders = updated;
              this.settingsChanged = true;
              await this.plugin.saveSettings();
              // Debounced auto-detection once the path settles — the folder
              // set's "import moment" (scanTilesetFolder no-ops on non-folders).
              if (detectTimer != null) window.clearTimeout(detectTimer);
              detectTimer = window.setTimeout(() => {
                void runFolderDetection(this.app, value);
              }, FOLDER_DETECT_DEBOUNCE_MS);
            });
        })
        .addExtraButton(btn => btn
          .setIcon('trash-2')
          .setTooltip('Remove folder')
          .onClick(async () => {
            const updated = [...(s.tilesetFolders ?? [])];
            updated.splice(i, 1);
            s.tilesetFolders = updated;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }));
    }

    // One entry point for every source (design: "Add tiles" wizard) —
    // a Dungeondraft pack or a folder of images, with tier mapping and
    // filename tag mining for folders.
    new Setting(containerEl)
      .setName('Add tiles')
      .setDesc('Import a Dungeondraft pack or a folder of images — with tier mapping and tag suggestions')
      .addButton(btn => btn
        .setButtonText('Add tiles')
        .setCta()
        .onClick(() => {
          const pluginLike = { app: this.app, settings: this.plugin.settings, saveSettings: () => this.plugin.saveSettings() };
          new AddTilesModal(this.app, pluginLike, () => {
            this.settingsChanged = true;
            this.display();
          }).open();
        }));

    // Scan preview
    if (folders.length > 0) {
      new Setting(containerEl)
        .setName('Preview')
        .setDesc('Check what tiles would be loaded from configured folders')
        .addButton(btn => btn
          .setButtonText('Scan folders')
          .onClick(() => {
            let totalTiles = 0;
            const results: string[] = [];
            for (const folder of folders) {
              if (!folder) continue;
              const allFiles = this.app.vault.getFiles();
              const normalizedFolder = folder.endsWith('/') ? folder.slice(0, -1) : folder;
              const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
              let count = 0;
              for (const file of allFiles) {
                if (!file.path.startsWith(normalizedFolder + '/')) continue;
                const ext = file.extension ? file.extension.toLowerCase() : '';
                if (IMAGE_EXTENSIONS.has(ext)) count++;
              }
              totalTiles += count;
              results.push(folder + ': ' + count + ' tile(s)');
            }
            new Notice(results.join('\n') + '\nTotal: ' + totalTiles + ' tiles');
          }));
    }
  }
};
