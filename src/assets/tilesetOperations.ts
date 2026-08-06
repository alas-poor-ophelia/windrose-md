/**
 * tilesetOperations.ts
 * Operations for importing and managing hex tile sets from vault folders.
 */

import type { TilesetDef, FolderTileset, TileEntry, TilesetOrigin } from '#types/tiles/tile.types';
import { TFile } from 'obsidian';
import type { App } from 'obsidian';

import { getApp } from '../core/settingsAccessor';

// ===========================================
// Constants
// ===========================================

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

// ===========================================
// ID Generation
// ===========================================

/**
 * Mint a tile id from its folder-relative path: the relative path with the
 * extension stripped. Unique across subfolders by construction (paths are
 * unique), and root-level tiles keep their historical basename-derived ids —
 * placements saved under those never need remapping. If two files in one
 * folder share a stem (rock.png + rock.webp), later ones keep the extension.
 */
function mintTileId(relativePath: string, seenIds: Set<string>): string {
  const dotIdx = relativePath.lastIndexOf('.');
  const stem = dotIdx > 0 ? relativePath.slice(0, dotIdx) : relativePath;
  const id = seenIds.has(stem) ? relativePath : stem;
  seenIds.add(id);
  return id;
}

/** Generate a deterministic tileset ID from folder path */
function generateTilesetId(folderPath?: string): string {
  if (folderPath != null && folderPath !== '') {
    // Deterministic: same folder always produces the same ID
    let hash = 0;
    for (let i = 0; i < folderPath.length; i++) {
      hash = ((hash << 5) - hash + folderPath.charCodeAt(i)) | 0;
    }
    return 'tileset-' + Math.abs(hash).toString(36);
  }
  return 'tileset-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11);
}

// ===========================================
// Dimension Helpers
// ===========================================

/**
 * Auto-detect overflow from tile dimensions.
 * If tileHeight > tileWidth, the excess is treated as top overflow
 * (e.g. tree canopy extending above the hex area).
 */
function autoDetectOverflow(tileWidth: number, tileHeight: number): {
  hexHeight: number;
  overflowTop: number;
  overflowBottom: number;
} {
  if (tileHeight > tileWidth) {
    return {
      hexHeight: tileWidth,
      overflowTop: tileHeight - tileWidth,
      overflowBottom: 0,
    };
  }
  return {
    hexHeight: tileHeight,
    overflowTop: 0,
    overflowBottom: 0,
  };
}

// ===========================================
// Folder Scanning
// ===========================================

/**
 * Scan a vault folder for tile images using adapter.list() for folder-scoped
 * listing instead of vault.getFiles() which walks every file in the vault.
 * Returns TileEntry[] with subfolder-based categories.
 */
