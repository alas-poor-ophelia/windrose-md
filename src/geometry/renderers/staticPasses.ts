/**
 * staticPasses.ts
 *
 * The static map content (everything that only depends on map data and the
 * viewport transform) as named passes over one RenderFrame. Moved verbatim
 * from useCanvasRenderer.ts's drawStaticContent closure (wave 8,
 * STRUCT-A-29 / ABS-05); the pass bodies are unchanged, only their inputs
 * now arrive as (frame, scene, kit) instead of closed-over locals.
 *
 * Draw order (drawStaticScene): background image, canvas-state reset, grid,
 * board-below ghost, layer-below ghost, adjacent sub-hex previews, layer
 * composite (cells/edges, curves, wall paths, tiles), regions, outlines,
 * player lights, shape overlays, sub-hex indicators, objects, text labels.
 *
 * Lattice ladder (scene.ladder non-null): the grid is NOT baked (the live
 * lattice is stroked after the blit), the cells pass draws the active rung's
 * materialised layer at level >= 1, tiles draw per home rung with the
 * crossing clip, adjacent sub-hex previews are skipped, and objects/labels
 * are drawn live after the blit (mapRenderer.ts) instead of baked here.
 */

import type { MapData, MapLayer, Board } from '#types/core/map.types';
import type { MapObject } from '#types/objects/object.types';
import type { LayerVisibility } from '#types/contexts/context.types';
import type { RenderCanvasOptions, RendererViewState } from '#types/hooks/canvasRenderer.types';
import type { RenderFrame } from '#types/rendering/renderFrame.types';
import type { GeometryLadder } from '../core/createGeometryLadder';

import { isGridCell } from '#types/core/cell.types';
import { getObjectType } from '../../objects/objectOperations';
import { getRenderChar } from '../../objects/objectTypeResolver';
import { getCellColor } from '../../drawing/colorOperations';
import { renderNoteLinkBadge, renderTooltipIndicator, renderObjectLinkIndicator } from './badgeRenderer';
import { renderTextLabels } from './textLabelRenderer';
import { renderGridBackgroundImage } from './backgroundRenderer';
import { renderObjects } from './objectRenderer';
import { getFontCss } from '../../text/fontOptions';
import { renderRegions } from './regionRenderer';
import { renderOutlines } from './outlineRenderer';
import { renderShapeOverlays, renderPlayerLights } from './shapeOverlayRenderer';
import { renderTiles } from './tileRenderer';
import { renderCurves } from './curveRenderer';
import { renderWallPaths } from './wallPathRenderer';
import { buildMergeIndex } from '../curves/curveCellOverlap';
import { getCachedImage } from '../../assets/imageOperations';
import { isCellFoggedIndexed } from '../fog/foggedCellIndex';
import { getSlotOffset, getMultiObjectScale, getObjectsInCell } from '../../objects/hexSlotPositioner';
import { offsetToAxial } from '../core/offsetCoordinates';
import { getLayerBelow, getBoardLayers } from '../../persistence/layerAccessor';
import { renderLayerCellsAndEdges } from './layerCellsRenderer';
import type { Renderer, CurveCellMergeIndex } from './layerCellsRenderer';
import { GHOST_BOARD_OPACITY, INTERIOR_RATIO } from './renderConstants';
import { ladderTileClipAt } from '../../core/lodFlags';
import { tilesByHomeForRung } from './elementBands';
import { deepRootCellKeys } from './tileClipRegion';
import { materialiseLevelLayer } from '../core/materialiseLevel';

/**
 * Lattice epoch: bumped only when cell EXISTENCE changes. In Phase 1 existence is
 * a pure function of the root bounds, which live in the ladder itself, so a new
 * bounds means a new ladder identity and the epoch never has to move.
 */
const LADDER_EPOCH = 0;

/**
 * Per-render map inputs shared by every static pass (independent of which
 * target the frame draws to).
 */
