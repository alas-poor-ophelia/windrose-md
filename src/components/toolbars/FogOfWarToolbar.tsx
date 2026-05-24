/**
 * FogOfWarToolbar.tsx
 *
 * Floating toolbar for Fog of War drawing tools.
 * Appears when FoW tools are toggled from the visibility menu.
 */

import type { FogOfWarState } from './VisibilityToolbar.tsx';
import type { FogToolId } from '#types/hooks/fog.types';
import type { VNode } from 'preact';

import { useCallback } from 'preact/hooks';
import { Modal } from 'obsidian';
import { useApp } from '../../context/AppContext';
import { Icon } from '../shared/Icon';


interface FogOfWarToolbarProps {
  isOpen: boolean;
  fogOfWarState: FogOfWarState;
  onFogToolSelect: (tool: FogToolId) => void;
  onFogVisibilityToggle: () => void;
  onFogFillAll: () => void;
  onFogClearAll: () => void;
}

const FogOfWarToolbar = ({
  isOpen,
  fogOfWarState,
  onFogToolSelect,
  onFogVisibilityToggle,
  onFogFillAll,
  onFogClearAll
}: FogOfWarToolbarProps): VNode | null => {
  const app = useApp();

  const handleClearAll = useCallback(() => {
    const modal = new Modal(app);
    modal.titleEl.setText('Clear all fog');
    modal.contentEl.createEl('p', {
      text: 'This will remove all fog from the current layer. This cannot be undone.'
    });

    const buttonRow = modal.contentEl.createDiv({ cls: 'modal-button-container' });
    const cancelBtn = buttonRow.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => modal.close());

    const deleteBtn = buttonRow.createEl('button', { text: 'Clear all fog', cls: 'mod-warning' });
    deleteBtn.addEventListener('click', () => { modal.close(); onFogClearAll(); });

    modal.open();
  }, [app, onFogClearAll]);

  if (!isOpen) return null;

  return (
    <div className="windrose-fow-floating-toolbar">
      <button
        className={`windrose-fow-tool-btn ${!fogOfWarState.enabled ? 'disabled' : ''}`}
        onClick={onFogVisibilityToggle}
        title={fogOfWarState.enabled ? "Hide fog overlay" : "Show fog overlay"}
        disabled={!fogOfWarState.initialized}
      >
        <Icon icon={fogOfWarState.enabled ? "lucide-eye" : "lucide-eye-off"} />
      </button>

      <div className="windrose-fow-floating-separator" />

      <button
        className={`windrose-fow-tool-btn ${fogOfWarState.activeTool === 'paint' ? 'active' : ''}`}
        onClick={() => onFogToolSelect('paint')}
        title="Paint fog onto cells"
      >
        <Icon icon="lucide-paintbrush" />
      </button>

      <button
        className={`windrose-fow-tool-btn ${fogOfWarState.activeTool === 'erase' ? 'active' : ''}`}
        onClick={() => onFogToolSelect('erase')}
        title="Erase fog (reveal cells)"
      >
        <Icon icon="lucide-eraser" />
      </button>

      <button
        className={`windrose-fow-tool-btn ${fogOfWarState.activeTool === 'rectangle' ? 'active' : ''}`}
        onClick={() => onFogToolSelect('rectangle')}
        title="Rectangle tool - click two corners"
      >
        <Icon icon="lucide-square" />
      </button>

      <div className="windrose-fow-floating-separator" />

      <button
        className="windrose-fow-tool-btn"
        onClick={onFogFillAll}
        title="Fill all painted cells with fog"
      >
        <Icon icon="lucide-paint-bucket" />
      </button>

      <button
        className="windrose-fow-tool-btn"
        onClick={handleClearAll}
        title="Clear all fog from layer"
      >
        <Icon icon="lucide-x-square" />
      </button>
    </div>
  );
};

export { FogOfWarToolbar };