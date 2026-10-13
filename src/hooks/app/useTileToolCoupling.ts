// useTileToolCoupling.ts - Couples tile placement state to the wall tool:
// arming a wall/path strip ('line' subtool) or an opening asset (DD portal or
// bare threshold) switches to the wall tool; leaving that state returns to
// tile placement. Also disarms a stale bare-threshold mode.

import { useEffect, useMemo, useRef } from 'preact/hooks';
import type { ToolId } from '#types/tools/tool.types';
import type { TilesetDef } from '#types/tiles/tile.types';
import type { TileSubtoolId } from '#types/tiles/tile.types';
import { resolveTileEntry } from '../../assets/tilesetOperations';
import { getTileMetadataForRender } from '../../persistence/tileMetadata';

interface UseTileToolCouplingOptions {
  rootTilesets: TilesetDef[] | undefined;
  activeTilesets: TilesetDef[] | undefined;
  selectedTilesetId: string | null;
  selectedTileId: string | null;
  tileSubtool: TileSubtoolId | null;
  currentTool: ToolId;
  setCurrentTool: (tool: ToolId) => void;
  bareThresholdArmed: boolean;
  setBareThresholdArmed: (armed: boolean) => void;
}

function useTileToolCoupling({ rootTilesets, activeTilesets, selectedTilesetId, selectedTileId, tileSubtool, currentTool, setCurrentTool, bareThresholdArmed, setBareThresholdArmed }: UseTileToolCouplingOptions): void {
  // Transition-driven via refs so a manual tool pick is never fought.
  const currentToolRef = useRef(currentTool);
  currentToolRef.current = currentTool;
  const prevSubtoolRef = useRef<TileSubtoolId | null>(null);
  const prevOpeningArmedRef = useRef(false);
  // A DD portal is an opening asset — it travels with the wall tool just like a
  // strip's 'line' subtool. Detected via metadata (union-free): the 'opening'
  // subtool literal isn't a TileSubtoolId until P3 lands (see GOTCHAS). This
  // also covers the Alt-click bare-threshold path (portal armed, no 'opening'
  // subtool). The built-in Threshold ribbon entry (arms NO asset) still needs
  // the subtool-based trigger — deferred to P3/P5 integration.
  const openingArmed = useMemo((): boolean => {
    const tilesets = rootTilesets ?? activeTilesets ?? [];
    const ts = tilesets.find(t => t.id === selectedTilesetId);
    const entry = ts != null && selectedTileId != null ? resolveTileEntry(ts, selectedTileId) : null;
    return entry?.vaultPath != null && getTileMetadataForRender()[entry.vaultPath]?.ddSourceType === 'portals';
  }, [rootTilesets, activeTilesets, selectedTilesetId, selectedTileId]);
  useEffect(() => {
    const prev = prevSubtoolRef.current;
    prevSubtoolRef.current = tileSubtool;
    const prevOpening = prevOpeningArmedRef.current;
    prevOpeningArmedRef.current = openingArmed;
    // The wall tool is armed whenever a wall/path strip (subtool 'line') OR an
    // opening asset (portal / bare threshold) is armed. Toggle the tool only on
    // ENTERING or LEAVING that combined "wall-relevant" state — never on a
    // transition BETWEEN two wall-relevant states (e.g. picking a portal right
    // after a wall strip: 'line' → 'opening'), which must keep the wall tool.
    const nowWallRelevant = tileSubtool === 'line' || openingArmed;
    const wasWallRelevant = prev === 'line' || prevOpening;
    if (nowWallRelevant && !wasWallRelevant) {
      setCurrentTool('wall');
    } else if (!nowWallRelevant && wasWallRelevant && currentToolRef.current === 'wall') {
      setCurrentTool('tilePaint');
    }
  }, [tileSubtool, openingArmed, setCurrentTool]);

  // Disarm the bare-threshold mode when it no longer applies: the tool leaves the
  // wall tool, or the opening asset it rode in on is un-armed (portal deselected /
  // a strip picked). Keeps a stale bare mode from hijacking the wall tool.
  useEffect(() => {
    if (bareThresholdArmed && (currentTool !== 'wall' || !openingArmed)) {
      setBareThresholdArmed(false);
    }
  }, [bareThresholdArmed, currentTool, openingArmed, setBareThresholdArmed]);
}

export { useTileToolCoupling };
