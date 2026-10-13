// @vitest-environment happy-dom
/**
 * useLayerHandlers (audit ABS-09 / WIRE-05): registration is typed per layer
 * name, and the registry holds one stable latest-ref proxy.
 */

import { describe, it, expect } from 'vitest';
import { h, render } from 'preact';
import type { ComponentChild } from 'preact';
import { act } from 'preact/test-utils';
import { EventHandlerProvider, useRegisteredHandlers } from '../../../../src/context/EventHandlerContext';
import type { EventHandlerContextValue } from '../../../../src/context/EventHandlerContext';
import { useLayerHandlers, createLatestRefProxy } from '../../../../src/hooks/canvas/useLayerHandlers';

describe('createLatestRefProxy', () => {
  it('forwards every read to the current ref value', () => {
    const ref = { current: { n: 1 } };
    const proxy = createLatestRefProxy(ref);
    expect(proxy.n).toBe(1);
    ref.current = { n: 2 };
    expect(proxy.n).toBe(2);
  });
});

describe('useLayerHandlers', () => {
  it('registers one stable proxy that always calls the latest closure', () => {
    let registry: EventHandlerContextValue | null = null;
    let label = 'first';
    function Layer(): null {
      const current = label;
      useLayerHandlers('notePin', { handleNotePinPlacement: () => current === 'second' });
      return null;
    }
    function Reader(): null {
      registry = useRegisteredHandlers();
      return null;
    }
    const root = document.createElement('div');
    const tree = (): ComponentChild => h(EventHandlerProvider, null, h(Layer, null), h(Reader, null));
    act(() => { render(tree(), root); });
    const first = registry!.getHandlers('notePin');
    expect(first?.handleNotePinPlacement?.(0, 0)).toBe(false);

    label = 'second';
    act(() => { render(tree(), root); });
    const second = registry!.getHandlers('notePin');
    expect(second).toBe(first);
    expect(second?.handleNotePinPlacement?.(0, 0)).toBe(true);

    act(() => { render(null, root); });
    expect(registry!.getHandlers('notePin')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Type-level checks (verified by `npm run typecheck`; never executed)
// ---------------------------------------------------------------------------

export function typeLevelChecks(): void {
  // @ts-expect-error -- an unknown registry key is rejected
  useLayerHandlers('fog', {});

  // @ts-expect-error -- a key the layer's handler type does not declare is rejected
  useLayerHandlers('measure', { handleMeasureMove: () => {}, clearMeasurement: () => {} });

  // @ts-expect-error -- a misspelled handler name is rejected
  useLayerHandlers('wall', { handlePointerDwn: () => {} });

  // @ts-expect-error -- a handler with an unrelated signature is rejected
  useLayerHandlers('notePin', { handleNotePinPlacement: (label: string) => label.length > 0 });
}