async function scanTilesetFolder(app: App, folderPath: string): Promise<TileEntry[]> {
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

// ===========================================
// Tile Resolution
// ===========================================

/** Last path segment of a tile id. Folder-relative ids ("terrain/Natural/X")
 *  reduce to their basename ("X") for legacy-reference matching. */
function tileIdBasename(id: string): string {
  const idx = id.lastIndexOf('/');
  return idx >= 0 ? id.slice(idx + 1) : id;
}

/**
 * Resolve a tile entry within a tileset by tile ID.
 *
 * Single source of truth for tileId → TileEntry resolution — every lookup of
 * a stored tilesetId/tileId pair must go through this (or mirror its
 * semantics exactly, as the renderer's entry map does):
 *   1. Exact id match — FIRST occurrence wins. Dungeondraft packs reuse
 *      basenames across subfolders, so ids can be duplicated within one
 *      tileset; divergent pick order between resolution sites renders
 *      placements invisible (preloader loads one twin, renderer asks the
 *      cache for the other).
 *   2. Legacy fallback — match the basename of a folder-relative entry id,
 *      so placements saved under old basename-derived ids keep resolving
 *      after ids become folder-relative paths.
 */
function resolveTileEntry(
  tileset: Pick<TilesetDef, 'tiles'> | undefined,
  tileId: string | undefined
): TileEntry | undefined {
  if (tileset == null || tileId == null || tileId === '') return undefined;
  let legacy: TileEntry | undefined;
  for (const entry of tileset.tiles) {
    if (entry.id === tileId) return entry;
    if (legacy === undefined && entry.id !== tileIdBasename(entry.id) && tileIdBasename(entry.id) === tileId) {
      legacy = entry;
    }
  }
  return legacy;
}

// ===========================================
// Tileset Creation
// ===========================================

/**
 * Read a tile image's bytes: vault index first, adapter fallback for files
 * the index hasn't caught up to yet. Bulk-extracting a pack into the vault
 * from outside Obsidian can drop most of the file-watcher events, leaving
 * hundreds of tiles unindexed for minutes — a TFile-only read then silently
 * starves the detection scan AND the tileset probe (a padded hex pack probed
 * through the gap loses its hexWidth mapping and draws at the wrong size).
 */
async function readTileImageBinary(app: App, vaultPath: string): Promise<ArrayBuffer | null> {
  const file = app.vault.getAbstractFileByPath(vaultPath);
  if (file instanceof TFile) return await app.vault.readBinary(file);
  try {
    if (await app.vault.adapter.exists(vaultPath)) {
      return await app.vault.adapter.readBinary(vaultPath);
    }
  } catch {
    /* unreadable — treated as missing below */
  }
  return null;
}

/**
 * Measure alpha coverage of a tile image (fraction of non-transparent pixels).
 * Used to auto-detect fitMode: high coverage = hex-filling terrain, low = stamp/object.
 */
async function measureAlphaCoverage(app: App, tile: TileEntry): Promise<number | null> {
  try {
    const file = app.vault.getAbstractFileByPath(tile.vaultPath);
    if (!(file instanceof TFile)) return null;

    const binary = await app.vault.readBinary(file);
    const blob = new Blob([binary]);
    const url = URL.createObjectURL(blob);

    const result = await new Promise<number | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (w === 0 || h === 0) { resolve(null); URL.revokeObjectURL(url); return; }

        const canvas = activeWindow.createEl('canvas');
        canvas.width = w;
        canvas.height = h;
        // willReadFrequently: software-backed canvas so getImageData doesn't stall the GPU.
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) { resolve(null); URL.revokeObjectURL(url); return; }
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, w, h).data;

        let opaque = 0;
        const total = w * h;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] > 10) opaque++;
        }

        resolve(opaque / total);
        URL.revokeObjectURL(url);
      };
      img.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
      img.src = url;
    });

    return result;
  } catch {
    return null;
  }
}

/**
 * Deterministic probe candidate order: shallowest folder first, then path.
 * Determinism matters because vault scan order varies between mounts (index
 * churn), which fed different probe samples — and thus different tileset
 * geometry — to every reload. Depth-first matters MORE: a pack's primary
 * tiles live at the folder root while decorations live in subfolders, and a
 * plain path sort put "Extras/" banners ahead of the "Hex - *" tiles — the
 * probe sampled five ribbons, no hexagon verdict survived, and every hex
 * tile fell back to legacy mapping at half size.
 */
function probeCandidateOrder(tiles: TileEntry[]): TileEntry[] {
  const depth = (p: string): number => p.split('/').length;
  return [...tiles].sort((a, b) =>
    depth(a.vaultPath) - depth(b.vaultPath) || a.vaultPath.localeCompare(b.vaultPath));
}

/**
 * Probe tile images to find the dominant (most common) pixel dimensions.
 * Samples up to 5 images, skipping tiny ones (< 64px), and returns
 * the most frequently occurring size plus alpha coverage for fitMode detection.
 */
