/**
 * FogOfWarToolbar.tsx
 *
 * Floating toolbar for Fog of War drawing tools.
 * Appears when FoW tools are toggled from the visibility menu.
 */

import type { FogTool, FogOfWarState } from './VisibilityToolbar.tsx';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { isBridgeAvailable, getObsidianModule } = await requireModuleByName("obsidianBridge.ts");

interface FogOfWarToolbarProps {
  isOpen: boolean;
  fogOfWarState: FogOfWarState;
  onFogToolSelect: (tool: FogTool) => void;
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
}: FogOfWarToolbarProps): React.ReactElement | null => {

  const handleClearAll = dc.useCallback(() => {
    if (isBridgeAvailable()) {
      const obs = getObsidianModule();
      const ModalClass = obs.Modal as new (app: unknown) => {
        contentEl: HTMLElement;
        titleEl: { setText: (t: string) => void };
        open: () => void;
        close: () => void;
        onClose: () => void;
      };
      const app = (dc as unknown as { app: unknown }).app;

      let closedByCode = false;
      const modal = new ModalClass(app);
      modal.titleEl.setText('Clear All Fog');
      modal.contentEl.createEl('p', {
        text: 'This will remove all fog from the current layer. This cannot be undone.'
      });

      const buttonRow = modal.contentEl.createDiv({ cls: 'modal-button-container' });
      const cancelBtn = buttonRow.createEl('button', { text: 'Cancel' });
      cancelBtn.addEventListener('click', () => { closedByCode = true; modal.close(); });

      const deleteBtn = buttonRow.createEl('button', { text: 'Clear All Fog', cls: 'mod-warning' });
      deleteBtn.addEventListener('click', () => { closedByCode = true; modal.close(); onFogClearAll(); });

      modal.onClose = () => {};
      modal.open();
    } else {
      if (confirm('Clear all fog from this layer? This cannot be undone.')) {
        onFogClearAll();
      }
    }
  }, [onFogClearAll]);

  if (!isOpen) return null;

  return (
    <div className="dmt-fow-floating-toolbar">
      <button
        className={`dmt-fow-tool-btn ${!fogOfWarState.enabled ? 'disabled' : ''}`}
        onClick={onFogVisibilityToggle}
        title={fogOfWarState.enabled ? "Hide fog overlay" : "Show fog overlay"}
        disabled={!fogOfWarState.initialized}
      >
        <dc.Icon icon={fogOfWarState.enabled ? "lucide-eye" : "lucide-eye-off"} />
      </button>

      <div className="dmt-fow-floating-separator" />

      <button
        className={`dmt-fow-tool-btn ${fogOfWarState.activeTool === 'paint' ? 'active' : ''}`}
        onClick={() => onFogToolSelect('paint')}
        title="Paint fog onto cells"
      >
        <dc.Icon icon="lucide-paintbrush" />
      </button>

      <button
        className={`dmt-fow-tool-btn ${fogOfWarState.activeTool === 'erase' ? 'active' : ''}`}
        onClick={() => onFogToolSelect('erase')}
        title="Erase fog (reveal cells)"
      >
        <dc.Icon icon="lucide-eraser" />
      </button>

      <button
        className={`dmt-fow-tool-btn ${fogOfWarState.activeTool === 'rectangle' ? 'active' : ''}`}
        onClick={() => onFogToolSelect('rectangle')}
        title="Rectangle tool - click two corners"
      >
        <dc.Icon icon="lucide-square" />
      </button>

      <div className="dmt-fow-floating-separator" />

      <button
        className="dmt-fow-tool-btn"
        onClick={onFogFillAll}
        title="Fill all painted cells with fog"
      >
        <dc.Icon icon="lucide-paint-bucket" />
      </button>

      <button
        className="dmt-fow-tool-btn"
        onClick={handleClearAll}
        title="Clear all fog from layer"
      >
        <dc.Icon icon="lucide-x-square" />
      </button>
    </div>
  );
};

return { FogOfWarToolbar };