interface StaticScene {
  mapData: MapData;
  /** Edit target: objects/text/fog/regions read it. */
  activeLayer: MapLayer;
  /** Layers whose cells/curves/tiles are composited, in draw order. */
  renderLayers: MapLayer[];
  /** Image export only: per-layer opacity by layer id. */
  exportOpacityById: Map<string, number> | null;
  isStrata: boolean;
  activeBoard: Board | null;
  boardBelow: Board | null;
  visibility: LayerVisibility;
  renderer: Renderer;
  scaledSize: number;
  showCoordinates: boolean;
  adjacentSubHexes: RenderCanvasOptions['adjacentSubHexes'];
  adjacentEmptySlots: RenderCanvasOptions['adjacentEmptySlots'];
  hiddenTileLayers: RenderCanvasOptions['hiddenTileLayers'];
  draggingWallId: string | null;
  /** Lattice ladder for this map, or null on every classic path. */
  ladder: GeometryLadder | null;
  /** Rung this frame paints; always 0 without a ladder. */
  level: number;
}

/** Values derived once per static draw, shared by the ghost and composite passes. */
interface StaticPassKit {
  tileGeomShim: Parameters<typeof renderTiles>[3];
  curveGridConfig: { cellSize: number; lineColor: string; lineWidth: number; interiorRatio: number } | undefined;
  wallCellSize: number;
}

function makeRenderFrame(
  ctx: CanvasRenderingContext2D,
  geometry: RenderFrame['geometry'],
  theme: RenderFrame['theme'],
  offsetX: number,
  offsetY: number,
  zoom: number,
  width: number,
  height: number,
  cullNorth: number
): RenderFrame {
  const viewState: RendererViewState = { x: offsetX, y: offsetY, zoom };
  return { ctx, geometry, theme, offsetX, offsetY, zoom, width, height, cullNorth, viewState };
}

/**
 * Object renderer dependencies, shared by the baked pass (classic maps) and the
 * live element pass (ladder maps, mapRenderer.ts).
 */
function objectRenderDeps(mapData: MapData): Parameters<typeof renderObjects>[5] {
  const mapType = mapData.mapType ?? 'grid';
  return {
    getObjectType: (typeId: string): ReturnType<typeof getObjectType> => getObjectType(typeId, mapType, mapData.objectSetId),
    getRenderChar,
    isCellFogged: isCellFoggedIndexed,
    getObjectsInCell,
    getSlotOffset,
    getMultiObjectScale,
    renderNoteLinkBadge,
    renderTooltipIndicator,
    renderObjectLinkIndicator,
    getCachedImage,
  };
}

/**
 * Tiles under the ladder (kgc.6 / kgc.22), for the active layer and both ghost
 * passes alike: each tile draws ONCE on its HOME rung's geometry (world-anchored
 * at the parent's rect) and a tile homed finer than the active rung is skipped.
 * At rungs >= 1 root tiles take the 'smart' clip by default (kgc.26): each is
 * clipped to its own hexagon plus every neighbour WITHOUT deep content, so its
 * art never covers a neighbour's deep paint yet still runs across empty ones;
 * a tile with no deep neighbour draws unclipped. The developer knob can swap
 * in the whole-hex clip ('hex') or none. Level 0 stays unclipped like the
 * classic path. `tilesets` stay the root list. Groups run sequentially
 * (renderTiles' scratch canvases are not reentrant); the root-anchored
 * terrain strokes ride with home 0.
 */
function renderLadderTiles(
  frame: RenderFrame,
  scene: StaticScene,
  layer: MapLayer,
  opacity: number,
  hiddenLayers: Set<string> | undefined
): void {
  const { ladder, level, mapData } = scene;
  if (ladder === null) return;
  const { ctx, width, height, viewState: rendererViewState } = frame;
  const tileClipMode = ladderTileClipAt(level);
  const deepRoots = tileClipMode === 'smart' && level >= 1 ? deepRootCellKeys(layer, ladder, level) : undefined;
  for (const [home, homeTiles] of tilesByHomeForRung(layer.tiles ?? [], level)) {
    const strokes = home === 0 ? layer.terrainStrokes : undefined;
    if (homeTiles.length === 0 && (strokes == null || strokes.length === 0)) continue;
    const homeGeom = ladder.geometryForLevel(home);
    const homeShim = { hexToWorld: homeGeom.hexToWorld.bind(homeGeom), worldToScreen: homeGeom.worldToScreen.bind(homeGeom), hexSize: homeGeom.hexSize, orientation: mapData.orientation ?? 'flat' };
    renderTiles(
      ctx,
      homeTiles,
      mapData.tilesets ?? [],
      homeShim,
      rendererViewState,
      { opacity, getCachedImage, canvasWidth: width, canvasHeight: height, hiddenLayers, terrainStrokes: strokes,
        clipToHex: tileClipMode === 'hex', deepRoots: home === 0 ? deepRoots : undefined }
    );
  }
}