async function probeFirstTileImage(app: App, tiles: TileEntry[]): Promise<{
  width: number;
  height: number;
  alphaCoverage?: number;
  artOrientation?: 'flat' | 'pointy';
  /** Set only for padded hex art (hexagon smaller than its image) — see below. */
  hexWidth?: number;
  hexHeight?: number;
  overflowTop?: number;
} | null> {
  const MIN_SIZE = 64;
  const MAX_PROBES = 5;
  const sizes: { width: number; height: number }[] = [];
  // All probed tiles per size key — hex-art classification tries each candidate
  // at the winning size in turn, because a single sample can defeat the mask
  // gates (e.g. tree canopy overflowing a 2MT forest hex) while its clean
  // same-size siblings classify fine.
  const tilesBySize = new Map<string, TileEntry[]>();

  const ordered = probeCandidateOrder(tiles);

  for (const tile of ordered) {
    if (sizes.length >= MAX_PROBES) break;
    try {
      const binary = await readTileImageBinary(app, tile.vaultPath);
      if (binary == null) continue;
      const blob = new Blob([binary]);
      const url = URL.createObjectURL(blob);

      const dims = await new Promise<{ width: number; height: number } | null>((resolve) => {
        const img = new Image();
        img.onload = () => {
          resolve({ width: img.naturalWidth, height: img.naturalHeight });
          URL.revokeObjectURL(url);
        };
        img.onerror = () => {
          resolve(null);
          URL.revokeObjectURL(url);
        };
        img.src = url;
      });

      if (dims && dims.width >= MIN_SIZE && dims.height >= MIN_SIZE) {
        sizes.push(dims);
        const key = `${dims.width}x${dims.height}`;
        const list = tilesBySize.get(key);
        if (list == null) tilesBySize.set(key, [tile]);
        else list.push(tile);
      }
    } catch {
      continue;
    }
  }

  if (sizes.length === 0) return null;

  // Return the most common size
  const counts = new Map<string, { count: number; dims: { width: number; height: number } }>();
  for (const s of sizes) {
    const key = `${s.width}x${s.height}`;
    const entry = counts.get(key);
    if (entry) {
      entry.count++;
    } else {
      counts.set(key, { count: 1, dims: s });
    }
  }

  let best = sizes[0];
  let bestCount = 0;
  for (const entry of counts.values()) {
    if (entry.count > bestCount) {
      bestCount = entry.count;
      best = entry.dims;
    }
  }

  // Analyze every probed candidate at the winning size. The ORIENTATION comes
  // from the first candidate whose hexagon gates pass; the METRICS come from
  // the most corner-symmetric candidate — decorations can defeat the gates or
  // pollute a corner on some tiles (2MT forests) while identical-dimension
  // siblings measure the true face cleanly.
  let orientation: 'flat' | 'pointy' | undefined;
  let metrics: HexArtAnalysis | undefined;
  for (const sample of tilesBySize.get(`${best.width}x${best.height}`) ?? []) {
    const a = await detectHexArtAnalysis(app, sample);
    if (a == null) continue;
    orientation ??= a.verdict;
    if (metrics == null || a.cornerSkew < metrics.cornerSkew) metrics = a;
  }

  // Padded hex art (hexagon floating in transparent margin, e.g. 2MT world map
  // tiles: a 224x194 image whose face+skirt occupy only the central ~116px):
  // derive cell-mapping dimensions from the measured hexagon so the face fills
  // its cell exactly. Art that spans its image keeps the legacy mapping.
  if (orientation != null && metrics != null && metrics.hexWidth < best.width * HEX_PADDED_WIDTH_FRACTION) {
    // Face width → cell width, PLUS edge bleed: storing the measured width
    // divided by (1+bleed) makes the renderer draw the face slightly larger
    // than the cell, so its ink overshoots the boundary and buries the grid
    // line. hexHeight is the effective face's regular-hexagon height
    // UNROUNDED so the renderer's scaleY equals scaleX exactly (zero aspect
    // distortion — the art is drawn uniformly scaled, never stretched).
    const effWidth = metrics.hexWidth / (1 + HEX_ART_EDGE_BLEED);
    const hexHeight = orientation === 'flat'
      ? effWidth * (Math.sqrt(3) / 2)
      : effWidth * (2 / Math.sqrt(3));
    return {
      ...best,
      artOrientation: orientation,
      hexWidth: effWidth,
      hexHeight,
      // COVERAGE anchor: the fitted face center guarantees every grid edge is
      // covered with zero excess at the top (fitHexCellCenterY); the renderer
      // centers the hex band [overflowTop, overflowTop+hexHeight) on the
      // cell, so a band centered on the fit is exactly that anchor. Falls
      // back to the corner-line (widest-row) center when no full-coverage
      // position exists. The 3D skirt hangs into the southern neighbor's
      // cell, where the world-y painter order (south draws over north)
      // covers it.
      overflowTop: Math.max(0, (metrics.cellFitCenterY ?? metrics.cornerRowY) - hexHeight / 2),
    };
  }

  return { ...best, artOrientation: orientation };
}

/** Alpha coverage threshold: above this → hex-filling (fill), below → stamp (contain) */
const ALPHA_COVERAGE_THRESHOLD = 0.6;

