/**
 * TilePlacementLayer.tsx
 *
 * Interaction layer for placing hex tile images.
 * Click or drag with the tilePaint tool to assign tiles to hex cells.
 * Supports drag-painting (holding pointer down while moving across hexes).
 */

import type { ToolId } from '#types/tools/tool.types';
import type { HexTileAssignment } from '#types/tiles/tile.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapState } = await requireModuleByName("MapContext.tsx");
const { useEventHandlerRegistration } = await requireModuleByName("EventHandlerContext.tsx");
const { getActiveLayer } = await requireModuleByName("layerAccessor.ts");

interface TilePlacementLayerProps {
  currentTool: ToolId;
  selectedTilesetId: string | null;
  selectedTileId: string | null;
  tileRotation: number;
  tileFlipH: boolean;
  onTilesChange: (tiles: HexTileAssignment[]) => void;
}

const TilePlacementLayer = ({
  currentTool,
  selectedTilesetId,
  selectedTileId,
  tileRotation,
  tileFlipH,
  onTilesChange
}: TilePlacementLayerProps): React.ReactElement | null => {
  const { mapData, geometry, screenToGrid } = useMapState();
  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();

  const isTileTool = currentTool === 'tilePaint';
  const hasTileSelected = !!(selectedTilesetId && selectedTileId);

  // Track which hexes were painted in current stroke to avoid duplicates
  const paintedInStrokeRef = dc.useRef<Set<string>>(new Set());
  const isDraggingRef = dc.useRef(false);

  const placeTileAtHex = dc.useCallback((q: number, r: number) => {
    if (!mapData || !selectedTilesetId || !selectedTileId) return;

    const activeLayer = getActiveLayer(mapData);
    const currentTiles = activeLayer.tiles || [];
    const key = `${q},${r}`;

    // Skip if already painted in this stroke
    if (paintedInStrokeRef.current.has(key)) return;
    paintedInStrokeRef.current.add(key);

    // Replace existing tile at this hex, or add new
    const existingIdx = currentTiles.findIndex(
      (t: HexTileAssignment) => t.q === q && t.r === r
    );

    const newTile: HexTileAssignment = {
      q, r,
      tilesetId: selectedTilesetId,
      tileId: selectedTileId,
      rotation: tileRotation || undefined,
      flipH: tileFlipH || undefined
    };

    let newTiles: HexTileAssignment[];
    if (existingIdx >= 0) {
      newTiles = [...currentTiles];
      newTiles[existingIdx] = newTile;
    } else {
      newTiles = [...currentTiles, newTile];
    }

    onTilesChange(newTiles);
  }, [mapData, selectedTilesetId, selectedTileId, tileRotation, tileFlipH, onTilesChange]);

  const eraseTileAtHex = dc.useCallback((q: number, r: number) => {
    if (!mapData) return;

    const activeLayer = getActiveLayer(mapData);
    const currentTiles = activeLayer.tiles || [];
    const key = `${q},${r}`;

    if (paintedInStrokeRef.current.has(key)) return;
    paintedInStrokeRef.current.add(key);

    const newTiles = currentTiles.filter(
      (t: HexTileAssignment) => !(t.q === q && t.r === r)
    );

    if (newTiles.length !== currentTiles.length) {
      onTilesChange(newTiles);
    }
  }, [mapData, onTilesChange]);

  // Pointer handlers
  const handlePointerDown = dc.useCallback((e: PointerEvent) => {
    if (!isTileTool || !geometry || geometry.type !== 'hex') return;

    const coords = screenToGrid(e.clientX, e.clientY);
    if (!coords) return;

    isDraggingRef.current = true;
    paintedInStrokeRef.current = new Set();

    if (hasTileSelected) {
      placeTileAtHex(coords.x, coords.y);
    }
  }, [isTileTool, geometry, screenToGrid, hasTileSelected, placeTileAtHex]);

  const handlePointerMove = dc.useCallback((e: PointerEvent) => {
    if (!isDraggingRef.current || !isTileTool || !geometry || geometry.type !== 'hex') return;

    const coords = screenToGrid(e.clientX, e.clientY);
    if (!coords) return;

    if (hasTileSelected) {
      placeTileAtHex(coords.x, coords.y);
    }
  }, [isTileTool, geometry, screenToGrid, hasTileSelected, placeTileAtHex]);

  const handlePointerUp = dc.useCallback(() => {
    isDraggingRef.current = false;
    paintedInStrokeRef.current = new Set();
  }, []);

  // Register handlers
  const tileHandlersRef = dc.useRef<Record<string, unknown> | null>(null);
  tileHandlersRef.current = isTileTool
    ? { handlePointerDown, handlePointerMove, handlePointerUp }
    : {};

  dc.useEffect(() => {
    const proxy = new Proxy({} as Record<string, unknown>, {
      get(_target, prop: string) {
        return tileHandlersRef.current?.[prop];
      }
    });
    registerHandlers('tilePlacement', proxy);
    return () => unregisterHandlers('tilePlacement');
  }, []);

  return null;
};

return { TilePlacementLayer };
