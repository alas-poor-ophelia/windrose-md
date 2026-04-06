/**
 * useEdgeSnapModifiers.ts
 *
 * Keyboard modifier tracking for edge snap and freeform placement modes.
 * Extracted from useObjectInteractions.ts.
 */

import type { ToolId } from '#types/tools/tool.types';
import type { MapStateContextValue, MapSelectionContextValue } from '#types/contexts/context.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const { useMapState } = await requireModuleByName("MapContext.tsx") as {
  useMapState: () => MapStateContextValue;
};

const { useMapSelection } = await requireModuleByName("MapSelectionContext.tsx") as {
  useMapSelection: () => MapSelectionContextValue;
};

function useEdgeSnapModifiers(): {
  altKeyPressedRef: { current: boolean };
  shiftKeyPressedRef: { current: boolean };
  edgeSnapMode: boolean;
  setEdgeSnapMode: (v: boolean) => void;
  freeformDragPreview: boolean;
} {
  const { currentTool } = useMapState();
  const { selectedItem, setSelectedItem } = useMapSelection();

  const [edgeSnapMode, setEdgeSnapMode] = dc.useState(false);
  const [freeformDragPreview, setFreeformDragPreview] = dc.useState(false);
  const altKeyPressedRef = dc.useRef(false);
  const shiftKeyPressedRef = dc.useRef(false);
  const prevToolRef = dc.useRef(currentTool);

  dc.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Alt' && !altKeyPressedRef.current) {
        altKeyPressedRef.current = true;
        if (currentTool === 'addObject' || selectedItem?.type === 'object') {
          setEdgeSnapMode(true);
          if (shiftKeyPressedRef.current) {
            setFreeformDragPreview(true);
          }
        }
      }
      if (e.key === 'Shift') {
        shiftKeyPressedRef.current = true;
        if (altKeyPressedRef.current && (currentTool === 'addObject' || selectedItem?.type === 'object')) {
          setFreeformDragPreview(true);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent): void => {
      if (e.key === 'Alt') {
        altKeyPressedRef.current = false;
        setEdgeSnapMode(false);
        setFreeformDragPreview(false);
      }
      if (e.key === 'Shift') {
        shiftKeyPressedRef.current = false;
        setFreeformDragPreview(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedItem, currentTool]);

  dc.useEffect(() => {
    if (!selectedItem || selectedItem.type !== 'object') {
      setEdgeSnapMode(false);
    }

    if (prevToolRef.current !== currentTool && selectedItem) {
      if (currentTool !== 'select') {
        setSelectedItem(null);
        setEdgeSnapMode(false);
      }
    }
    prevToolRef.current = currentTool;
  }, [currentTool, selectedItem, setSelectedItem]);

  return { altKeyPressedRef, shiftKeyPressedRef, edgeSnapMode, setEdgeSnapMode, freeformDragPreview };
}

return { useEdgeSnapModifiers };