// ===========================================
// Art Orientation Detection
// ===========================================

/** Alpha value above which a pixel counts as opaque for mask analysis. */
const MASK_ALPHA_THRESHOLD = 25;
/** Opaque-bbox coverage above this reads as square/rect art, not a hexagon. */
const MASK_SQUARE_COVERAGE = 0.88;
/** A hexagon has a straight-edge zone spanning a large fraction of its bbox
 *  (full-width rows for pointy art, full-height columns for flat art). Blobby
 *  props (trees, rocks) don't — this gate keeps them out of adaptation. */
const MASK_HEX_EDGE_FRACTION = 0.18;
/** Bottom-band width below this fraction of the bbox = bottom vertex (pointy). */
const MASK_POINTY_BOTTOM_FRACTION = 0.38;
/** Hexagon narrower than this fraction of its image width = padded art →
 *  cell sizing switches to the measured hexagon. At or above it, the art
 *  spans its image and the legacy image-dimension mapping stays untouched. */
const HEX_PADDED_WIDTH_FRACTION = 0.95;
/** Edge bleed for padded hex art: the face draws this fraction LARGER than
 *  the cell, so its ink overshoots the boundary and buries the grid line.
 *  Ink that merely TOUCHES the boundary leaves the line's outer half visible
 *  (measured 2026-08-05: top edges 38/39 grid-visible at exact-fit scale).
 *  2% ≈ 2.6px per side at zoom 1.6 — past a 1–2px grid line + AA, and the
 *  overshoot stays proportional across zoom levels. */
const HEX_ART_EDGE_BLEED = 0.02;

/** Hexagonal art classified from its opaque alpha mask. */
interface HexArtMask {
  orientation: 'flat' | 'pointy';
  /** Widest opaque row in px — the hexagon's true width for both orientations
   *  (corner-to-corner for flat art, edge-to-edge for pointy art). */
  hexWidth: number;
}

/**
 * Full mask analysis. Metrics are measured for every hexagon-plausible mask;
 * `verdict` is set only when the strict hexagon-signature gates pass. The two
 * are separate because decorations (tree canopy, bushes) can defeat the gates
 * or pollute a corner on SOME tiles of a hex pack while identical-dimension
 * siblings measure cleanly — the probe classifies from any gate-passer but
 * takes metrics from the most corner-symmetric candidate.
 */
interface HexArtAnalysis {
  /** Orientation when the hexagon gates pass; undefined for decorated or
   *  ambiguous masks (whose metrics may still be valid family measurements). */
  verdict?: 'flat' | 'pointy';
  hexWidth: number;
  /** Vertical midpoint (px from image top) of the widest-row band — the line
   *  through the face's side corner points. Aligning it to the cell's center
   *  line lands the corners exactly in the cell's corner crooks. */
  cornerRowY: number;
  /** Horizontal midpoint of the corner row's opaque span — the face's true
   *  x-center even when the art floats off-center in its image. */
  cornerRowCenterX: number;
  /** Coverage-fitted face center: the HIGHEST cell-polygon position whose
   *  entire boundary lands on ink (see fitHexCellCenterY). Preferred over
   *  cornerRowY when available — it guarantees every grid edge is covered
   *  with zero excess at the top. Absent when no position fully covers. */
  cellFitCenterY?: number;
  /** Top edge of the opaque pixels (minY). For an undecorated hex tile this
   *  is the face's top edge — the skirt only extends the bounds DOWNWARD, so
   *  a clean candidate's opaque top anchors the face onto the cell. */
  opaqueTop: number;
  /** Exclusive bottom edge of the opaque pixels (maxY + 1) — the bottom of the
   *  art's 3D skirt. Decorations (canopy, hill bumps) sit ABOVE the face, so
   *  the opaque bottom is stable face+skirt geometry across a hex family. */
  opaqueBottom: number;
  /** Top y of the leftmost/rightmost opaque columns — the corner tips. For
   *  flat art the corner tips sit exactly on the face mid-line; for pointy art
   *  they are the tops of the vertical edges (hexWidth/(2·√3) above center).
   *  Canopy never reaches the extreme columns and skirts extrude corners
   *  DOWNWARD, so the tip tops are decoration-immune face geometry. */
  tipTopL: number;
  tipTopR: number;
  /** |tipTopL − tipTopR|: corner symmetry. Art touching one corner column
   *  (a 2MT forest canopy) skews this — high skew means unreliable metrics. */
  cornerSkew: number;
}

