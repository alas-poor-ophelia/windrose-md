import type { SettingsTabThis } from './settingsTabContext';
import { Setting } from 'obsidian';
import { SHORTCUT_ACTIONS, DEFAULT_SHORTCUTS, formatKeyLabel as formatKey } from '../settingDefinitions';

// settingsPlugin-TabRenderKeyboardShortcuts.ts
// WindroseMDSettingsTab render methods - Keyboard Shortcuts section

export const TabRenderKeyboardShortcutsMethods = {
  renderKeyboardShortcutsContent(this: SettingsTabThis, containerEl: HTMLElement): void {
    containerEl.createEl('p', {
      text: 'Keyboard shortcuts activate when the mouse is over the map canvas. Click a shortcut to rebind it.',
      cls: 'setting-item-description'
    });

    for (const action of SHORTCUT_ACTIONS) {
      const shortcuts = this.plugin.settings.keyboardShortcuts ?? {};
      const currentKey = shortcuts[action.id] || DEFAULT_SHORTCUTS[action.id] || '';

      const setting = new Setting(containerEl)
        .setName(action.label)
        .setDesc(action.scope);

      const kbdContainer = setting.controlEl.createDiv({ cls: 'windrose-kbd-container' });

      const kbdEl = kbdContainer.createEl('kbd', {
        text: formatKey(currentKey),
        cls: 'windrose-kbd-key'
      });
      kbdEl.setCssStyles({
        cursor: 'pointer',
        padding: '2px 8px',
        border: '1px solid var(--background-modifier-border)',
        borderRadius: '4px',
        fontFamily: 'var(--font-monospace)',
        fontSize: '0.85em',
        minWidth: '24px',
        textAlign: 'center',
        display: 'inline-block',
        background: 'var(--background-secondary)'
      });

      let isCapturing = false;

      kbdEl.addEventListener('click', () => {
        if (isCapturing) return;
        isCapturing = true;
        kbdEl.textContent = 'Press a key...';
        kbdEl.setCssStyles({ color: 'var(--text-accent)', borderColor: 'var(--text-accent)' });

        const captureHandler = (e: KeyboardEvent): void => {
          e.preventDefault();
          e.stopPropagation();

          if (e.key === 'Escape') {
            kbdEl.textContent = formatKey(currentKey);
            kbdEl.setCssStyles({ color: '', borderColor: 'var(--background-modifier-border)' });
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

          this.plugin.settings.keyboardShortcuts ??= Object.assign({}, DEFAULT_SHORTCUTS);
          this.plugin.settings.keyboardShortcuts[action.id] = newKey;
          this.settingsChanged = true;
          void this.plugin.saveSettings();

          kbdEl.textContent = formatKey(newKey);
          kbdEl.setCssStyles({ color: '', borderColor: 'var(--background-modifier-border)' });
          isCapturing = false;
          window.removeEventListener('keydown', captureHandler, true);
        };

        window.addEventListener('keydown', captureHandler, true);
      });

      setting.addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default')
        .onClick(async () => {
          this.plugin.settings.keyboardShortcuts ??= Object.assign({}, DEFAULT_SHORTCUTS);
          this.plugin.settings.keyboardShortcuts[action.id] = DEFAULT_SHORTCUTS[action.id];
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));
    }

    new Setting(containerEl)
      .setName('Reset all shortcuts')
      .setDesc('Restore all keyboard shortcuts to their default values')
      .addButton(btn => btn
        .setButtonText('Reset all')
        .setWarning()
        .onClick(async () => {
          this.plugin.settings.keyboardShortcuts = Object.assign({}, DEFAULT_SHORTCUTS);
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));
  }
};
