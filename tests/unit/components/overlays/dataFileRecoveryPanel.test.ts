// @vitest-environment happy-dom
/**
 * "Data file not found" panel (live check D5): when a same-named store was
 * found elsewhere, the panel names that path and the configured one.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { h, render } from 'preact';
import type { App } from 'obsidian';

vi.mock('../../../../src/persistence/fileOperations', () => ({
  createEmptyDataFile: vi.fn(),
  findBestBackup: vi.fn(() => Promise.resolve(null)),
  restoreFromBackup: vi.fn(),
}));
vi.mock('../../../../src/settings/modals/ConfirmModal', () => ({ ConfirmModal: function ConfirmModal() { /* unused */ } }));

import { DataFileRecoveryPanel } from '../../../../src/components/overlays/DataFileRecoveryPanel';
import { AppContext } from '../../../../src/context/AppContext';

let root: HTMLElement | null = null;
afterEach(() => {
  if (root) { render(null, root); root.remove(); root = null; }
});

function mount(foundAt: string | null): HTMLElement {
  root = document.createElement('div');
  document.body.appendChild(root);
  render(
    h(AppContext.Provider, { value: {} as App },
      h(DataFileRecoveryPanel, { dataPath: 'windrose-md-data.json', kind: 'missing', foundAt })),
    root
  );
  return root;
}

describe('DataFileRecoveryPanel missing store', () => {
  it('shows where a same-named store was found and where to move it', () => {
    const el = mount('_lc-d5/windrose-md-data.json');
    const text = el.textContent ?? '';
    expect(text).toContain('A data file with this name was found at _lc-d5/windrose-md-data.json.');
    expect(text).toContain('Move it back to windrose-md-data.json, or create a new data file here.');
  });

  it('keeps the generic hint when nothing was found elsewhere', () => {
    const text = mount(null).textContent ?? '';
    expect(text).not.toContain('was found at');
    expect(text).toContain('If the file was moved or is still syncing');
  });
});