function makeStaticPassKit(frame: RenderFrame, scene: StaticScene): StaticPassKit {
  const { geometry, theme: THEME } = frame;
  const { mapData } = scene;
  // Tile rendering geometry shim (works for both hex and grid)
  const tileGeomShim = geometry.type === 'hex'
    ? { hexToWorld: geometry.hexToWorld.bind(geometry), worldToScreen: geometry.worldToScreen.bind(geometry), hexSize: geometry.hexSize, orientation: mapData.orientation ?? 'flat' }
    : { hexToWorld: geometry.getCellCenter.bind(geometry), worldToScreen: geometry.worldToScreen.bind(geometry), hexSize: geometry.cellSize, orientation: 'grid' };

  // Shared by the ghost passes and the main layer loop (derived once).
  const curveGridConfig = geometry.type === 'grid'
    ? { cellSize: geometry.cellSize, lineColor: THEME.grid.lines, lineWidth: THEME.grid.lineWidth ?? 1, interiorRatio: INTERIOR_RATIO }
    : undefined;
  const wallCellSize = geometry.type === 'grid' ? geometry.cellSize : geometry.hexSize;
  return { tileGeomShim, curveGridConfig, wallCellSize };
}

/** Background image, canvas-state reset, then grid lines. */
function renderBackgroundAndGrid(frame: RenderFrame, scene: StaticScene): void {
  const { ctx, geometry, offsetX, offsetY, zoom, width, height, cullNorth, theme: THEME, viewState: rendererViewState } = frame;
  const { mapData, renderer, visibility } = scene;

  // Draw background image (both grid and hex maps)
  const bgImage = mapData.backgroundImage?.path != null && mapData.backgroundImage.path !== '' ? getCachedImage(mapData.backgroundImage.path) : null;
  const isHexMapForBg = geometry.type === 'hex';
  const boundsOrDimensions = isHexMapForBg
    ? mapData.hexBounds
    : mapData.dimensions ?? { width: 300, height: 300 };
  renderer.renderBackgroundImage(
    ctx,
    geometry,
    bgImage,
    mapData.backgroundImage as { path: string; offsetX?: number; offsetY?: number; opacity?: number; imageGridSize?: number } | undefined,
    boundsOrDimensions,
    mapData.orientation ?? 'flat',
    offsetX,
    offsetY,
    zoom,
    renderGridBackgroundImage
  );

  // iOS defensive: Reset canvas state
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // Reset clipping region
  ctx.save();
  ctx.beginPath();
  const largeClip = Math.max(width, height) * 4;
  ctx.rect(-largeClip, -largeClip, largeClip * 2, largeClip * 2);
  ctx.clip();
  ctx.restore();

  // Draw grid lines. Under the ladder the grid is NOT baked at any level: a baked
  // lattice thickens under the crossing scale-blit, so `drawLadderLattice` strokes
  // it live in screen space after the blit instead (mapRenderer.ts).
  if (scene.ladder === null) {
    renderer.renderGrid(ctx, geometry, rendererViewState, { width, height }, visibility.grid !== false, {
      lineColor: THEME.grid.lines,
      lineWidth: THEME.grid.lineWidth ?? 1,
      rotated: cullNorth % 360 !== 0
    });
  }
}

/**
 * One ghost pass (board-below or layer-below): cells/edges, tiles + terrain
 * strokes, curves, wall paths, in that order, at the ghost opacity.
 */
