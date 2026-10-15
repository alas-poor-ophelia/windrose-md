/** In-memory fake of the slice of Obsidian's App the bundle code uses. */
import type { App } from 'obsidian';
import { TFile } from 'obsidian';

export interface FakeVault {
  app: App;
  files: Map<string, Uint8Array>;
  folders: Set<string>;
  /** Paths passed to adapter.readBinary, in call order. */
  reads: string[];
  /** Paths registered as indexed TFiles (getAbstractFileByPath). */
  indexed: Set<string>;
  inFlight: { now: number; max: number };
  /** Artificial async delay for readBinary (ms). */
  readDelayMs: number;
  /** Paths passed to adapter.exists, in call order. */
  existsCalls: string[];
  /** Awaited before every adapter.readBinary; may reject to simulate an I/O failure. */
  readHook: ((path: string) => Promise<void>) | null;
}

function parentsOf(path: string): string[] {
  const parts = path.split('/');
  const out: string[] = [];
  for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join('/'));
  return out;
}

export function makeFakeVault(): FakeVault {
  const files = new Map<string, Uint8Array>();
  const folders = new Set<string>();
  const reads: string[] = [];
  const indexed = new Set<string>();
  const inFlight = { now: 0, max: 0 };
  const existsCalls: string[] = [];
  const fv = { files, folders, reads, indexed, inFlight, readDelayMs: 0, existsCalls, readHook: null } as unknown as FakeVault;
  const toBuf = (u: Uint8Array): ArrayBuffer => u.slice().buffer;
  const exists = (p: string): boolean => files.has(p) || folders.has(p);

  const adapter = {
    exists: (p: string) => { existsCalls.push(p); return Promise.resolve(exists(p)); },
    stat: (p: string) => {
      const f = files.get(p);
      if (f) return Promise.resolve({ type: 'file', size: f.byteLength, ctime: 0, mtime: 0 });
      return Promise.resolve(folders.has(p) ? { type: 'folder', size: 0, ctime: 0, mtime: 0 } : null);
    },
    remove: (p: string) => {
      if (!files.delete(p)) return Promise.reject(new Error(`ENOENT ${p}`));
      return Promise.resolve();
    },
    writeBinary: (p: string, data: ArrayBuffer) => {
      for (const parent of parentsOf(p)) folders.add(parent);
      files.set(p, new Uint8Array(data.slice(0)));
      return Promise.resolve();
    },
    readBinary: async (p: string) => {
      reads.push(p);
      inFlight.now++;
      inFlight.max = Math.max(inFlight.max, inFlight.now);
      try {
        if (fv.readHook) await fv.readHook(p);
        await new Promise(r => setTimeout(r, fv.readDelayMs));
        const f = files.get(p);
        if (!f) throw new Error(`ENOENT ${p}`);
        return toBuf(f);
      } finally {
        inFlight.now--;
      }
    },
    list: (p: string) => {
      const prefix = p + '/';
      const direct = (k: string) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/');
      return Promise.resolve({
        files: [...files.keys()].filter(direct),
        folders: [...folders].filter(direct),
      });
    },
  };
  const vault = {
    adapter,
    // Like Obsidian right after a write: the file is on disk but NOT indexed
    // (getAbstractFileByPath stays null until markIndexed).
    createBinary: (p: string, data: ArrayBuffer) => {
      if (exists(p)) return Promise.reject(new Error(`exists ${p}`));
      for (const parent of parentsOf(p)) {
        if (!folders.has(parent)) return Promise.reject(new Error(`no folder ${parent}`));
      }
      files.set(p, new Uint8Array(data.slice(0)));
      return Promise.resolve();
    },
    createFolder: (p: string) => {
      folders.add(p);
      return Promise.resolve();
    },
    getAbstractFileByPath: (p: string) => {
      if (!indexed.has(p)) return null;
      const f = new TFile();
      f.path = p;
      return f;
    },
    readBinary: (f: TFile) => adapter.readBinary(f.path),
  };
  fv.app = { vault } as unknown as App;
  return fv;
}

/** Register a path as an indexed TFile (what the vault index does after a create event). */
export function markIndexed(fv: FakeVault, path: string): void {
  fv.indexed.add(path);
}

/** Add a file plus all parent folders directly (bypassing createBinary). */
export function putFile(fv: FakeVault, path: string, bytes: Uint8Array): void {
  for (const parent of parentsOf(path)) fv.folders.add(parent);
  fv.files.set(path, bytes);
}

/** Deterministic fake image bytes with a real magic prefix. */
export function fakeImage(kind: 'png' | 'webp' | 'jpeg' | 'gif', size: number, seed = 1): Uint8Array {
  const out = new Uint8Array(size);
  let x = (seed * 2654435761) >>> 0;
  for (let i = 0; i < size; i++) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; out[i] = x >>> 24; }
  const magic: Record<string, number[]> = {
    png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    webp: [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
    jpeg: [0xff, 0xd8, 0xff],
    gif: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
  };
  out.set(magic[kind].slice(0, size), 0);
  return out;
}
