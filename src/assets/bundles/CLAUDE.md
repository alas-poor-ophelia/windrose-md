# assets/bundles — tile bundles (format v1)

**What**: a pack folder can hold its tiles as a few large content-addressed files instead of thousands of loose images:
`bundle.wrbundle` (marker JSON, written once), `index/<sha16>.wridx` (deflate-raw JSON segment, immutable),
`shards/<sha16>.wrshard` and `thumbs/<sha16>.wrshard` (`WRSH` header + entry table + raw image bytes, little-endian).
Design: `.claude/TILE-BUNDLES-DESIGN.md` sections 4-6.

- `bundleFormat.ts` — pure codecs, constants, union winner rule (`compareSegmentPrecedence`), magic sniffing.
- `bundleRegistry.ts` — module singleton: `mountBundleFolder` (forced remount), `ensureMounted` (reuses a serving record or joins an in-flight mount; what scans call), unmount/`remountOnRename`, `entriesFor`, `lookupEntry`, `readEntryBytes`, ShardCache, version + listeners.
  `beginBundleWrite`/`endBundleWrite`/`isBundleWriteInProgress`: importers bracket a write; the main.ts vault watcher skips remounts for that folder and the scan stays silent about `index-missing` meanwhile.
- `bundleWriter.ts` — `BundleWriter.add()/finish()`; marker first, shards as they fill, index segment LAST (commit point). `targetShardBytes` must be a finite integer, clamped to [64 KiB, 12 MiB]; one id reused for a different key throws.
- `bundleFolderInPlace.ts` — "Bundle folder" (settings tile folder row, desktop only): writes the bundle INTO a loose registered folder (same path = same tileset id; scan ids stored verbatim), exact mode, 4 MiB shards, <= 64 px thumbs via `bundleThumbs.decodeTile` (a failed thumb skips only the thumb), then retires the loose files through `bundleRetire`. Refuses a folder with an index segment or a write in flight; one run per folder.
- `bundleRetire.ts` — the shared retirement gate (`listLooseImages`, `indexLooseByContent`, `retireLooseImages`, `trashOptionOf`, `sameBytes`): a loose file is trashed only after the mounted bundle serves byte-identical bytes for its path; callers skip it when `trashOptionOf(app) === 'none'` and bracket the run with `beginBundleWrite`/`endBundleWrite`. Used by the Dungeondraft importer and `bundleFolderInPlace`. `listLooseImages` walks every directory (user folders named `index`, `shards`, `thumbs` included) and excludes only `.wridx`/`.wrshard` files and the marker.
- `bundleCompact.ts` — Compact storage codec (`compactEncode`, `estimateCompactRatio`): WebP q0.9 for PNG / lossless WebP at or above the 64 KB floor; stays exact for 16-bit or ICC PNG, ICC/animated/lossy WebP, no or non-WebP blob, size > 0.8x source, or a failed verify (alpha delta > 2, RGB PSNR < 40 dB over source alpha >= 8, at most ~1M strided samples). Desktop only; the DD importer's `storage: 'compact'` writes a `mode: 'compact'` segment (the mode is the policy; re-encoded entries carry `src` = original sha256/size/mime, kept-exact entries do not). An exact segment still outranks a compact one in the union.
- `bundleDevCommand.ts` — developer-gated command "Bundle tile folder in place (developer)": a folder picker in front of `bundleFolderInPlace`.
- `../tileBytes.ts` — `readTileBytes`, the single seam every tile byte read should go through (indexed TFile > loose file on disk > bundle; `clearTileBytesNegativeCache(pathOrPrefix?)` on vault `create`). `readTileThumbBlob` returns the bundle thumb or null (loose, shadowed, no thumb, failure), never the full image; `thumbnailCache` tries it first and skips its alpha scan for a thumb.

**States** (reason in `getBundleStateInfo`):
- `loose` — no marker AND no `.wridx`/`.wrshard` files under index/, shards/, thumbs/.
- `mounted` | `partial` (bad segments, a referenced shard missing/wrong size at mount, or a failed shard read; good entries still served).
- `unmounted-corrupt` — marker unreadable, or every index segment unreadable (`index-hash-mismatch` when every segment's file stem differs from `contentName(bytes)`).
- `unsupported-version` — marker.major !== 1.
- `not-on-device` — `folder-absent`, `marker-missing` (index/shards present before the marker: Sync order), `index-missing`, `no-index-no-shards`.

**Read failure kinds**: `shard-missing`, `shard-size-mismatch`, `shard-table-mismatch` (bad WRSH magic/major, or the shard's entry table disagrees with the index), `slice-out-of-range`, `bad-magic`, `shard-too-large`, `not-mounted`.

**Invariants**
- Files are immutable and named by content hash; never append to one. Same name means same bytes on every device. Exists is NOT identical: the writer stats an existing file and removes + rewrites it on a size mismatch (interrupted write, Sync partial); an unparseable existing marker is rewritten, never a stuck import.
- The index is untrusted input: shard names must match `^[0-9a-f]{16}\.wrshard$`, keys may not contain `..` segments, a leading `/`, `\` or NUL, and every offset/length/size/dimension must be a non-negative integer; a bad segment is rejected whole.
- Tile ids are STORED in the index (minted at import), never recomputed.
- `entriesFor()` returns `[]` for every non-serving state: always branch on `state`, never treat empty as "no tiles".
- Mounts carry a per-folder monotonic token; a superseded mount (newer mount or unmount) discards its result. Rename mounts the new path before unmounting the old.
- Mount stats every referenced shard; a bad one makes its entries `pending` up front unless the key has a runner-up (second-best segment entry) on a good shard, which is then served. The same fallback applies at read time.
- Negative caches live on the folder record, so a remount starts clean and a late in-flight failure cannot poison the new record. ShardCache caches a buffer only after the size and header-table checks pass; `dropPrefix` also drops in-flight loads.
- tileBytes caches "a loose file shadows this bundle entry" per path in the registry (cleared when the folder remounts) and "no loose file here" in a capped negative set (cleared by `clearTileBytesNegativeCache`).
- `encodeShard` throws past the u32 limit. Mobile: shard cache 2 / 8 MiB, one shard read in flight globally, shards above `MAX_MOBILE_SHARD_BYTES` (one 16 MiB tile + worst-case header) refused.
- Forced remount (`mountBundleFolder`) keeps cached shard buffers the new union still references at the same size, on a shard not marked bad, whose header table re-checks against the new refs; everything else (and every in-flight load) is dropped. Unmount and rename drop all.
- Mobile memory: thumbnail decode batch 4 (desktop 20), detection-scan concurrency 2 (desktop 4), compact tile browser requests thumbs in 60-tile windows; tileset probes are shared across mounts per settings generation (`shareProbe` in `../tileArtAnalysis`, invalidated by `windrose-settings-changed` and registry bumps).
