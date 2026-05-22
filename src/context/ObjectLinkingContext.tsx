/**
 * ObjectLinkingContext.tsx
 * State management for the inter-object linking workflow.
 * Tracks when user is in "linking mode" and which object they're linking from.
 */

import type { Point } from '#types/core/geometry.types';

import { createContext, ComponentChildren, FunctionComponent } from 'preact';
import { useCallback, useContext, useMemo, useState } from 'preact/hooks';

// ===========================================
// Types
// ===========================================

/** Source object info when starting a link */
export interface LinkingSource {
  layerId: string;
  objectId: string;
  position: Point;
  objectType: string;
}

/** ObjectLinkingContext value shape */
export interface ObjectLinkingContextValue {
  isLinkingMode: boolean;
  linkingFrom: LinkingSource | null;
  startLinking: (source: LinkingSource) => void;
  cancelLinking: () => void;
}

// ===========================================
// Context
// ===========================================

const ObjectLinkingContext = createContext<ObjectLinkingContextValue | null>(null);

/**
 * Hook to access linking state
 * @returns Linking state and actions
 * @throws If used outside ObjectLinkingProvider
 */
function useLinkingMode(): ObjectLinkingContextValue {
  const context = useContext(ObjectLinkingContext);
  if (!context) {
    throw new Error('useLinkingMode must be used within ObjectLinkingProvider');
  }
  return context;
}

// ===========================================
// Provider
// ===========================================

interface ObjectLinkingProviderProps {
  children: ComponentChildren;
}

/**
 * Provider component for linking workflow state.
 * Wraps children and provides linking coordination via Context.
 */
const ObjectLinkingProvider: FunctionComponent<ObjectLinkingProviderProps> = ({ children }) => {
  const [linkingFrom, setLinkingFrom] = useState<LinkingSource | null>(null);

  const startLinking = useCallback((source: LinkingSource): void => {
    setLinkingFrom(source);
  }, []);

  const cancelLinking = useCallback((): void => {
    setLinkingFrom(null);
  }, []);

  const value = useMemo((): ObjectLinkingContextValue => ({
    isLinkingMode: linkingFrom !== null,
    linkingFrom,
    startLinking,
    cancelLinking
  }), [linkingFrom, startLinking, cancelLinking]);

  return (
    <ObjectLinkingContext.Provider value={value}>
      {children}
    </ObjectLinkingContext.Provider>
  );
};

export { ObjectLinkingProvider, useLinkingMode };