import { requestUrl, Notice, normalizePath } from 'obsidian';
import { TFile } from 'obsidian';
import type { App } from 'obsidian';
import { unzipSync } from 'fflate';
import type { RegistryPack, InstalledPack } from '#types/content-packs/contentPack.types';
import type { PluginSettings } from '#types/settings/settings.types';
import { CONTENT_PACKS_FOLDER } from './contentPackConstants';
import { ObjectSetHelpers } from '../settings/helpers/objectSetHelpers';
import { ensureFolder } from '../persistence/vaultFolders';
import { assertNever } from '../utils/assertNever';
import { upsertTravelPack, validateTravelPackImport } from '../travel/travelPackOperations';

/** Hard cap on the total uncompressed size of one pack archive (guards memory on mobile). */
const MAX_UNCOMPRESSED_BYTES = 500 * 1024 * 1024;


interface PluginLike {
  app: App;
  settings: PluginSettings;
  saveSettings(): Promise<void>;
}

function getExtractPath(pack: RegistryPack, settings: PluginSettings): string {
  switch (pack.type) {
    case 'object-pack': {
      const autoLoadFolder = settings.objectSetsAutoLoadFolder;
      if (autoLoadFolder != null && autoLoadFolder !== '') {
        return autoLoadFolder + '/' + pack.id;
      }
      return CONTENT_PACKS_FOLDER + '/object-packs/' + pack.id;
    }
    case 'fog-pack':
      return CONTENT_PACKS_FOLDER + '/fog/' + pack.id;
    case 'font-pack':
      return CONTENT_PACKS_FOLDER + '/fonts/' + pack.id;
    case 'travel-pack':
      return CONTENT_PACKS_FOLDER + '/travel-pack/' + pack.id;
    default:
      return assertNever(pack.type, 'pack type');
  }
}

/** Copy exactly the view's bytes (never the backing buffer, which may be larger). */
function toExactArrayBuffer(data: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(data.byteLength);
  new Uint8Array(buf).set(data);
  return buf;
}

function assertSafePackId(id: string): void {
  if (id === '' || id === '.' || id === '..' || /[\\/:]/.test(id)) {
    throw new Error('Invalid pack id: ' + id);
  }
}

function assertHttpsUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Pack download URL is not a valid URL');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Pack download URL must use https');
  }
}

/**
 * Map an archive entry name to a path relative to the pack folder (first
 * folder segment stripped, as before). Returns null for unsafe entries (empty,
 * absolute, backslashes, drive letters or '..' segments) and '' when there is
 * nothing to write (a bare top-level folder entry).
 */
