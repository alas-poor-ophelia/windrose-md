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
import type { HandlerLayerName } from '#types/hooks/eventCoordinator.types';
import { useEventHandlerRegistration } from '../../context/EventHandlerContext';

interface UseLayerHandlersOptions {
  /** When false the layer is unregistered entirely (default true). */
  enabled?: boolean;
}

/**
 * Register `handlers` under `name` for the lifetime of the component
 * (or while `options.enabled` holds).
 *
 * @param name - Registration key in the coordinator's handler registry
 * @param handlers - Latest handler closures/state; may be rebuilt every render
 * @param options - Optional `enabled` gate
 */
function useLayerHandlers(
  name: HandlerLayerName,
  handlers: Record<string, unknown>,
  options?: UseLayerHandlersOptions
): void {
  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();
  const enabled = options?.enabled ?? true;

  const handlersRef = useRef<Record<string, unknown> | null>(null);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled) return undefined;
    const proxy = new Proxy({}, {
      get(_target, prop: string) {
        return handlersRef.current?.[prop];
      }
    });
    registerHandlers(name, proxy);
    return () => unregisterHandlers(name);
  }, [enabled, name, registerHandlers, unregisterHandlers]);
}

export { useLayerHandlers };
export type { UseLayerHandlersOptions };
