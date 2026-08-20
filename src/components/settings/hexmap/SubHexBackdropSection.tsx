/**
 * SubHexBackdropSection.tsx
 *
 * Per-map override for the sub-hex parent map backdrop: inherit the global
 * setting, always show, or always hide. Only relevant while editing a
 * sub-hex map's own settings (isInSubHex).
 */

import type { VNode } from 'preact';

import { useModalShell, useHexGrid } from '../../../context/MapSettingsContext';
import { SettingItem } from '../SettingItem';

type BackdropChoice = 'global' | 'show' | 'hide';

function toChoice(value: boolean | undefined): BackdropChoice {
  if (value === true) return 'show';
  if (value === false) return 'hide';
  return 'global';
}

function fromChoice(choice: BackdropChoice): boolean | undefined {
  if (choice === 'show') return true;
  if (choice === 'hide') return false;
  return undefined;
}

/**
 * Parent map backdrop override selector — shown only for sub-hex maps.
 */
function SubHexBackdropSection(): VNode | null {
  const { isInSubHex } = useModalShell();
  const { showParentBackdrop, setShowParentBackdrop } = useHexGrid();

  if (!isInSubHex) return null;

  return (
    <SettingItem
      name="Parent map backdrop"
      description="Show a still of the parent map behind this sub-map"
    >
      <select
        value={toChoice(showParentBackdrop)}
        onChange={(e: Event) => setShowParentBackdrop(fromChoice((e.target as HTMLSelectElement).value as BackdropChoice))}
        style={{
          padding: '4px 8px',
          borderRadius: '4px',
          border: '1px solid var(--background-modifier-border)',
          background: 'var(--background-primary)',
          color: 'var(--text-normal)',
          fontSize: '13px'
        }}
      >
        <option value="global">Use global setting</option>
        <option value="show">Show</option>
        <option value="hide">Hide</option>
      </select>
    </SettingItem>
  );
}

export { SubHexBackdropSection };