function resolveEntryPath(entryName: string): string | null {
  if (entryName === '' || entryName.startsWith('/') || entryName.includes('\\')) return null;
  const segments = entryName.split('/');
  if (segments.some(seg => seg === '..' || seg.includes(':'))) return null;
  const rel = (segments.length > 1 ? segments.slice(1) : segments).filter(seg => seg !== '' && seg !== '.');
  return rel.join('/');
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const digest = await crypto.subtle.digest('SHA-256', copy);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

async function verifySha256(data: Uint8Array, expected: string | undefined): Promise<void> {
  if (expected == null || expected === '') return;
  const actual = await sha256Hex(data);
  if (actual !== expected.trim().toLowerCase()) {
    throw new Error('Pack download failed integrity check (sha256 mismatch)');
  }
}

/**
 * Travel packs install into plugin settings, not vault folders. The payload
 * may be raw JSON or a zip containing a single .json file.
 */
async function installTravelPack(plugin: PluginLike, pack: RegistryPack, payload: Uint8Array): Promise<InstalledPack> {
  let text: string;
  try {
    text = new TextDecoder().decode(payload);
    JSON.parse(text);
  } catch {
    const extracted = unzipSync(payload);
    const jsonEntry = Object.entries(extracted).find(([name]) => name.endsWith('.json'));
    if (jsonEntry == null) throw new Error('Travel pack download contains no JSON file');
    text = new TextDecoder().decode(jsonEntry[1]);
  }

  const result = validateTravelPackImport(JSON.parse(text));
  if (!result.valid || result.pack == null) {
    throw new Error('Invalid travel pack: ' + result.errors.slice(0, 3).join('; '));
  }

  plugin.settings.travelPacks = upsertTravelPack(plugin.settings.travelPacks ?? [], result.pack);

  const installed: InstalledPack = {
    id: pack.id,
    name: pack.name,
    type: pack.type,
    version: pack.version,
    installedAt: Date.now(),
    vaultPath: '',
  };
  plugin.settings.installedContentPacks ??= [];
  const idx = plugin.settings.installedContentPacks.findIndex((p: InstalledPack) => p.id === pack.id);
  if (idx >= 0) {
    plugin.settings.installedContentPacks[idx] = installed;
  } else {
    plugin.settings.installedContentPacks.push(installed);
  }
  await plugin.saveSettings();

  new Notice(pack.name + ' installed successfully.');
  return installed;
}

async function downloadAndInstallPack(
  plugin: PluginLike,
  pack: RegistryPack
): Promise<InstalledPack> {
  const notice = new Notice('Downloading ' + pack.name + '...', 0);
  try {
    return await downloadAndInstallPackInner(plugin, pack);
  } finally {
    notice.hide();
  }
}

async function downloadAndInstallPackInner(
  plugin: PluginLike,
  pack: RegistryPack
): Promise<InstalledPack> {
  assertSafePackId(pack.id);
  assertHttpsUrl(pack.downloadUrl);

  const response = await requestUrl({ url: pack.downloadUrl });
  const zipData = new Uint8Array(response.arrayBuffer);
  await verifySha256(zipData, pack.sha256);

  if (pack.type === 'travel-pack') {
    return installTravelPack(plugin, pack, zipData);
  }

  let totalBytes = 0;
  const extracted = unzipSync(zipData, {
    filter: (file) => {
      totalBytes += file.originalSize;
      if (totalBytes > MAX_UNCOMPRESSED_BYTES) {
        throw new Error('Pack archive is too large when uncompressed');
      }
      return true;
    },
  });

  const basePath = normalizePath(getExtractPath(pack, plugin.settings));
  await ensureFolder(plugin.app, basePath);

  const entries = Object.entries(extracted);
  for (const [filePath] of entries) {
    if (resolveEntryPath(filePath.endsWith('/') ? filePath.slice(0, -1) : filePath) == null) {
      throw new Error('Pack archive contains an unsafe entry path: ' + filePath);
    }
  }

  for (const [filePath, fileData] of entries) {
    const isDir = filePath.endsWith('/');
    const relativePath = resolveEntryPath(isDir ? filePath.slice(0, -1) : filePath);
    if (relativePath == null || relativePath === '') continue;
    const fullPath = normalizePath(basePath + '/' + relativePath);
    if (!fullPath.startsWith(basePath + '/')) {
      throw new Error('Pack archive entry escapes the pack folder: ' + filePath);
    }

    if (isDir) {
      await ensureFolder(plugin.app, fullPath);
      continue;
    }

    const parentDir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    if (parentDir !== basePath) {
      await ensureFolder(plugin.app, parentDir);
    }

    const existing = plugin.app.vault.getAbstractFileByPath(fullPath);
    if (existing instanceof TFile) {
      await plugin.app.vault.modifyBinary(existing, toExactArrayBuffer(fileData));
    } else if (filePath.endsWith('.json')) {
      const text = new TextDecoder().decode(fileData);
      await plugin.app.vault.create(fullPath, text);
    } else {
      await plugin.app.vault.createBinary(fullPath, toExactArrayBuffer(fileData));
    }
  }

  if (pack.type === 'object-pack') {
    try {
      await ObjectSetHelpers.importSetFromFolder(plugin, basePath);
    } catch (err) {
      console.warn('[Windrose] Object set auto-import failed:', err);
    }
  }

  const installed: InstalledPack = {
    id: pack.id,
    name: pack.name,
    type: pack.type,
    version: pack.version,
    installedAt: Date.now(),
    vaultPath: basePath,
  };

  plugin.settings.installedContentPacks ??= [];

  const existingIdx = plugin.settings.installedContentPacks.findIndex((p: InstalledPack) => p.id === pack.id);
  if (existingIdx >= 0) {
    plugin.settings.installedContentPacks[existingIdx] = installed;
  } else {
    plugin.settings.installedContentPacks.push(installed);
  }
  await plugin.saveSettings();

  new Notice(pack.name + ' installed successfully.');
  return installed;
}

export { downloadAndInstallPack, getExtractPath, resolveEntryPath, assertHttpsUrl, verifySha256, MAX_UNCOMPRESSED_BYTES };
