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
 * - stampMode: Whether stamp mode is active
 *
 * Operations provided:
 * - handleTileSelect: Select a tile from a tileset
 * - handleTileDeselect: Clear tile selection and reset transforms
 */


import { useCallback, useState } from 'preact/hooks';
interface UseTileBrushResult {
  tileBrowserCollapsed: boolean;
  setTileBrowserCollapsed: (v: boolean) => void;
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
  stampMode: boolean;
  setStampMode: (v: boolean) => void;
  tileScale: number;
  setTileScale: (v: number) => void;
  brushSize: number;
  setBrushSize: (v: number) => void;
  handleTileSelect: (tilesetId: string, tileId: string) => void;
  handleTileDeselect: () => void;
}

function useTileBrush(): UseTileBrushResult {
  const [tileBrowserCollapsed, setTileBrowserCollapsed] = useState<boolean>(true);
  const [selectedTilesetId, setSelectedTilesetId] = useState<string | null>(null);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [tileRotation, setTileRotation] = useState<number>(0);
  const [tileFlipH, setTileFlipH] = useState<boolean>(false);
  const [tileLayer, setTileLayer] = useState<'base' | 'overlay'>('base');
  const [tileFitMode, setTileFitMode] = useState<'fill' | 'contain' | 'auto'>('auto');
  const [stampMode, setStampMode] = useState<boolean>(false);
  const [tileScale, setTileScale] = useState<number>(1);
  const [brushSize, setBrushSize] = useState<number>(1);

  const handleTileSelect = useCallback((tilesetId: string, tileId: string) => {
    setSelectedTilesetId(tilesetId);
    setSelectedTileId(tileId);
  }, []);

  const handleTileDeselect = useCallback(() => {
    setSelectedTilesetId(null);
    setSelectedTileId(null);
    setTileRotation(0);
    setTileFlipH(false);
  }, []);

  return {
    tileBrowserCollapsed, setTileBrowserCollapsed,
    selectedTilesetId, setSelectedTilesetId,
    selectedTileId, setSelectedTileId,
    tileRotation, setTileRotation,
    tileFlipH, setTileFlipH,
    tileLayer, setTileLayer,
    tileFitMode, setTileFitMode,
    stampMode, setStampMode,
    tileScale, setTileScale,
    brushSize, setBrushSize,
    handleTileSelect, handleTileDeselect,
  };
}

export { useTileBrush };