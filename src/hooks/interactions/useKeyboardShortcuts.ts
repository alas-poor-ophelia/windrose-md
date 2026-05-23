import { useEffect } from 'preact/hooks';
import type { MapData } from '#types/core/map.types';
import { getSettings } from '../../core/settingsAccessor';

interface UseKeyboardShortcutsOptions {
  isFocused: boolean;
  mapData: MapData | null;
  handleUndo: () => void;
  handleRedo: () => void;
  handleLayerSelect: (layerId: string) => void;
}

function useKeyboardShortcuts({
  isFocused, mapData, handleUndo, handleRedo, handleLayerSelect
}: UseKeyboardShortcutsOptions): void {
  useEffect((): (() => void) | undefined => {
    if (!isFocused || !mapData) return undefined;

    const handler = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key;
      const mod = e.ctrlKey || e.metaKey;

      const shortcuts = getSettings().keyboardShortcuts ?? {};
      const bareKey = (s: string): string => { const parts = s.split('+'); return (parts[parts.length - 1] ?? s).toLowerCase(); };

      if (mod && !e.shiftKey && key.toLowerCase() === bareKey(shortcuts.undo ?? 'z')) {
        handleUndo(); e.preventDefault(); return;
      }
      if (mod && key.toLowerCase() === bareKey(shortcuts.redo ?? 'y')) {
        handleRedo(); e.preventDefault(); return;
      }
      if (mod && e.shiftKey && key.toLowerCase() === 'z') {
        handleRedo(); e.preventDefault(); return;
      }

      if (mod || e.altKey) return;

      const layerPrevKey = shortcuts.layerPrev ?? '[';
      const layerNextKey = shortcuts.layerNext ?? ']';

      if (key === layerPrevKey || key === layerNextKey) {
        const layers = mapData.layers;
        const currentIdx = layers.findIndex((l: { id: string }) => l.id === mapData.activeLayerId);
        if (key === layerPrevKey && currentIdx > 0) {
          handleLayerSelect(layers[currentIdx - 1].id);
          e.preventDefault();
        } else if (key === layerNextKey && currentIdx < layers.length - 1) {
          handleLayerSelect(layers[currentIdx + 1].id);
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFocused, mapData, handleUndo, handleRedo, handleLayerSelect]);
}

export { useKeyboardShortcuts };
