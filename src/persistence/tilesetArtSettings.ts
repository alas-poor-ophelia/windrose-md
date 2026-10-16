/**
 * tilesetArtSettings.ts
 *
 * Debounced persistence of the GLOBAL per-tileset art nudge / art scale
 * (plugin settings `tilesetArtOffsets` / `tilesetArtScales`). A dragged slider
 * must not storm saveSettings() (each save fires windrose-settings-changed and
 * a full tileset rebuild), so writes are debounced — with ONE TIMER PER
 * (field, tileset id). A single shared timer meant changing tileset A then B
 * within the window cancelled A's save (STRUCT-A-03).
 */

import type { App } from 'obsidian';
import type { PluginSettings } from '#types/settings/settings.types';

type TilesetArtField = 'tilesetArtOffsets' | 'tilesetArtScales';

/** Value that means "no override" for each field; writing it deletes the key. */
const IDENTITY: Record<TilesetArtField, number> = {
  tilesetArtOffsets: 0,
  tilesetArtScales: 1,
};

const SAVE_DEBOUNCE_MS = 600;

interface SettingsWriter {
  settings: Partial<PluginSettings>;
  saveSettings(): Promise<void>;
}

/** The plugin instance as a typed settings writer, or null when unavailable. */
function getSettingsWriter(app: App): SettingsWriter | null {
  const plugin = app.plugins.plugins['windrose-md'] as unknown as Partial<SettingsWriter> | undefined;
  if (plugin?.settings == null || typeof plugin.saveSettings !== 'function') return null;
  return plugin as SettingsWriter;
}

interface PendingWrite { timer: number; app: App; value: number | undefined }
const pending = new Map<string, PendingWrite>();

function writeNow(app: App, field: TilesetArtField, tilesetId: string, value: number | undefined): void {
  const writer = getSettingsWriter(app);
  if (writer == null) return;
  const next = { ...(writer.settings[field] ?? {}) };
  if (value == null || value === IDENTITY[field]) delete next[tilesetId];
  else next[tilesetId] = value;
  writer.settings[field] = next;
  void writer.saveSettings();
}

/** Schedule a debounced save of one tileset's art value; other tilesets' pending saves are untouched. */
function scheduleTilesetArtSave(app: App, field: TilesetArtField, tilesetId: string, value: number | undefined): void {
  const key = `${field}\u0000${tilesetId}`;
  const existing = pending.get(key);
  if (existing != null) window.clearTimeout(existing.timer);
  const timer = window.setTimeout(() => {
    pending.delete(key);
    writeNow(app, field, tilesetId, value);
  }, SAVE_DEBOUNCE_MS);
  pending.set(key, { timer, app, value });
}

/** Write every pending art save now (unmount / plugin unload). */
function flushTilesetArtSaves(): void {
  for (const [key, write] of [...pending]) {
    window.clearTimeout(write.timer);
    pending.delete(key);
    const sep = key.indexOf('\u0000');
    writeNow(write.app, key.slice(0, sep) as TilesetArtField, key.slice(sep + 1), write.value);
  }
}

export { scheduleTilesetArtSave, flushTilesetArtSaves, getSettingsWriter };
export type { TilesetArtField };
