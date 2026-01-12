/**
 * ObjectLinkingContext.tsx
 * State management for the inter-object linking workflow.
 * Tracks when user is in "linking mode" and which object they're linking from.
 */

import type { Point } from '#types/core/geometry.types';

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

const ObjectLinkingContext = dc.createContext<ObjectLinkingContextValue | null>(null);

/**
 * Hook to access linking state
 * @returns Linking state and actions
 * @throws If used outside ObjectLinkingProvider
 */
function useLinkingMode(): ObjectLinkingContextValue {
  const context = dc.useContext(ObjectLinkingContext);
  if (!context) {
    throw new Error('useLinkingMode must be used within ObjectLinkingProvider');
  }
  return context;
}

// ===========================================
// Provider
// ===========================================

interface ObjectLinkingProviderProps {
  children: React.ReactNode;
}

/**
 * Provider component for linking workflow state.
 * Wraps children and provides linking coordination via Context.
 */
const ObjectLinkingProvider: React.FC<ObjectLinkingProviderProps> = ({ children }) => {
  const [linkingFrom, setLinkingFrom] = dc.useState<LinkingSource | null>(null);

  const startLinking = dc.useCallback((source: LinkingSource): void => {
    setLinkingFrom(source);
  }, []);

  const cancelLinking = dc.useCallback((): void => {
    setLinkingFrom(null);
  }, []);

  const value = dc.useMemo((): ObjectLinkingContextValue => ({
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

return { ObjectLinkingProvider, useLinkingMode };