/**
 * Analyze a tile's opaque mask: corner-tip metrics plus a gated orientation
 * verdict. Pure — operates on an alpha accessor so tests can feed synthetic
 * masks.
 *
 * Pointy-top art narrows to a vertex at the bottom of its opaque bounds;
 * flat-top art ends in a wide horizontal edge. Square-ish art (seamless
 * textures) and empty/tiny masks return undefined; blobby props return
 * metrics without a verdict.
 */
function analyzeTileArtMask(
  alphaAt: (x: number, y: number) => number,
  width: number,
  height: number
): HexArtAnalysis | undefined {
  let minX = width, maxX = -1, minY = height, maxY = -1;
  let opaque = 0;
  // Row/column opaque extents in one pass
  const rowMin = new Array<number>(height).fill(width);
  const rowMax = new Array<number>(height).fill(-1);
  const colMin = new Array<number>(width).fill(height);
  const colMax = new Array<number>(width).fill(-1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alphaAt(x, y) <= MASK_ALPHA_THRESHOLD) continue;
      opaque++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x < rowMin[y]) rowMin[y] = x;
      if (x > rowMax[y]) rowMax[y] = x;
      if (y < colMin[x]) colMin[x] = y;
      if (y > colMax[x]) colMax[x] = y;
    }
  }
  if (maxX < 0) return undefined;

  const bboxW = maxX - minX + 1;
  const bboxH = maxY - minY + 1;
  if (bboxW < 8 || bboxH < 8) return undefined;

  const coverage = opaque / (bboxW * bboxH);
  if (coverage > MASK_SQUARE_COVERAGE) return undefined;

  // Hexagon signature: pointy art has a run of full-width rows (its vertical
  // edges); flat art has a run of full-height columns. Either qualifies.
  let fullWidthRows = 0;
  for (let y = minY; y <= maxY; y++) {
    if (rowMax[y] >= 0 && (rowMax[y] - rowMin[y] + 1) >= bboxW * 0.97) fullWidthRows++;
  }
  let fullHeightCols = 0;
  for (let x = minX; x <= maxX; x++) {
    if (colMax[x] >= 0 && (colMax[x] - colMin[x] + 1) >= bboxH * 0.97) fullHeightCols++;
  }
  const edgeFraction = Math.max(fullWidthRows / bboxH, fullHeightCols / bboxW);

  // Bottom band: vertex (narrow) = pointy, edge (wide) = flat. The bottom is
  // used rather than the top because overflow art (tree canopy, mountain
  // peaks) sits above the hex area, never below it.
  const bandStart = maxY - Math.max(2, Math.round(bboxH * 0.05));
  let bandWidth = 0;
  for (let y = Math.max(minY, bandStart); y <= maxY; y++) {
    if (rowMax[y] >= 0) bandWidth = Math.max(bandWidth, rowMax[y] - rowMin[y] + 1);
  }
  const orientation = bandWidth / bboxW < MASK_POINTY_BOTTOM_FRACTION ? 'pointy' : 'flat';

  let maxRowWidth = 0;
  for (let y = minY; y <= maxY; y++) {
    if (rowMax[y] >= 0) maxRowWidth = Math.max(maxRowWidth, rowMax[y] - rowMin[y] + 1);
  }
  // Corner line: the FIRST row at maximum width — the line through the face's
  // side corner points. First, not band-midpoint: the 3D skirt extrudes the
  // corners straight down, keeping rows at max width BELOW the corner line,
  // so any midpoint measure gets dragged down by half the skirt height. For
  // pointy art the max-width band is the side-edge run and its top sits a
  // known hexWidth/(2·√3) above the face mid-line.
  let cornerFirst = minY;
  for (let y = minY; y <= maxY; y++) {
    if (rowMax[y] >= 0 && (rowMax[y] - rowMin[y] + 1) >= maxRowWidth) { cornerFirst = y; break; }
  }
  const cornerRowY = orientation === 'pointy'
    ? cornerFirst + maxRowWidth / (2 * Math.sqrt(3))
    : cornerFirst;
  const cornerRowCenterX = (rowMin[cornerFirst] + rowMax[cornerFirst] + 1) / 2;

  const tipTopL = colMin[minX];
  const tipTopR = colMin[maxX];
  return {
    verdict: edgeFraction >= MASK_HEX_EDGE_FRACTION ? orientation : undefined,
    hexWidth: maxRowWidth,
    cornerRowY,
    cornerRowCenterX,
    opaqueTop: minY,
    opaqueBottom: maxY + 1,
    tipTopL,
    tipTopR,
    cornerSkew: Math.abs(tipTopL - tipTopR),
  };
}

