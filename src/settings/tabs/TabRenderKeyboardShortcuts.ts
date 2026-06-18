import type { SettingsTabThis } from './settingsTabContext';
import { Platform, Setting } from 'obsidian';

// settingsPlugin-TabRenderKeyboardShortcuts.ts
// WindroseMDSettingsTab render methods - Keyboard Shortcuts section

interface ShortcutAction {
  id: string;
  label: string;
  scope: string;
}

export const TabRenderKeyboardShortcutsMethods = {
  renderKeyboardShortcutsContent(this: SettingsTabThis, containerEl: HTMLElement): void {
    const SHORTCUT_ACTIONS: ShortcutAction[] = [
      { id: 'selectTool', label: 'Select Tool', scope: 'Map hover' },
      { id: 'drawTool', label: 'Draw Tool', scope: 'Map hover' },
      { id: 'freehandTool', label: 'Freehand Draw', scope: 'Map hover' },
      { id: 'eraseTool', label: 'Erase Tool', scope: 'Map hover' },
      { id: 'notePinTool', label: 'Place Note Pin', scope: 'Map hover' },
      { id: 'measureTool', label: 'Measure Distance', scope: 'Map hover' },
      { id: 'panMode', label: 'Pan (hold)', scope: 'Map hover' },
      { id: 'showCoordinates', label: 'Show Coordinates', scope: 'Map hover' },
      { id: 'rotate', label: 'Rotate Selected', scope: 'Object selected' },
      { id: 'layerPrev', label: 'Previous Layer', scope: 'Map hover' },
      { id: 'layerNext', label: 'Next Layer', scope: 'Map hover' },
      { id: 'undo', label: 'Undo', scope: 'Map hover' },
      { id: 'redo', label: 'Redo', scope: 'Map hover' }
    ];

    const DEFAULT_SHORTCUTS: Record<string, string> = {
      selectTool: 's', drawTool: 'd', freehandTool: 'f', eraseTool: 'e',
      notePinTool: 'n', measureTool: 'm', panMode: 'Space', showCoordinates: 'c',
      rotate: 'r', layerPrev: '[', layerNext: ']', undo: 'Mod+Z', redo: 'Mod+Y'
    };

    const isMac = Platform.isMacOS;

    function formatKey(keyStr: string): string {
      if (!keyStr) return '—';
      return keyStr
        .replace(/Mod\+/gi, isMac ? '⌘' : 'Ctrl+')
        .replace(/Shift\+/gi, isMac ? '⇧' : 'Shift+')
        .replace(/Alt\+/gi, isMac ? '⌥' : 'Alt+')
        .replace('Space', '␣');
    }

    containerEl.createEl('p', {
      text: 'Keyboard shortcuts activate when the mouse is over the map canvas. Click a shortcut to rebind it.',
      cls: 'setting-item-description'
    });

    for (const action of SHORTCUT_ACTIONS) {
      const shortcuts = this.plugin.settings.keyboardShortcuts || {};
      const currentKey = shortcuts[action.id] || DEFAULT_SHORTCUTS[action.id] || '';

      const setting = new Setting(containerEl)
        .setName(action.label)
        .setDesc(action.scope);

      const kbdContainer = setting.controlEl.createDiv({ cls: 'windrose-kbd-container' });

      const kbdEl = kbdContainer.createEl('kbd', {
        text: formatKey(currentKey),
        cls: 'windrose-kbd-key'
      });
      kbdEl.style.cssText = 'cursor:pointer; padding:2px 8px; border:1px solid var(--background-modifier-border); border-radius:4px; font-family:var(--font-monospace); font-size:0.85em; min-width:24px; text-align:center; display:inline-block; background:var(--background-secondary);';

      let isCapturing = false;

      kbdEl.addEventListener('click', () => {
        if (isCapturing) return;
        isCapturing = true;
        kbdEl.textContent = 'Press a key...';
        kbdEl.style.color = 'var(--text-accent)';
        kbdEl.style.borderColor = 'var(--text-accent)';

        const captureHandler = (e: KeyboardEvent): void => {
          e.preventDefault();
          e.stopPropagation();

          if (e.key === 'Escape') {
            kbdEl.textContent = formatKey(currentKey);
            kbdEl.style.color = '';
            kbdEl.style.borderColor = 'var(--background-modifier-border)';
            isCapturing = false;
            window.removeEventListener('keydown', captureHandler, true);
            return;
          }

          if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;

          let newKey = '';
          if (e.ctrlKey || e.metaKey) newKey += 'Mod+';
          if (e.shiftKey) newKey += 'Shift+';
          if (e.altKey) newKey += 'Alt+';

          if (e.key === ' ') newKey += 'Space';
          else if (e.key.length === 1) newKey += e.key.toLowerCase();
          else newKey += e.key;

          if (!this.plugin.settings.keyboardShortcuts) {
            this.plugin.settings.keyboardShortcuts = Object.assign({}, DEFAULT_SHORTCUTS);
          }
          this.plugin.settings.keyboardShortcuts[action.id] = newKey;
          this.settingsChanged = true;
          void this.plugin.saveSettings();

          kbdEl.textContent = formatKey(newKey);
          kbdEl.style.color = '';
          kbdEl.style.borderColor = 'var(--background-modifier-border)';
          isCapturing = false;
          window.removeEventListener('keydown', captureHandler, true);
        };

        window.addEventListener('keydown', captureHandler, true);
      });

      setting.addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default')
        .onClick(async () => {
          if (!this.plugin.settings.keyboardShortcuts) {
            this.plugin.settings.keyboardShortcuts = Object.assign({}, DEFAULT_SHORTCUTS);
          }
          this.plugin.settings.keyboardShortcuts[action.id] = DEFAULT_SHORTCUTS[action.id];
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));
    }

    new Setting(containerEl)
      .setName('Reset All Shortcuts')
      .setDesc('Restore all keyboard shortcuts to their default values')
      .addButton(btn => btn
        .setButtonText('Reset All')
        .setWarning()
        .onClick(async () => {
          this.plugin.settings.keyboardShortcuts = Object.assign({}, DEFAULT_SHORTCUTS);
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));
  }
};
