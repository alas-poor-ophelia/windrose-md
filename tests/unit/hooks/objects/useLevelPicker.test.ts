// @vitest-environment happy-dom
/**
 * useLevelPicker: the popup state is tied to the selection key and resets
 * when the selected ids change.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';

import { useLevelPicker, selectionKeyOf } from '../../../../src/hooks/objects/useLevelPicker';

type Api = ReturnType<typeof useLevelPicker>;
let root: HTMLElement | null = null;
afterEach(() => {
  if (root) { render(null, root); root.remove(); root = null; }
});

function mount(key: string | null): { api: () => Api; setKey: (k: string | null) => void } {
  root = document.createElement('div');
  document.body.appendChild(root);
  let latest: Api | null = null;
  const container = { current: root };
  const Probe = ({ k }: { k: string | null }): null => {
    latest = useLevelPicker(k, container);
    return null;
  };
  act(() => { render(h(Probe, { k: key }), root as HTMLElement); });
  return {
    api: () => latest as Api,
    setKey: (k) => { act(() => { render(h(Probe, { k }), root as HTMLElement); }); }
  };
}

describe('useLevelPicker', () => {
  it('state resets when the selection ids change', () => {
    const { api, setKey } = mount(selectionKeyOf('multi', ['b', 'a']));
    act(() => { api().open(); });
    expect(api().picker).not.toBeNull();
    setKey(selectionKeyOf('multi', ['a', 'c']));
    expect(api().picker).toBeNull();
    // Returning to the original selection does not resurrect the popup.
    setKey(selectionKeyOf('multi', ['a', 'b']));
    expect(api().picker).toBeNull();
  });

  it('selection key ignores id order', () => {
    expect(selectionKeyOf('multi', ['b', 'a'])).toBe(selectionKeyOf('multi', ['a', 'b']));
  });

  it('open is a no-op without a selection', () => {
    const { api } = mount(null);
    act(() => { api().open(); });
    expect(api().picker).toBeNull();
  });
});
