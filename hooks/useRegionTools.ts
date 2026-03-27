/**
 * useRegionTools.ts
 *
 * Hook for region creation and editing on hex maps.
 * Supports two modes:
 * - Paint: click hexes to toggle them in/out of a pending selection
 * - Boundary: click to place polygon vertices, close to select enclosed hexes
 */

import type { ToolId } from '#types/tools/tool.types';
import type { Point, IGeometry } from '#types/core/geometry.types';
import type { MapData, Region } from '#types/core/map.types';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const { HexGeometry } = await requireModuleByName("HexGeometry.ts") as {
  HexGeometry: new (hexSize: number, orientation: string, hexBounds: { maxCol: number; maxRow: number } | null) => IGeometry & {
    hexSize: number;
    worldToHex: (worldX: number, worldY: number) => { q: number; r: number };
    hexToWorld: (q: number, r: number) => { worldX: number; worldY: number };
    isWithinBounds: (q: number, r: number) => boolean;
  };
};

// ── Types ────────────────────────────────────────────────────────────

interface MapStateValue {
  geometry: IGeometry | null;
  mapData: MapData | null;
  screenToWorld: (clientX: number, clientY: number) => { worldX: number; worldY: number } | null;
  screenToGrid: (clientX: number, clientY: number) => Point | null;
}

interface RegionToolsOptions {
  currentTool: ToolId;
  selectedColor: string;
  selectedOpacity: number;
  mapData: MapData | null;
  geometry: IGeometry | null;
  screenToWorld: (clientX: number, clientY: number) => { worldX: number; worldY: number } | null;
  screenToGrid: (clientX: number, clientY: number) => Point | null;
  onRegionsChange: (regions: Region[]) => void;
}

interface ContextMenuState {
  regionId: string;
  screenX: number;
  screenY: number;
}