function renderGhostLayer(frame: RenderFrame, scene: StaticScene, kit: StaticPassKit, ghostLayer: MapLayer, ghostOpacity: number): void {
  const { ctx, geometry, width, height, cullNorth, theme: THEME, viewState: rendererViewState } = frame;
  const { mapData, renderer, visibility } = scene;
  const { tileGeomShim, curveGridConfig, wallCellSize } = kit;
  renderLayerCellsAndEdges(ctx, ghostLayer, geometry, rendererViewState, THEME, renderer, {
    opacity: ghostOpacity,
    showGrid: visibility.grid !== false,
    northDirection: cullNorth
  });
  const hasTiles = ghostLayer.tiles != null && ghostLayer.tiles.length > 0;
  const hasStrokes = ghostLayer.terrainStrokes != null && ghostLayer.terrainStrokes.length > 0;
  if ((hasTiles || hasStrokes) && mapData.tilesets != null && mapData.tilesets.length > 0) {
    if (scene.ladder !== null) {
      renderLadderTiles(frame, scene, ghostLayer, ghostOpacity, undefined);
    } else {
      renderTiles(
        ctx,
        ghostLayer.tiles ?? [],
        mapData.tilesets,
        tileGeomShim,
        rendererViewState,
        { opacity: ghostOpacity, getCachedImage, canvasWidth: width, canvasHeight: height, terrainStrokes: ghostLayer.terrainStrokes }
      );
    }
  }
  if (ghostLayer.curves.length > 0) {
    renderCurves(ctx, ghostLayer.curves, rendererViewState, THEME, { opacity: ghostOpacity, gridConfig: curveGridConfig });
  }
  if (ghostLayer.wallPaths != null && ghostLayer.wallPaths.length > 0 && mapData.tilesets != null && mapData.tilesets.length > 0) {
    renderWallPaths(ctx, ghostLayer.wallPaths, mapData.tilesets, rendererViewState, wallCellSize, {
      opacity: ghostOpacity,
      getCachedImage
    });
  }
}

/** Board-below ghost, then layer-below ghost. */
function renderGhostPasses(frame: RenderFrame, scene: StaticScene, kit: StaticPassKit): void {
  const { mapData, activeLayer, activeBoard, boardBelow, isStrata } = scene;

  // Draw board-below ghost (floor beneath the active board) if enabled. Works in
  // both simple and strata modes: renders every visible layer of the board below,
  // in ascending order, at the board's ghost opacity — for cross-floor alignment.
  if (boardBelow != null && activeBoard != null) {
    const ghostOpacity = activeBoard.boardBelowOpacity ?? GHOST_BOARD_OPACITY;
    const belowLayers = getBoardLayers(mapData, boardBelow.id).filter(l => l.visible !== false);
    for (const belowLayer of belowLayers) {
      renderGhostLayer(frame, scene, kit, belowLayer, ghostOpacity);
    }
  }

  // Draw ghost layer (layer below) if enabled. Disabled in strata mode: the
  // composite already draws the layer below at full opacity, so a ghost would
  // double-draw it.
  if (!isStrata && activeLayer.showLayerBelow === true) {
    const layerBelow = getLayerBelow(mapData, activeLayer.id);
    if (layerBelow) {
      renderGhostLayer(frame, scene, kit, layerBelow, activeLayer.layerBelowOpacity ?? GHOST_BOARD_OPACITY);
    }
  }
}

