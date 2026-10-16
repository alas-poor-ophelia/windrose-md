/**
 * useLayerHandlers.ts
 *
 * Registers a layer's event handlers with EventHandlerContext through a
 * stable Proxy. The handler object is swapped into a ref on every render,
 * so the event coordinator always calls the latest closures without the
 * layer re-registering (re-registration would churn the coordinator
 * mid-gesture).
 */

import { useEffect, useRef } from 'preact/hooks';
import type { HandlerLayerName, HandlerTypeMap } from '#types/hooks/eventCoordinator.types';
import { useEventHandlerRegistration } from '../../context/EventHandlerContext';

interface UseLayerHandlersOptions {
  /** When false the layer is unregistered entirely (default true). */
  enabled?: boolean;
}

/**
 * Register `handlers` under `name` for the lifetime of the component
 * (or while `options.enabled` holds).
 *
 * `handlers` is typed by `name` (HandlerTypeMap): an undeclared key or a
 * wrong handler signature is a compile error, so nothing can register a
 * handler the coordinator never reads.
 *
 * @param name - Registration key in the coordinator's handler registry
 * @param handlers - Latest handler closures/state; may be rebuilt every render
 * @param options - Optional `enabled` gate
 */
function useLayerHandlers<T extends HandlerLayerName>(
  name: T,
  handlers: HandlerTypeMap[T],
  options?: UseLayerHandlersOptions
): void {
  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();
  const enabled = options?.enabled ?? true;

  const handlersRef = useRef<HandlerTypeMap[T]>(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled) return undefined;
    registerHandlers(name, createLatestRefProxy(handlersRef));
    return () => unregisterHandlers(name);
  }, [enabled, name, registerHandlers, unregisterHandlers]);
}

/**
 * A stable object whose every property read is forwarded to `ref.current`,
 * so the registry holds one identity while the closures behind it change
 * every render. Used by useLayerHandlers and usePanZoomCoordinator.
 */
function createLatestRefProxy<H extends object>(ref: { readonly current: H }): H {
  // The empty target is never read; every get resolves against ref.current.
  return new Proxy({} as H, {
    get(_target, prop) {
      return Reflect.get(ref.current, prop);
    }
  });
}

export { useLayerHandlers, createLatestRefProxy };
