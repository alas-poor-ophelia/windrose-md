/**
 * useTerrainSampling.ts
 *
 * Wires the pure segment-terrain sampler to a live map: it assembles the
 * TerrainSampleContext (visible render layers bottom-first, the enabled
 * packs' terrains, the map geometry, and a tile-tag lookup that resolves a
 * placement through resolveTileEntry + the render metadata store) and hands
 * back the two sampling calls the route surfaces need.
 *
 * The per-layer cell lookups are built lazily and cached against the context
 * identity, so mounting the hook on a map that is not being measured costs
 * nothing until a sample is actually requested.
 */

// Type-only imports
import type { Point } from '#types/core/geometry.types';
import type { MapLayer } from '#types/core/map.types';
import type { TravelTerrain } from '#types/settings/travelPack.types';
import type { RouteTerrainSampling } from '#types/hooks/distanceMeasurement.types';
import type { LayerCellMaps, TerrainSampleContext } from '../../travel/segmentTerrainSampler';

import { useCallback, useMemo, useRef } from 'preact/hooks';
import { buildLayerCellMaps, sampleRouteTerrains, sampleSegmentTerrain } from '../../travel/segmentTerrainSampler';
import { getRenderLayers } from '../../persistence/layerAccessor';
import { resolveTileEntry } from '../../assets/tilesetOperations';
import { getAllTags, getTileMetadataForRender } from '../../persistence/tileMetadata';
import { useMapState } from '../../context/MapContext';

/**
 * Build the sampling surface for the current map.
 *
 * @param terrains Candidate terrains, flattened across enabled packs in pack order
 * @param enabled  False parks the hook (no context, samples return nothing)
 */
const useTerrainSampling = (
  terrains: readonly TravelTerrain[],
  enabled: boolean = true
): RouteTerrainSampling => {
  const { mapData, geometry } = useMapState();

  // getRenderLayers already returns the active board's layers in ascending
  // draw order (strata maps included); the visibility filter is repeated
  // here because the single-layer branch does not apply it.
  // Keyed on the fields getRenderLayers reads, not the whole mapData: route
  // commits replace mapData on every waypoint and would otherwise rebuild
  // the cell maps per click.
  const layerList = mapData?.layers;
  const activeLayerId = mapData?.activeLayerId;
  const layerMode = mapData?.layerMode;
  const boards = mapData?.boards;
  const activeBoardId = mapData?.activeBoardId;
  const mapDataRef = useRef(mapData);
  mapDataRef.current = mapData;
  const layers = useMemo((): MapLayer[] => {
    const source = mapDataRef.current;
    if (!enabled || source == null) return [];
    // The ref always holds the render that produced these keyed fields;
    // bail rather than compute from a mismatched snapshot.
    if (
      source.layers !== layerList || source.activeLayerId !== activeLayerId ||
      source.layerMode !== layerMode || source.boards !== boards || source.activeBoardId !== activeBoardId
    ) return [];
    return getRenderLayers(source).filter(l => l.visible !== false);
  }, [enabled, layerList, activeLayerId, layerMode, boards, activeBoardId]);

  const tilesets = mapData?.tilesets;

  const context = useMemo((): TerrainSampleContext | null => {
    if (!enabled || geometry == null || terrains.length === 0 || layers.length === 0) return null;
    return {
      layers,
      terrains,
      geometry,
      getTileTags: (tile) => {
        const entry = resolveTileEntry(tilesets?.find(ts => ts.id === tile.tilesetId), tile.tileId);
        return entry != null ? getAllTags(entry, getTileMetadataForRender()) : [];
      },
    };
  }, [enabled, geometry, terrains, layers, tilesets]);

  // Cell maps are expensive on a busy map; build once per context identity
  const cellMapsRef = useRef<{ context: TerrainSampleContext; cellMaps: LayerCellMaps } | null>(null);
  const cellMapsFor = useCallback((ctx: TerrainSampleContext): LayerCellMaps => {
    if (cellMapsRef.current?.context !== ctx) {
      cellMapsRef.current = { context: ctx, cellMaps: buildLayerCellMaps(ctx) };
    }
    return cellMapsRef.current.cellMaps;
  }, []);

  const sampleSegment = useCallback((a: Point, b: Point, previousTerrainId: string | null): string | null => {
    if (context == null) return null;
    return sampleSegmentTerrain(a, b, context, previousTerrainId, cellMapsFor(context));
  }, [context, cellMapsFor]);

  const sampleRoute = useCallback((points: readonly Point[], firstSegmentTerrainId: string | null): (string | null)[] => {
    if (context == null) return [];
    return sampleRouteTerrains(points, context, firstSegmentTerrainId);
  }, [context]);

  return { available: context != null, sampleSegment, sampleRoute };
};

export { useTerrainSampling };