/** Adjacent sub-hex ghost previews and "+" empty-slot affordances (hex sub-maps). */
function renderAdjacentSubHexes(frame: RenderFrame, scene: StaticScene): void {
  const { ctx, geometry, offsetX, offsetY, zoom, width, height, cullNorth, theme: THEME } = frame;
  const { mapData, renderer, adjacentSubHexes, adjacentEmptySlots } = scene;

  // Draw adjacent sub-hex ghost previews (when drilled into a sub-hex).
  // Never under the ladder: one world has no sibling DOCUMENTS to ghost, so
  // the whole pass (and its "+" create-sibling affordances) is dead there.
  const MAX_ADJACENT_COMPLEXITY = 500;
  if (scene.ladder === null
    && ((adjacentSubHexes != null && adjacentSubHexes.length > 0)
    || (adjacentEmptySlots != null && adjacentEmptySlots.length > 0)) && geometry.type === 'hex') {
    const hexToWorldFn = geometry.hexToWorld;
    const hexSizeVal = geometry.hexSize;
    const maxRing = mapData.hexBounds?.maxRing ?? 7;

    // Compute world-space offset for each axial direction.
    // Two adjacent sub-hex grids tile when their centers are (2*maxRing+1) hex-steps apart.
    const tileStep = 2 * maxRing + 1;

    ctx.save();

    // Pre-build tile geometry wrapper once (shared across all adjacents)
    const adjTileGeom = mapData.tilesets != null && mapData.tilesets.length > 0
      ? { hexToWorld: hexToWorldFn.bind(geometry), worldToScreen: geometry.worldToScreen.bind(geometry), hexSize: hexSizeVal, orientation: mapData.orientation ?? 'flat' }
      : null;

    for (const adj of adjacentSubHexes ?? []) {
      const scaledQ = adj.dq * tileStep;
      const scaledR = adj.dr * tileStep;
      const worldOffset = hexToWorldFn.call(geometry, scaledQ, scaledR);

      // Create shifted view state: offset the canvas origin by the world-space delta
      const shiftedOffsetX = offsetX + worldOffset.worldX * zoom;
      const shiftedOffsetY = offsetY + worldOffset.worldY * zoom;
      const shiftedViewState: RendererViewState = { x: shiftedOffsetX, y: shiftedOffsetY, zoom };

      const adjLayers = adj.mapData.layers ?? [];

      // Skip detailed rendering for dense neighbors to cap render cost
      // (ladder: level-0 cells only on purpose; this is a neighbour-preview cost cap, not a content statement)
      const totalItems = adjLayers.reduce((sum: number, l: MapLayer) =>
        sum + (l.cells?.length ?? 0) + (l.tiles?.length ?? 0), 0);
      const isDense = totalItems > MAX_ADJACENT_COMPLEXITY;

      // Render cells, edges, and tiles only for non-dense neighbors
      if (!isDense) {
        for (const layer of adjLayers) {
          if (layer.cells.length > 0) {
            renderLayerCellsAndEdges(ctx, layer, geometry, shiftedViewState, THEME, renderer, {
              opacity: GHOST_BOARD_OPACITY,
              showGrid: false,
              northDirection: cullNorth
            });
          }
        }

        if (adjTileGeom != null && mapData.tilesets != null) {
          for (const layer of adjLayers) {
            if (layer.tiles != null && layer.tiles.length > 0) {
              renderTiles(
                ctx,
                layer.tiles,
                mapData.tilesets,
                adjTileGeom,
                shiftedViewState,
                { opacity: GHOST_BOARD_OPACITY, getCachedImage, canvasWidth: width, canvasHeight: height }
              );
            }
          }
        }
      }

      // Render adjacent name label near edge of current grid (not center of adjacent)
      ctx.save();
      ctx.globalAlpha = 0.5;
      const edgeQ = adj.dq * (maxRing + 2);
      const edgeR = adj.dr * (maxRing + 2);
      const edgeWorld = hexToWorldFn.call(geometry, edgeQ, edgeR);
      const labelScreen = geometry.worldToScreen(edgeWorld.worldX, edgeWorld.worldY, offsetX, offsetY, zoom);
      const labelFontSize = Math.max(10, 12 * zoom);
      ctx.font = `bold ${labelFontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const labelMetrics = ctx.measureText(adj.name);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(
        labelScreen.screenX - labelMetrics.width / 2 - 4,
        labelScreen.screenY - labelFontSize / 2 - 2,
        labelMetrics.width + 8,
        labelFontSize + 4
      );
      ctx.fillStyle = '#ffffff';
      ctx.fillText(adj.name, labelScreen.screenX, labelScreen.screenY);
      ctx.restore();
    }

    // "+" affordances for empty adjacent slots, drawn where the sibling's
    // label would sit. Clicking one creates/enters that sibling (hit-tested
    // in DungeonMapTracker's adjacent-click handler with the same geometry).
    for (const slot of adjacentEmptySlots ?? []) {
      const edgeQ = slot.dq * (maxRing + 2);
      const edgeR = slot.dr * (maxRing + 2);
      const edgeWorld = hexToWorldFn.call(geometry, edgeQ, edgeR);
      const markerScreen = geometry.worldToScreen(edgeWorld.worldX, edgeWorld.worldY, offsetX, offsetY, zoom);
      const markerRadius = Math.max(12, 14 * zoom);

      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(markerScreen.screenX, markerScreen.screenY, markerRadius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fill();
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.setLineDash([]);
      const armLen = markerRadius * 0.45;
      ctx.beginPath();
      ctx.moveTo(markerScreen.screenX - armLen, markerScreen.screenY);
      ctx.lineTo(markerScreen.screenX + armLen, markerScreen.screenY);
      ctx.moveTo(markerScreen.screenX, markerScreen.screenY - armLen);
      ctx.lineTo(markerScreen.screenX, markerScreen.screenY + armLen);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }
}

/** Cells/edges, curves, wall paths and tiles for every render layer. */
function renderLayerComposite(frame: RenderFrame, scene: StaticScene, kit: StaticPassKit): void {
  const { ctx, geometry, offsetX, offsetY, zoom, width, height, cullNorth, theme: THEME, viewState: rendererViewState } = frame;
  const { mapData, renderLayers, exportOpacityById, visibility, renderer, draggingWallId, hiddenTileLayers, ladder, level } = scene;
  const { tileGeomShim, curveGridConfig, wallCellSize } = kit;

  // At level >= 1 the cells pass draws INHERITED fills on the active rung instead
  // of the authored level-0 cells. The rect is this target's own area in world
  // coords, UNDILATED — the materialiser dilates by a ring itself so its boundary
  // cells still see their neighbours and grow no phantom borders. Every other pass
  // keeps the root geometry and the real layer.
  const levelRect = { x0: -offsetX / zoom, y0: -offsetY / zoom, x1: (width - offsetX) / zoom, y1: (height - offsetY) / zoom };

  // Composite each render layer's cells/edges, curves and tiles in draw order.
  // Simple maps loop exactly once over the active layer (identical to before);
  // strata maps stack the active board's visible layers. Objects/text/fog/region
  // stay active-layer-only (rendered after this loop) so the interaction surface
  // and the single-activeLayer fog passes remain correct.
  for (const drawLayer of renderLayers) {
    // Per-layer opacity only ever comes from an image export selection.
    const layerOpacity = exportOpacityById?.get(drawLayer.id) ?? 1;

    // Build curve-cell merge index for this layer (grid maps only)
    let mergeIndex: CurveCellMergeIndex | null = null;
    if (geometry.type === 'grid' &&
        drawLayer.cells.length > 0 &&
        drawLayer.curves.length > 0) {
      const cellsForMerge = drawLayer.cells.filter(isGridCell).map(cell => ({
        x: cell.x, y: cell.y, color: getCellColor(cell)
      }));
      mergeIndex = buildMergeIndex(cellsForMerge, drawLayer.curves, geometry.cellSize);
    }

    // Cells and edges
    if (ladder !== null && level >= 1) {
      const coarse = materialiseLevelLayer(drawLayer, ladder, level, levelRect, LADDER_EPOCH);
      renderLayerCellsAndEdges(ctx, coarse.layer, ladder.geometryForLevel(level), rendererViewState, THEME, renderer, {
        opacity: layerOpacity,
        showGrid: visibility.grid !== false,
        mergeIndex,
        northDirection: cullNorth
      });
    } else {
      renderLayerCellsAndEdges(ctx, drawLayer, geometry, rendererViewState, THEME, renderer, {
        opacity: layerOpacity,
        showGrid: visibility.grid !== false,
        mergeIndex,
        northDirection: cullNorth
      });
    }

    // Freehand curves (between cells and tiles)
    if (drawLayer.curves.length > 0) {
      renderCurves(ctx, drawLayer.curves, rendererViewState, THEME, {
        opacity: layerOpacity,
        mergeIndex,
        gridConfig: curveGridConfig
      });
    }

    // Wall paths (between curves and tiles). A wall under active edit-drag is
    // excluded here and drawn live on the overlay instead.
    if (drawLayer.wallPaths != null && drawLayer.wallPaths.length > 0 && mapData.tilesets != null && mapData.tilesets.length > 0) {
      const wallsToRender = draggingWallId != null
        ? drawLayer.wallPaths.filter(w => w.id !== draggingWallId)
        : drawLayer.wallPaths;
      if (wallsToRender.length > 0) {
        renderWallPaths(ctx, wallsToRender, mapData.tilesets, rendererViewState, wallCellSize, {
          getCachedImage,
          opacity: layerOpacity
        });
      }
    }

    // Tiles + terrain brush strokes (between curves and regions, z-sorted for
    // overflow occlusion). A layer holding only strokes must still render.
    const hasTiles = drawLayer.tiles != null && drawLayer.tiles.length > 0;
    const hasStrokes = drawLayer.terrainStrokes != null && drawLayer.terrainStrokes.length > 0;
    if ((hasTiles || hasStrokes) && mapData.tilesets != null && mapData.tilesets.length > 0) {
      if (ladder !== null) {
        // Tiles at depth, every rung including 0 (kgc.6 / kgc.22): see renderLadderTiles.
        renderLadderTiles(frame, scene, drawLayer, layerOpacity, hiddenTileLayers);
      } else {
        renderTiles(
          ctx,
          drawLayer.tiles ?? [],
          mapData.tilesets,
          tileGeomShim,
          rendererViewState,
          { opacity: layerOpacity, getCachedImage, canvasWidth: width, canvasHeight: height, hiddenLayers: hiddenTileLayers, terrainStrokes: drawLayer.terrainStrokes }
        );
      }
    }
  }
}

/** Regions then outlines (hex maps only). */
function renderHexOverlays(frame: RenderFrame, scene: StaticScene): void {
  const { ctx, geometry, offsetX, offsetY, zoom } = frame;
  const { mapData, activeLayer, visibility } = scene;

  // Draw regions (hex maps only, between curves and objects)
  if (geometry.type === 'hex' && mapData.regions != null && mapData.regions.length > 0 && visibility.regions !== false) {
    const regionFow = activeLayer.fogOfWar;
    let foggedAxialSet: Set<string> | undefined;
    if (regionFow?.enabled === true && regionFow?.foggedCells != null && regionFow.foggedCells.length > 0) {
      foggedAxialSet = new Set<string>();
      for (const fc of regionFow.foggedCells) {
        const { q, r } = offsetToAxial(fc.col, fc.row, mapData.orientation ?? 'flat');
        foggedAxialSet.add(`${q},${r}`);
      }
    }
    renderRegions(ctx, mapData.regions, geometry, { x: offsetX, y: offsetY, zoom }, { foggedCells: foggedAxialSet });
  }

  // Draw outlines (hex maps only, after regions)
  if (geometry.type === 'hex' && mapData.outlines != null && mapData.outlines.length > 0 && visibility.outlines !== false) {
    renderOutlines(ctx, mapData.outlines, geometry, { x: offsetX, y: offsetY, zoom }, mapData.hexBounds ?? {}, mapData.orientation ?? 'flat');
  }
}

/** Player light radii, then shape overlays. */
function renderLightsAndShapes(frame: RenderFrame, scene: StaticScene): void {
  const { ctx, geometry, offsetX, offsetY, zoom } = frame;
  const { mapData, activeLayer } = scene;

  // Draw player light radii (before shapes and objects)
  if (activeLayer.objects.length > 0) {
    const playerObjects = activeLayer.objects.filter((o: MapObject) => o.isPlayer === true && o.lightEnabled === true);
    if (playerObjects.length > 0) {
      const settings = mapData.settings?.overrides ?? {};
      const distancePerCell = (settings.distancePerCell as number) ?? 5;
      renderPlayerLights(ctx, playerObjects, geometry, { x: offsetX, y: offsetY, zoom }, distancePerCell);
    }
  }

  // Draw shape overlays (both grid and hex maps, after outlines)
  if (mapData.shapeOverlays && mapData.shapeOverlays.length > 0) {
    renderShapeOverlays(ctx, mapData.shapeOverlays, { x: offsetX, y: offsetY, zoom });
  }
}

/** Small diamond on hexes that hold sub-hex content. */
function renderSubHexIndicators(frame: RenderFrame, scene: StaticScene): void {
  const { ctx, geometry, offsetX, offsetY, zoom } = frame;
  const { mapData } = scene;

  // Draw sub-hex indicators (small diamond on hexes that have sub-hex data)
  if (geometry.type === 'hex' && mapData.subHexMaps != null) {
    ctx.save();
    for (const [hexKey, subHex] of Object.entries(mapData.subHexMaps)) {
      // Only show indicator if the sub-hex has actual content
      const sd = subHex.mapData;
      if (sd?.layers == null) continue;
      const hasContent = sd.layers.some((l: MapLayer) =>
        l.cells.length > 0 ||
        l.curves.length > 0 ||
        l.objects.length > 0 ||
        l.textLabels.length > 0 ||
        (l.tiles != null && l.tiles.length > 0)
      );
      if (!hasContent) continue;

      const [qStr, rStr] = hexKey.split(',');
      const q = parseInt(qStr, 10);
      const r = parseInt(rStr, 10);
      const world = geometry.hexToWorld(q, r);
      const screen = geometry.worldToScreen(world.worldX, world.worldY, offsetX, offsetY, zoom);
      const size = Math.max(4, geometry.hexSize * zoom * 0.12);

      // Small diamond indicator at hex center
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(screen.screenX, screen.screenY - size);
      ctx.lineTo(screen.screenX + size, screen.screenY);
      ctx.lineTo(screen.screenX, screen.screenY + size);
      ctx.lineTo(screen.screenX - size, screen.screenY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Objects then text labels (active layer only). */
function renderEntities(frame: RenderFrame, scene: StaticScene): void {
  const { ctx, geometry, offsetX, offsetY, zoom } = frame;
  const { mapData, activeLayer, visibility, showCoordinates, scaledSize } = scene;

  // Draw objects. Under the ladder objects are drawn LIVE after the lattice
  // instead (per home rung, sized from it), never baked into a rung surface.
  if (scene.ladder === null && activeLayer.objects.length > 0 && !showCoordinates && visibility.objects) {
    renderObjects(
      activeLayer,
      { ctx, offsetX, offsetY, zoom, scaledSize },
      geometry,
      geometry.type === 'hex',
      mapData.orientation ?? 'flat',
      objectRenderDeps(mapData)
    );
  }

  // Draw text labels (live under the ladder, like objects)
  if (scene.ladder === null && activeLayer.textLabels.length > 0 && !showCoordinates && visibility.textLabels) {
    renderTextLabels(
      activeLayer.textLabels,
      { ctx, zoom, getFontCss },
      geometry,
      { offsetX, offsetY, zoom }
    );
  }

}

/** All static passes in draw order onto one frame. */
function drawStaticScene(frame: RenderFrame, scene: StaticScene): void {
  const kit = makeStaticPassKit(frame, scene);
  renderBackgroundAndGrid(frame, scene);
  renderGhostPasses(frame, scene, kit);
  renderAdjacentSubHexes(frame, scene);
  renderLayerComposite(frame, scene, kit);
  renderHexOverlays(frame, scene);
  renderLightsAndShapes(frame, scene);
  renderSubHexIndicators(frame, scene);
  renderEntities(frame, scene);
}

export {
  makeRenderFrame,
  objectRenderDeps,
  renderLadderTiles,
  drawStaticScene,
  renderBackgroundAndGrid,
  renderGhostLayer,
  renderGhostPasses,
  renderAdjacentSubHexes,
  renderLayerComposite,
  renderHexOverlays,
  renderLightsAndShapes,
  renderSubHexIndicators,
  renderEntities,
};
export type { StaticScene, StaticPassKit };
