# assets/bundles — tile bundles (format v1)

**What**: a pack folder can hold its tiles as a few large content-addressed files instead of thousands of loose images:
`bundle.wrbundle` (marker JSON, written once), `index/<sha16>.wridx` (deflate-raw JSON segment, immutable),
`shards/<sha16>.wrshard` and `thumbs/<sha16>.wrshard` (`WRSH` header + entry table + raw image bytes, little-endian).
Design: `.claude/TILE-BUNDLES-DESIGN.md` sections 4-6.

- `bundleFormat.ts` — pure codecs, constants, union winner rule (`compareSegmentPrecedence`), magic sniffing.
- `bundleRegistry.ts` — module singleton: `mountBundleFolder` (forced remount), `ensureMounted` (reuses a serving record or joins an in-flight mount; what scans call), unmount/`remountOnRename`, `entriesFor`, `lookupEntry`, `readEntryBytes`, ShardCache, version + listeners.
  `beginBundleWrite`/`endBundleWrite`/`isBundleWriteInProgress`: importers bracket a write; the main.ts vault watcher skips remounts for that folder and the scan stays silent about `index-missing` meanwhile.
- `bundleWriter.ts` — `BundleWriter.add()/finish()`; marker first, shards as they fill, index segment LAST (commit point). `targetShardBytes` must be a finite integer, clamped to [64 KiB, 12 MiB]; one id reused for a different key throws.
- `bundleDevCommand.ts` — dev command: bundle a loose folder; writes a <= 64 px alpha-cropped PNG thumb per tile (`computeAlphaBounds` from `../thumbnailCache`), skipping only the thumb (never the tile) when it fails.
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
