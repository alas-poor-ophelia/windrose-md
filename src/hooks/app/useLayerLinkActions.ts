// useLayerLinkActions.ts - Two small root-component actions: copy a deep link
// to the current sub-hex view, and request a layer clone (native Obsidian
// modal first, Preact fallback state when it cannot open).

import { useCallback, useState } from 'preact/hooks';
import type { App } from 'obsidian';
import type { MapData } from '#types/index';
import type { ExtendedGeometry } from '#types/contexts/context.types';
import type { useLayerHistory } from '../state/useLayerHistory';
import { getActiveLayer, getLayerById } from '../../persistence/layerAccessor';
import { copyDeepLinkToClipboard } from '../../persistence/deepLinkHandler';
import { openNativeCloneLayerModal } from '../../components/modals/CloneLayerModal';

interface SubHexLinkOptions {
  notePath: string;
  mapId: string;
  subHexPath: string | null | undefined;
  mapData: MapData | null;
  geometry: ExtendedGeometry | null;
}

/**
 * Copy a clickable deep link to the CURRENT sub-hex view. Encodes the drill
 * path so the link reopens at this sub-hex, then centres on the current view.
 * Needs a host note to open, so it is block-mode only (full-pane notePath='').
 */
function useSubHexLink({ notePath, mapId, subHexPath, mapData, geometry }: SubHexLinkOptions): () => void {
  return useCallback(() => {
    if (notePath === '' || mapId === '' || subHexPath == null || subHexPath === '' || !mapData) return;
    const center = mapData.viewState?.center ?? { x: 0, y: 0 };
    const zoom = mapData.viewState?.zoom ?? 1;
    const layerId = mapData.activeLayerId ?? getActiveLayer(mapData)?.id ?? 'layer_001';
    let x = center.x;
    let y = center.y;
    if (geometry?.type === 'hex') {
      const hc = geometry.worldToHex(center.x, center.y);
      x = hc.q;
      y = hc.r;
    }
    copyDeepLinkToClipboard(mapData.name ?? 'Sub-hex view', notePath, mapId, x, y, zoom, layerId, subHexPath);
  }, [notePath, mapId, subHexPath, mapData, geometry]);
}

interface CloneLayerRequest {
  /** Layer awaiting the Preact fallback clone modal (null when none). */
  cloningLayerId: string | null;
  setCloningLayerId: (id: string | null) => void;
  handleCloneLayerRequest: (layerId: string) => void;
}

function useCloneLayerRequest(app: App, mapData: MapData | null, handleLayerClone: ReturnType<typeof useLayerHistory>['handleLayerClone']): CloneLayerRequest {
  const [cloningLayerId, setCloningLayerId] = useState<string | null>(null);

  const handleCloneLayerRequest = useCallback((layerId: string): void => {
    if (!mapData) return;
    const layer = getLayerById(mapData, layerId);
    if (!layer) return;

    const layerName = layer.name || String(layer.order + 1);
    const opened = openNativeCloneLayerModal({
      app,
      layerName,
      onClone: (mode) => handleLayerClone(layerId, mode),
    });
    if (!opened) {
      setCloningLayerId(layerId);
    }
  }, [mapData, handleLayerClone, app]);

  return { cloningLayerId, setCloningLayerId, handleCloneLayerRequest };
}

export { useSubHexLink, useCloneLayerRequest };
export type { CloneLayerRequest };
