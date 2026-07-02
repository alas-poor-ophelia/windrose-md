/**
 * useTileBrush.ts
 *
 * Manages tile brush state for hex map tile placement.
 *
 * State managed:
 * - tileBrowserCollapsed: Whether the tile browser panel is collapsed
 * - selectedTilesetId: Currently selected tileset
 * - selectedTileId: Currently selected tile within tileset
 * - tileRotation: Rotation angle for tile placement
 * - tileFlipH: Horizontal flip for tile placement
 * - tileLayer: Target layer for tile placement ('base' | 'overlay')
 * - tileFitMode: How tiles fit within cells ('fill' | 'contain' | 'auto')
 * - selectedTileForm: Selected tile's derived render-form (reported by the browser)
 * - tileSubtool: Armed placement subtool (drives TilePlacementLayer behavior)
 *
 * Operations provided:
 * - handleTileSelect: Select a tile from a tileset
 * - handleTileDeselect: Clear tile selection and reset transforms
 */


import type { TileForm, TileLayerRole } from '#types/tiles/tile.types';
import type { TileSubtoolId } from '../../assets/tileForm';
import { useCallback, useEffect, useState } from 'preact/hooks';
import { formDef } from '../../assets/tileForm';
const MAX_RECENT_TILES = 20;

interface RecentTile {
  tilesetId: string;
  tileId: string;
}

interface UseTileBrushResult {
  tileBrowserCollapsed: boolean;
  setTileBrowserCollapsed: (v: boolean) => void;
  tileBrowserWidth: number;
  setTileBrowserWidth: (v: number) => void;
  selectedTilesetId: string | null;
  setSelectedTilesetId: (v: string | null) => void;
  selectedTileId: string | null;
  setSelectedTileId: (v: string | null) => void;
  tileRotation: number;
  setTileRotation: (v: number) => void;
  tileFlipH: boolean;
  setTileFlipH: (v: boolean) => void;
  tileLayer: 'base' | 'overlay';
  setTileLayer: (v: 'base' | 'overlay') => void;
  tileFitMode: 'fill' | 'contain' | 'auto';
  setTileFitMode: (v: 'fill' | 'contain' | 'auto') => void;
  selectedTileForm: TileForm | null;
  setSelectedTileForm: (v: TileForm | null) => void;
  tileSubtool: TileSubtoolId | null;
  setTileSubtool: (v: TileSubtoolId | null) => void;
  tileScale: number;
  setTileScale: (v: number) => void;
  brushSize: number;
  setBrushSize: (v: number) => void;
  brushSoftness: number;
  setBrushSoftness: (v: number) => void;
  paintEdgeBlend: boolean;
  setPaintEdgeBlend: (v: boolean) => void;
  tileDepth: TileLayerRole;
  setTileDepth: (v: TileLayerRole) => void;
  hiddenLayers: Set<TileLayerRole>;
  toggleHiddenLayer: (layer: TileLayerRole) => void;
  recentTiles: RecentTile[];
  handleTileSelect: (tilesetId: string, tileId: string) => void;
  handleTileDeselect: () => void;
}

function useTileBrush(): UseTileBrushResult {
  const [tileBrowserCollapsed, setTileBrowserCollapsed] = useState<boolean>(false);
  const [tileBrowserWidth, setTileBrowserWidth] = useState<number>(384);
  const [selectedTilesetId, setSelectedTilesetId] = useState<string | null>(null);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [tileRotation, setTileRotation] = useState<number>(0);
  const [tileFlipH, setTileFlipH] = useState<boolean>(false);
  const [tileLayer, setTileLayer] = useState<'base' | 'overlay'>('base');
  const [tileFitMode, setTileFitMode] = useState<'fill' | 'contain' | 'auto'>('auto');
  const [selectedTileForm, setSelectedTileForm] = useState<TileForm | null>(null);
  const [tileSubtool, setTileSubtool] = useState<TileSubtoolId | null>(null);
  const [tileScale, setTileScale] = useState<number>(1);
  const [brushSize, setBrushSize] = useState<number>(1);
  // Soft-brush edge softness as a fraction of one cell (0 = hard edge).
  const [brushSoftness, setBrushSoftness] = useState<number>(0.5);
  // Edge blend for region paint/fill: captured onto each placement at paint
  // time (TileAssignment.feather), so toggling it never restyles old cells.
  const [paintEdgeBlend, setPaintEdgeBlend] = useState<boolean>(false);
  const [tileDepth, setTileDepth] = useState<TileLayerRole>('ground');
  const [hiddenLayers, setHiddenLayers] = useState<Set<TileLayerRole>>(new Set());
  const [recentTiles, setRecentTiles] = useState<RecentTile[]>([]);

  // Re-arm the form's default subtool only when the FORM changes: a manual
  // subtool override survives switching between same-form tiles, but resets
  // across forms (and clears on deselect).
  useEffect(() => {
    setTileSubtool(selectedTileForm != null ? formDef(selectedTileForm).defaultSubtool : null);
  }, [selectedTileForm]);

  const toggleHiddenLayer = useCallback((layer: TileLayerRole) => {
    setHiddenLayers(prev => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  }, []);

  const addRecentTile = useCallback((tilesetId: string, tileId: string) => {
    setRecentTiles(prev => {
      const filtered = prev.filter(r => !(r.tilesetId === tilesetId && r.tileId === tileId));
      return [{ tilesetId, tileId }, ...filtered].slice(0, MAX_RECENT_TILES);
    });
  }, []);

  const handleTileSelect = useCallback((tilesetId: string, tileId: string) => {
    setSelectedTilesetId(tilesetId);
    setSelectedTileId(tileId);
    addRecentTile(tilesetId, tileId);
  }, [addRecentTile]);

  const handleTileDeselect = useCallback(() => {
    setSelectedTilesetId(null);
    setSelectedTileId(null);
    setTileRotation(0);
    setTileFlipH(false);
    setSelectedTileForm(null);
  }, []);

  return {
    tileBrowserCollapsed, setTileBrowserCollapsed,
    tileBrowserWidth, setTileBrowserWidth,
    selectedTilesetId, setSelectedTilesetId,
    selectedTileId, setSelectedTileId,
    tileRotation, setTileRotation,
    tileFlipH, setTileFlipH,
    tileLayer, setTileLayer,
    tileFitMode, setTileFitMode,
    selectedTileForm, setSelectedTileForm,
    tileSubtool, setTileSubtool,
    tileScale, setTileScale,
    brushSize, setBrushSize,
    brushSoftness, setBrushSoftness,
    paintEdgeBlend, setPaintEdgeBlend,
    tileDepth, setTileDepth,
    hiddenLayers, toggleHiddenLayer,
    recentTiles,
    handleTileSelect, handleTileDeselect,
  };
}

export { useTileBrush };
