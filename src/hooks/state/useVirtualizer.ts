import { useEffect, useRef, useState } from 'preact/hooks';
import {
  Virtualizer,
  observeElementRect,
  observeElementOffset,
  elementScroll,
} from '@tanstack/virtual-core';
import type {
  VirtualizerOptions,
} from '@tanstack/virtual-core';

type PreactVirtualizerOptions = Omit<
  VirtualizerOptions<HTMLElement, HTMLElement>,
  'observeElementRect' | 'observeElementOffset' | 'scrollToFn' | 'onChange'
>;

function usePreactVirtualizer(options: PreactVirtualizerOptions): Virtualizer<HTMLElement, HTMLElement> {
  const [, rerender] = useState(0);

  const instanceRef = useRef<Virtualizer<HTMLElement, HTMLElement> | null>(null);
  instanceRef.current ??= new Virtualizer<HTMLElement, HTMLElement>({
    ...options,
    observeElementRect,
    observeElementOffset,
    scrollToFn: elementScroll,
    onChange: () => { rerender(t => t + 1); },
  });

  const instance = instanceRef.current;
  instance.setOptions({
    ...options,
    observeElementRect,
    observeElementOffset,
    scrollToFn: elementScroll,
    onChange: () => { rerender(t => t + 1); },
  });

  useEffect(() => {
    return instance._didMount();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- _didMount() is a one-time lifecycle; instance is stable (same Virtualizer from ref)
  }, []);

  instance._willUpdate();

  return instance;
}

export { usePreactVirtualizer };
