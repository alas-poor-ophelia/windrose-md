import { useEffect } from 'preact/hooks';
import type { MapData } from '#types/core/map.types';
import { getSettings } from '../../core/settingsAccessor';

interface UseKeyboardShortcutsOptions {
  isFocused: boolean;
  mapData: MapData | null;
  handleUndo: () => void;
  handleRedo: () => void;
  handleLayerSelect: (layerId: string) => void;
  /** Picture frame mode: only the frame-toggle shortcut stays live. */
  pictureFrameLocked?: boolean;
  /** Toggle picture frame mode (block mode only; undefined in full-pane). */
  onTogglePictureFrame?: () => void;
  /** Recenter the view on the current layer's content. */
  onRecenterView?: () => void;
}

function useKeyboardShortcuts({
  isFocused, mapData, handleUndo, handleRedo, handleLayerSelect,
  pictureFrameLocked = false, onTogglePictureFrame, onRecenterView
}: UseKeyboardShortcutsOptions): void {
  useEffect((): (() => void) | undefined => {
    if (!isFocused || !mapData) return undefined;

    const handler = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key;
      const mod = e.ctrlKey || e.metaKey;

      const shortcuts = getSettings().keyboardShortcuts ?? {};
      const bareKey = (s: string): string => { const parts = s.split('+'); return (parts[parts.length - 1] ?? s).toLowerCase(); };

      // Picture frame toggle works in both directions — it's the only way
      // back out of frame mode by keyboard.
      if (onTogglePictureFrame && !mod && !e.altKey && key.toLowerCase() === bareKey(shortcuts.pictureFrame ?? 'p')) {
        onTogglePictureFrame(); e.preventDefault(); return;
      }

      // Everything below edits map data; inert while the frame is locked.
      if (pictureFrameLocked) return;

      if (onRecenterView && !mod && !e.altKey && key.toLowerCase() === bareKey(shortcuts.recenter ?? 'home')) {
        onRecenterView(); e.preventDefault(); return;
      }

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
  }, [isFocused, mapData, handleUndo, handleRedo, handleLayerSelect, pictureFrameLocked, onTogglePictureFrame, onRecenterView]);
}

export { useKeyboardShortcuts };