interface UseRegionToolsResult {
  pendingHexes: Point[];
  boundaryVertices: Point[];
  isActive: boolean;
  editingRegionId: string | null;
  editingRegion: Region | null;
  contextMenu: ContextMenuState | null;
  handlePointerDown: (e: PointerEvent) => void;
  handlePointerMove: (e: PointerEvent) => void;
  handlePointerUp: (e: PointerEvent) => void;
  handleDoubleClick: (e: MouseEvent) => void;
  handleContextMenu: (e: MouseEvent) => void;
  confirmRegion: (name: string, linkedNote?: string) => void;
  cancelRegion: () => void;
  deleteRegion: (regionId: string) => void;
  updateRegion: (regionId: string, updates: Partial<Region>) => void;
  startEditingRegion: (regionId: string) => void;
  stopEditingRegion: () => void;
  dismissContextMenu: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────

function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

function generateRegionId(): string {
  return `region-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Point-in-polygon test (ray casting) for world-space coordinates.
 */
function pointInPolygon(px: number, py: number, polygon: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// ── Hook ─────────────────────────────────────────────────────────────

function useRegionTools(options: RegionToolsOptions): UseRegionToolsResult {
  const {
    currentTool,
    selectedColor,
    selectedOpacity,
    mapData,
    geometry,
    screenToWorld,
    screenToGrid,
    onRegionsChange
  } = options;

  const isActive = currentTool === 'regionPaint' || currentTool === 'regionBoundary';
  const isPaintMode = currentTool === 'regionPaint';
  const isBoundaryMode = currentTool === 'regionBoundary';

  // Pending hex selection (axial coords) — for new region creation
  const [pendingHexes, setPendingHexes] = dc.useState<Point[]>([]);
  // Boundary polygon vertices (world coords)
  const [boundaryVertices, setBoundaryVertices] = dc.useState<Array<{ x: number; y: number }>>([]);
  // Editing state — when set, paint mode modifies an existing region
  const [editingRegionId, setEditingRegionId] = dc.useState<string | null>(null);
  // Context menu state
  const [contextMenu, setContextMenu] = dc.useState<ContextMenuState | null>(null);

  const editingRegion = dc.useMemo(() => {
    if (!editingRegionId || !mapData?.regions) return null;
    return mapData.regions.find(r => r.id === editingRegionId) || null;
  }, [editingRegionId, mapData?.regions]);

  // Reset state when switching away from region tools
  dc.useEffect(() => {
    if (!isActive) {
      setPendingHexes([]);
      setBoundaryVertices([]);
      setEditingRegionId(null);
      setContextMenu(null);
    }
  }, [isActive]);

  const getHexCoords = dc.useCallback((e: PointerEvent | MouseEvent) => {
    if (!geometry || geometry.type !== 'hex' || !screenToGrid) return null;
    const grid = screenToGrid(e.clientX, e.clientY);
    if (!grid) return null;
    return { q: grid.x, r: grid.y };
  }, [geometry, screenToGrid]);

  const getWorldCoords = dc.useCallback((e: PointerEvent | MouseEvent) => {
    if (!screenToWorld) return null;
    return screenToWorld(e.clientX, e.clientY);
  }, [screenToWorld]);

  // ── Helper: find which region a hex belongs to ─────────────────────

  const findRegionForHex = dc.useCallback((q: number, r: number): Region | null => {
    if (!mapData?.regions) return null;
    const key = hexKey(q, r);
    return mapData.regions.find(region =>
      region.hexes.some(h => hexKey(h.x, h.y) === key)
    ) || null;
  }, [mapData?.regions]);

  // ── Paint Mode Handlers ────────────────────────────────────────────

  const handlePaintPointerDown = dc.useCallback((e: PointerEvent) => {
    const hex = getHexCoords(e);
    if (!hex) return;

    const hexGeom = geometry as InstanceType<typeof HexGeometry>;
    if (!hexGeom.isWithinBounds(hex.q, hex.r)) return;

    // If editing an existing region, add/remove hex from it directly
    if (editingRegionId && mapData) {
      const key = hexKey(hex.q, hex.r);
      const regions = mapData.regions || [];
      const regionIdx = regions.findIndex(r => r.id === editingRegionId);
      if (regionIdx === -1) return;

      const region = regions[regionIdx];
      const hexInRegion = region.hexes.some(h => hexKey(h.x, h.y) === key);

      const updatedRegion = {
        ...region,
        hexes: hexInRegion
          ? region.hexes.filter(h => hexKey(h.x, h.y) !== key)
          : [...region.hexes, { x: hex.q, y: hex.r }]
      };

      // If adding, remove hex from any other region (exclusive)
      const updatedRegions = regions.map((r, i) => {
        if (i === regionIdx) return updatedRegion;
        if (!hexInRegion) {
          return { ...r, hexes: r.hexes.filter(h => hexKey(h.x, h.y) !== key) };
        }
        return r;
      });

      onRegionsChange(updatedRegions);
      return;
    }

    // If no editing and no pending selection, check if clicking on an existing region
    if (pendingHexes.length === 0) {
      const existingRegion = findRegionForHex(hex.q, hex.r);
      if (existingRegion) {
        setEditingRegionId(existingRegion.id);
        return;
      }
    }

    // Normal pending hex toggle for new region creation
    setPendingHexes(prev => {
      const key = hexKey(hex.q, hex.r);
      const exists = prev.some(h => hexKey(h.x, h.y) === key);
      if (exists) {
        return prev.filter(h => hexKey(h.x, h.y) !== key);
      }
      return [...prev, { x: hex.q, y: hex.r }];
    });
  }, [getHexCoords, geometry, editingRegionId, mapData, pendingHexes.length, findRegionForHex, onRegionsChange]);

  // ── Boundary Mode Handlers ─────────────────────────────────────────

  const handleBoundaryPointerDown = dc.useCallback((e: PointerEvent) => {
    const world = getWorldCoords(e);
    if (!world) return;

    setBoundaryVertices(prev => [...prev, { x: world.worldX, y: world.worldY }]);
  }, [getWorldCoords]);

  const closeBoundaryAndSelectHexes = dc.useCallback(() => {
    if (boundaryVertices.length < 3 || !geometry || geometry.type !== 'hex' || !mapData) return;

    const hexGeom = geometry as InstanceType<typeof HexGeometry>;
    const bounds = mapData.hexBounds;
    if (!bounds) return;

    // Find all hexes whose centers fall inside the polygon
    const selected: Point[] = [];

    if (bounds.maxRing !== undefined) {
      // Radial bounds
      for (let ring = 0; ring <= bounds.maxRing; ring++) {
        if (ring === 0) {
          const center = hexGeom.hexToWorld(0, 0);
          if (pointInPolygon(center.worldX, center.worldY, boundaryVertices)) {
            selected.push({ x: 0, y: 0 });
          }
        } else {
          let q = ring, r = 0;
          const dirs = [
            { dq: -1, dr: 1 }, { dq: -1, dr: 0 }, { dq: 0, dr: -1 },
            { dq: 1, dr: -1 }, { dq: 1, dr: 0 }, { dq: 0, dr: 1 }
          ];
          for (const dir of dirs) {
            for (let step = 0; step < ring; step++) {
              if (hexGeom.isWithinBounds(q, r)) {
                const center = hexGeom.hexToWorld(q, r);
                if (pointInPolygon(center.worldX, center.worldY, boundaryVertices)) {
                  selected.push({ x: q, y: r });
                }
              }
              q += dir.dq;
              r += dir.dr;
            }
          }
        }
      }
    } else {
      // Rectangular bounds - iterate offset coords and convert
      const { offsetToAxial } = requireModuleByName("offsetCoordinates.ts") as any;
      // Sync fallback: iterate reasonable range
      for (let col = 0; col <= bounds.maxCol; col++) {
        for (let row = 0; row <= bounds.maxRow; row++) {
          const { q, r } = offsetToAxial(col, row, mapData.orientation || 'flat');
          if (hexGeom.isWithinBounds(q, r)) {
            const center = hexGeom.hexToWorld(q, r);
            if (pointInPolygon(center.worldX, center.worldY, boundaryVertices)) {
              selected.push({ x: q, y: r });
            }
          }
        }
      }
    }

    setPendingHexes(selected);
    setBoundaryVertices([]);
  }, [boundaryVertices, geometry, mapData]);

  // Double-click closes the boundary polygon
  const handleDoubleClick = dc.useCallback((e: MouseEvent) => {
    if (!isBoundaryMode || boundaryVertices.length < 3) return;
    closeBoundaryAndSelectHexes();
  }, [isBoundaryMode, boundaryVertices.length, closeBoundaryAndSelectHexes]);

  // ── Unified Handlers ───────────────────────────────────────────────

  const handlePointerDown = dc.useCallback((e: PointerEvent) => {
    if (!isActive) return;
    if (isPaintMode) handlePaintPointerDown(e);
    if (isBoundaryMode) handleBoundaryPointerDown(e);
  }, [isActive, isPaintMode, isBoundaryMode, handlePaintPointerDown, handleBoundaryPointerDown]);

  const handlePointerMove = dc.useCallback((_e: PointerEvent) => {
    // Future: live preview for boundary mode
  }, []);

  const handlePointerUp = dc.useCallback((_e: PointerEvent) => {
    // Paint mode is click-based, no drag needed yet
  }, []);

  // ── Region Creation ────────────────────────────────────────────────

  const confirmRegion = dc.useCallback((name: string, linkedNote?: string) => {
    if (pendingHexes.length === 0 || !mapData) return;

    const existingRegions = mapData.regions || [];

    // Remove pending hexes from any existing region (exclusive)
    const pendingKeys = new Set(pendingHexes.map(h => hexKey(h.x, h.y)));
    const updatedExisting = existingRegions.map(region => ({
      ...region,
      hexes: region.hexes.filter(h => !pendingKeys.has(hexKey(h.x, h.y)))
    }));

    const newRegion: Region = {
      id: generateRegionId(),
      name,
      hexes: [...pendingHexes],
      color: selectedColor,
      opacity: 0.25,
      borderColor: selectedColor,
      borderWidth: 2,
      visible: true,
      order: updatedExisting.length,
      ...(linkedNote ? { linkedNote } : {})
    };

    onRegionsChange([...updatedExisting, newRegion]);
    setPendingHexes([]);
    setBoundaryVertices([]);
  }, [pendingHexes, mapData, selectedColor, selectedOpacity, onRegionsChange]);

  const cancelRegion = dc.useCallback(() => {
    setPendingHexes([]);
    setBoundaryVertices([]);
    setEditingRegionId(null);
  }, []);

  // ── Region Editing ─────────────────────────────────────────────────

  const deleteRegion = dc.useCallback((regionId: string) => {
    if (!mapData) return;
    const regions = (mapData.regions || []).filter(r => r.id !== regionId);
    onRegionsChange(regions);
    if (editingRegionId === regionId) setEditingRegionId(null);
  }, [mapData, onRegionsChange, editingRegionId]);

  const updateRegion = dc.useCallback((regionId: string, updates: Partial<Region>) => {
    if (!mapData) return;
    const regions = (mapData.regions || []).map(r =>
      r.id === regionId ? { ...r, ...updates } : r
    );
    onRegionsChange(regions);
  }, [mapData, onRegionsChange]);

  const startEditingRegion = dc.useCallback((regionId: string) => {
    setPendingHexes([]);
    setBoundaryVertices([]);
    setEditingRegionId(regionId);
  }, []);

  const stopEditingRegion = dc.useCallback(() => {
    setEditingRegionId(null);
  }, []);

  // ── Context Menu ───────────────────────────────────────────────────

  const handleContextMenu = dc.useCallback((e: MouseEvent) => {
    const hex = getHexCoords(e);
    if (!hex) return;

    const region = findRegionForHex(hex.q, hex.r);
    if (region) {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ regionId: region.id, screenX: e.clientX, screenY: e.clientY });
    }
  }, [getHexCoords, findRegionForHex]);

  const dismissContextMenu = dc.useCallback(() => {
    setContextMenu(null);
  }, []);

  return {
    pendingHexes,
    boundaryVertices,
    isActive,
    editingRegionId,
    editingRegion,
    contextMenu,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleDoubleClick,
    handleContextMenu,
    confirmRegion,
    cancelRegion,
    deleteRegion,
    updateRegion,
    startEditingRegion,
    stopEditingRegion,
    dismissContextMenu
  };
}

return { useRegionTools };
