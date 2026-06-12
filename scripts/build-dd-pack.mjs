/**
 * build-dd-pack.mjs
 *
 * Assemble a .dungeondraft_pack (Godot PCK v1) from a raw Dungeondraft asset
 * directory (e.g. "EA - Fantasy Core Raw" with top-level Walls/ and Paths/).
 * Generates pack.json and .dungeondraft_wall sidecars so the pack exercises
 * the full Windrose import pipeline.
 *
 * Usage:
 *   node scripts/build-dd-pack.mjs <rawDir> <out.dungeondraft_pack> <packName> <packId> [pathsFilterRegex]
 *
 * Only Walls/ and Paths/ subdirectories are packed (this tool exists for the
 * wall/path feature dev loop). Walls are always included in full; Paths can be
 * limited with the optional filename regex.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const [rawDir, outFile, packName, packId, pathsFilter] = process.argv.slice(2);
if (!rawDir || !outFile || !packName || !packId) {
  console.error('Usage: node build-dd-pack.mjs <rawDir> <out.pack> <name> <id> [pathsFilterRegex]');
  process.exit(1);
}

const GDPC_MAGIC = 0x43504447;
const prefix = `res://packs/${packId}/`;

function listImages(dir) {
  try {
    return readdirSync(dir).filter(f => /\.(webp|png)$/i.test(f) && statSync(join(dir, f)).isFile());
  } catch {
    return [];
  }
}

/** @type {Array<{pckPath: string, data: Buffer}>} */
const entries = [];

// pack.json
const packJson = {
  name: packName,
  id: packId,
  version: '1.0.0',
  author: 'local-dev-repack',
  allow_3rd_party_mapping_software_to_read: true,
  keywords: ['walls', 'paths'],
};
entries.push({ pckPath: `${prefix}pack.json`, data: Buffer.from(JSON.stringify(packJson, null, 2), 'utf-8') });

// Walls (all) + sidecars for strips (not _end caps)
const wallFiles = listImages(join(rawDir, 'Walls'));
for (const f of wallFiles) {
  entries.push({ pckPath: `${prefix}textures/walls/${f}`, data: readFileSync(join(rawDir, 'Walls', f)) });
  if (!/_end\.(webp|png)$/i.test(f)) {
    const stem = f.replace(/\.(webp|png)$/i, '');
    const sidecar = { path: `textures/walls/${f}`, color: 'ffffff' };
    entries.push({
      pckPath: `${prefix}data/walls/${stem}.dungeondraft_wall`,
      data: Buffer.from(JSON.stringify(sidecar), 'utf-8'),
    });
  }
}

// Paths (filtered)
const filter = pathsFilter ? new RegExp(pathsFilter) : null;
const pathFiles = listImages(join(rawDir, 'Paths')).filter(f => filter == null || filter.test(f));
for (const f of pathFiles) {
  entries.push({ pckPath: `${prefix}textures/paths/${f}`, data: readFileSync(join(rawDir, 'Paths', f)) });
}

console.log(`Packing ${wallFiles.length} walls, ${pathFiles.length} paths, ${entries.length} total entries`);

// --- PCK v1 layout ---
// header: magic u32, version u32, godotMajor u32, godotMinor u32, godotPatch u32,
//         reserved zeros up to 0x54, fileCount u32 at 0x54, index at 0x58.
// index entry: pathLen u32 (includes null padding to 4 bytes), path bytes,
//              offset u64 (absolute), size u64, md5 16 bytes.
const HEADER_SIZE = 0x58;

const pathBufs = entries.map(e => {
  const raw = Buffer.from(e.pckPath, 'utf-8');
  const padded = Math.ceil(raw.length / 4) * 4;
  const buf = Buffer.alloc(padded);
  raw.copy(buf);
  return buf;
});

const indexSize = pathBufs.reduce((acc, p) => acc + 4 + p.length + 8 + 8 + 16, 0);
const dataStart = HEADER_SIZE + indexSize;

const header = Buffer.alloc(HEADER_SIZE);
header.writeUInt32LE(GDPC_MAGIC, 0);
header.writeUInt32LE(1, 4);  // pack version
header.writeUInt32LE(3, 8);  // godot major
header.writeUInt32LE(4, 12); // godot minor
header.writeUInt32LE(2, 16); // godot patch
header.writeUInt32LE(entries.length, 0x54);

const index = Buffer.alloc(indexSize);
let cursor = 0;
let offset = dataStart;
for (let i = 0; i < entries.length; i++) {
  const p = pathBufs[i];
  index.writeUInt32LE(p.length, cursor); cursor += 4;
  p.copy(index, cursor); cursor += p.length;
  index.writeBigUInt64LE(BigInt(offset), cursor); cursor += 8;
  index.writeBigUInt64LE(BigInt(entries[i].data.length), cursor); cursor += 8;
  cursor += 16; // md5 zeros (not verified by importer)
  offset += entries[i].data.length;
}

writeFileSync(outFile, Buffer.concat([header, index, ...entries.map(e => e.data)]));
const sizeMb = (statSync(outFile).size / 1024 / 1024).toFixed(1);
console.log(`Wrote ${outFile} (${sizeMb} MB)`);