/**
 * Coverage fit: slide the cell polygon vertically over the mask and return
 * the HIGHEST position (smallest center y) at which EVERY boundary point of
 * the cell hexagon lands on ink. Drawing anchored there puts the art as low
 * as possible while still covering every grid edge — "just barely covers,
 * pixel perfect" (product owner spec, 2026-08-05). Decorations (canopy,
 * peaks) only ADD ink so they never constrain the fit; the skirt makes the
 * bottom edges generous, leaving the upper edges — where an uncovered grid
 * line is actually visible — as the binding constraint. Returns undefined
 * when no position in the search window achieves full coverage (caller falls
 * back to the corner-line anchor).
 *
 * Pure — operates on an alpha accessor so tests can feed synthetic masks.
 */
function fitHexCellCenterY(
  alphaAt: (x: number, y: number) => number,
  width: number,
  height: number,
  hexWidth: number,
  orientation: 'flat' | 'pointy',
  centerX: number,
  aroundY: number,
  /** Art px added below the minimal covering position, so the top boundary
   *  settles this deep into ink instead of exactly at its edge (a boundary
   *  at the ink's very edge leaves the outer half of the grid line showing).
   *  Callers pass the edge-bleed margin. @default 0 */
  settleMargin = 0,
): number | undefined {
  const R = hexWidth / 2;
  const S3 = Math.sqrt(3);
  const verts: Array<[number, number]> = orientation === 'flat'
    ? [[R, 0], [R / 2, R * S3 / 2], [-R / 2, R * S3 / 2], [-R, 0], [-R / 2, -R * S3 / 2], [R / 2, -R * S3 / 2]]
    : (() => {
        const s = hexWidth / S3;
        return [[R, s / 2], [0, s], [-R, s / 2], [-R, -s / 2], [0, -s], [R, -s / 2]] as Array<[number, number]>;
      })();
  // Raster tolerance: any of the 4 pixels around the sample point being inked
  // counts as covering — a polygon edge lies BETWEEN pixel centers.
  const covered = (x: number, y: number): boolean => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        const px = x0 + dx, py = y0 + dy;
        if (px >= 0 && py >= 0 && px < width && py < height && alphaAt(px, py) > MASK_ALPHA_THRESHOLD) return true;
      }
    }
    return false;
  };
  const fits = (cy: number): boolean => {
    for (let e = 0; e < 6; e++) {
      const [ax, ay] = verts[e];
      const [bx, by] = verts[(e + 1) % 6];
      const steps = Math.max(4, Math.ceil(Math.hypot(bx - ax, by - ay)));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        if (!covered(centerX + ax + (bx - ax) * t, cy + ay + (by - ay) * t)) return false;
      }
    }
    return true;
  };
  const span = Math.max(6, Math.round(hexWidth * 0.08));
  for (let cy = aroundY - span; cy <= aroundY + span; cy += 0.5) {
    if (fits(cy)) return cy + settleMargin;
  }
  return undefined;
}

/**
 * Classify hexagonal tile art orientation from its opaque mask — verdict-only
 * view of analyzeTileArtMask for consumers that need a per-tile yes/no
 * (the import scan's hexArt signal).
 */
function classifyTileArtMask(
  alphaAt: (x: number, y: number) => number,
  width: number,
  height: number
): HexArtMask | undefined {
  const a = analyzeTileArtMask(alphaAt, width, height);
  if (a?.verdict == null) return undefined;
  return { orientation: a.verdict, hexWidth: a.hexWidth };
}

/**
 * Analyze one probed tile's art by decoding its image and running the
 * alpha-mask analysis at full resolution.
 */
