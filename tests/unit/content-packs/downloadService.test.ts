import { describe, it, expect, vi, beforeEach } from 'vitest';
import { zipSync, unzipSync } from 'fflate';

vi.mock('obsidian', async (orig) => {
  const mod = await orig<Record<string, unknown>>();
  class Notice {
    constructor(_message: string, _timeout?: number) {}
    hide(): void {}
  }
  return { ...mod, requestUrl: vi.fn(), Notice };
});

import { requestUrl } from 'obsidian';
import {
  downloadAndInstallPack,
  getExtractPath,
  resolveEntryPath,
  assertHttpsUrl,
  verifySha256,
  MAX_UNCOMPRESSED_BYTES,
} from '../../../src/content-packs/downloadService';
import { uninstallPack } from '../../../src/content-packs/installedPacksService';
import { ensureFolder } from '../../../src/persistence/vaultFolders';

function makePlugin() {
  const created: Record<string, unknown> = {};
  const folders = new Set<string>();
  const vault = {
    getAbstractFileByPath: vi.fn((p: string) => (folders.has(p) ? { path: p } : null)),
    createFolder: vi.fn(async (p: string) => { folders.add(p); }),
    create: vi.fn(async (p: string, t: string) => { created[p] = t; }),
    createBinary: vi.fn(async (p: string, b: ArrayBuffer) => { created[p] = b; }),
    modifyBinary: vi.fn(),
  };
  const raw = {
    app: { vault, fileManager: { trashFile: vi.fn() } },
    settings: { installedContentPacks: [] as unknown[] },
    saveSettings: vi.fn(async () => {}),
  };
  return { plugin: raw as never, created, vault, raw };
}

const basePack = {
  id: 'p1', name: 'P1', author: 'a', type: 'fog-pack', version: '1',
  description: '', size: 1, downloadUrl: 'https://example.com/p.zip',
};

function serve(zip: Uint8Array) {
  (requestUrl as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    arrayBuffer: zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength),
  });
}

describe('fflate stored entries (OBS-02 probe)', () => {
  it('unzipSync copies stored entries: .buffer is exactly the entry bytes', () => {
    const z = zipSync({ 'a/x.bin': new Uint8Array([1, 2, 3]) }, { level: 0 });
    const out = unzipSync(z)['a/x.bin'];
    expect(out.buffer.byteLength).toBe(out.byteLength);
  });
});

describe('resolveEntryPath', () => {
  it('strips the top folder and rejects unsafe names', () => {
    expect(resolveEntryPath('pack/a/b.png')).toBe('a/b.png');
    expect(resolveEntryPath('b.png')).toBe('b.png');
    expect(resolveEntryPath('')).toBeNull();
    expect(resolveEntryPath('/etc/passwd')).toBeNull();
    expect(resolveEntryPath('pack/../../evil.txt')).toBeNull();
    expect(resolveEntryPath('..')).toBeNull();
    expect(resolveEntryPath('pack\\evil.txt')).toBeNull();
    expect(resolveEntryPath('C:/evil.txt')).toBeNull();
  });
});

describe('url and hash checks', () => {
  it('requires https', () => {
    expect(() => assertHttpsUrl('http://x.test/a.zip')).toThrow();
    expect(() => assertHttpsUrl('nonsense')).toThrow();
    expect(() => assertHttpsUrl('https://x.test/a.zip')).not.toThrow();
  });
  it('verifies sha256 only when provided', async () => {
    const data = new TextEncoder().encode('abc');
    const good = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
    await expect(verifySha256(data, undefined)).resolves.toBeUndefined();
    await expect(verifySha256(data, good.toUpperCase())).resolves.toBeUndefined();
    await expect(verifySha256(data, '00')).rejects.toThrow(/integrity/);
  });
  it('has a sane uncompressed cap', () => {
    expect(MAX_UNCOMPRESSED_BYTES).toBe(500 * 1024 * 1024);
  });
});

describe('getExtractPath', () => {
  it('gives fog and font packs their own folders', () => {
    const s = {} as never;
    expect(getExtractPath({ ...basePack, type: 'fog-pack', id: 'f1' } as never, s)).toMatch(/\/fog\/f1$/);
    expect(getExtractPath({ ...basePack, type: 'font-pack', id: 'f2' } as never, s)).toMatch(/\/fonts\/f2$/);
  });
});

describe('downloadAndInstallPack', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes exactly the entry bytes for stored entries', async () => {
    const { plugin, created } = makePlugin();
    serve(zipSync({ 'top/img.png': new Uint8Array([9, 8, 7]) }, { level: 0 }));
    await downloadAndInstallPack(plugin, basePack as never);
    const key = Object.keys(created).find(k => k.endsWith('img.png'));
    expect(key).toBeDefined();
    expect((created[key as string] as ArrayBuffer).byteLength).toBe(3);
  });

  it('rejects traversal entries before writing anything', async () => {
    const { plugin, vault } = makePlugin();
    serve(zipSync({ 'top/ok.png': new Uint8Array([1]), 'top/../../evil.png': new Uint8Array([2]) }));
    await expect(downloadAndInstallPack(plugin, basePack as never)).rejects.toThrow(/unsafe/);
    expect(vault.createBinary).not.toHaveBeenCalled();
  });

  it('rejects http urls and mismatched hashes', async () => {
    const { plugin } = makePlugin();
    await expect(
      downloadAndInstallPack(plugin, { ...basePack, downloadUrl: 'http://x.test/a.zip' } as never)
    ).rejects.toThrow(/https/);
    serve(zipSync({ 'top/a.png': new Uint8Array([1]) }));
    await expect(
      downloadAndInstallPack(plugin, { ...basePack, sha256: 'deadbeef' } as never)
    ).rejects.toThrow(/integrity/);
  });
});

describe('uninstallPack', () => {
  it('trashes only a pack-owned folder and refuses shared legacy paths', async () => {
    const { raw, plugin } = makePlugin();
    raw.app.vault.getAbstractFileByPath.mockReturnValue({ path: 'x' });
    raw.settings.installedContentPacks = [
      { id: 'p1', name: 'P1', type: 'fog-pack', version: '1', installedAt: 0, vaultPath: 'x/fog/p1' },
      { id: 'p2', name: 'P2', type: 'fog-pack', version: '1', installedAt: 0, vaultPath: 'x/fog' },
    ];
    await uninstallPack(plugin, 'p1');
    expect(raw.app.fileManager.trashFile).toHaveBeenCalledTimes(1);
    await uninstallPack(plugin, 'p2');
    expect(raw.app.fileManager.trashFile).toHaveBeenCalledTimes(1);
    expect(raw.settings.installedContentPacks).toHaveLength(0);
  });
});

describe('ensureFolder', () => {
  it('creates missing segments and warns once only when creation really failed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { vault } = makePlugin();
    const app = { vault } as never;
    await ensureFolder(app, 'a/b/c');
    expect(vault.createFolder).toHaveBeenCalledTimes(3);
    vault.createFolder.mockRejectedValue(new Error('boom'));
    await ensureFolder(app, 'z/y/x');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