async function detectHexArtAnalysis(app: App, tile: TileEntry): Promise<HexArtAnalysis | undefined> {
  try {
    const binary = await readTileImageBinary(app, tile.vaultPath);
    if (binary == null) return undefined;
    const url = URL.createObjectURL(new Blob([binary]));
    return await new Promise<HexArtAnalysis | undefined>((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const w = img.naturalWidth;
          const h = img.naturalHeight;
          const canvas = activeWindow.createEl('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx || w === 0 || h === 0) { resolve(undefined); return; }
          ctx.drawImage(img, 0, 0);
          const data = ctx.getImageData(0, 0, w, h).data;
          const alphaAt = (x: number, y: number): number => data[(y * w + x) * 4 + 3];
          const a = analyzeTileArtMask(alphaAt, w, h);
          if (a?.verdict != null) {
            // Fit the EFFECTIVE cell polygon (cell size after edge bleed —
            // smaller than the ink hexagon), so the boundary sits inside the
            // ink by the bleed margin and the grid line stays buried.
            const effWidth = a.hexWidth / (1 + HEX_ART_EDGE_BLEED);
            // Settle one full bleed margin + 1px: deep enough that the face's
            // OPAQUE band (not its AA fringe) owns the boundary, and covers
            // sibling tiles whose face sits a couple art-px higher in their
            // image than this calibration candidate (per-tile authoring
            // variance — a forest's skirt peeking over the neighbor below).
            const settle = (a.hexWidth - effWidth) + 1;
            const fit = fitHexCellCenterY(alphaAt, w, h, effWidth, a.verdict, a.cornerRowCenterX, a.cornerRowY, settle);
            if (fit != null) a.cellFitCenterY = fit;
          }
          resolve(a);
        } catch {
          resolve(undefined);
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = () => { resolve(undefined); URL.revokeObjectURL(url); };
      img.src = url;
    });
  } catch {
    return undefined;
  }
}

/**
 * Create a TilesetDef by scanning a vault folder for tile images.
 * Call probeFirstTileImage() first for accurate dimensions.
 */
function createTilesetFromTiles(
  folderPath: string,
  name: string,
  tiles: TileEntry[],
  options?: {
    tileWidth?: number;
    tileHeight?: number;
    hexWidth?: number;
    hexHeight?: number;
    fitMode?: 'fill' | 'contain';
    overflowTop?: number;
    overflowBottom?: number;
    artOrientation?: 'flat' | 'pointy';
  }
): FolderTileset {
  const tileWidth = options?.tileWidth ?? 256;
  const tileHeight = options?.tileHeight ?? 256;

  const detected = autoDetectOverflow(tileWidth, tileHeight);

  // Provenance: Dungeondraft imports extract under `.../dungeondraft-packs/`,
  // so a tile path under that segment marks the whole set as DD-origin.
  const origin: TilesetOrigin = tiles.some(t => t.vaultPath.includes('/dungeondraft-packs/'))
    ? 'dungeondraft'
    : 'native';

  return {
    source: 'folder' as const,
    id: generateTilesetId(folderPath),
    name,
    origin,
    folderPath,
    tileWidth,
    tileHeight,
    hexWidth: options?.hexWidth,
    hexHeight: options?.hexHeight ?? detected.hexHeight,
    overflowTop: options?.overflowTop ?? detected.overflowTop,
    overflowBottom: options?.overflowBottom ?? detected.overflowBottom,
    fitMode: options?.fitMode,
    artOrientation: options?.artOrientation,
    tiles,
  };
}

async function createTileset(
  folderPath: string,
  name: string,
  options?: {
    tileWidth?: number;
    tileHeight?: number;
    hexHeight?: number;
    fitMode?: 'fill' | 'contain';
    overflowTop?: number;
    overflowBottom?: number;
    artOrientation?: 'flat' | 'pointy';
  }
): Promise<TilesetDef> {
  const tiles = await scanTilesetFolder(getApp(), folderPath);
  return createTilesetFromTiles(folderPath, name, tiles, options);
}

// ===========================================
// Module Exports
// ===========================================

export { scanTilesetFolder, createTileset, createTilesetFromTiles, probeFirstTileImage, probeCandidateOrder, measureAlphaCoverage, autoDetectOverflow, generateTilesetId, classifyTileArtMask, analyzeTileArtMask, detectHexArtAnalysis, fitHexCellCenterY, readTileImageBinary, resolveTileEntry, tileIdBasename, mintTileId, ALPHA_COVERAGE_THRESHOLD };
export type { HexArtMask, HexArtAnalysis };