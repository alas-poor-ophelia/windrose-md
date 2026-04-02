/**
 * useSegmentHover.ts
 *
 * Manages segment hover preview state for the segment draw tool.
 */

import type { ToolId } from '#types/tools/tool.types';
import type { SegmentName } from '#types/core/cell.types';
import type { SegmentHoverInfo } from '#types/hooks/drawingTools.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { getSegmentAtPosition } = await requireModuleByName("cellAccessor.ts") as {
  getSegmentAtPosition: (localX: number, localY: number) => SegmentName;
};

interface UseSegmentHoverOptions {
  currentTool: ToolId;
  isDrawing: boolean;
}

interface UseSegmentHoverResult {
  segmentHoverInfo: SegmentHoverInfo | null;
  updateSegmentHover: (cellX: number, cellY: number, localX: number, localY: number) => void;
  clearSegmentHover: () => void;
}

function useSegmentHover({ currentTool, isDrawing }: UseSegmentHoverOptions): UseSegmentHoverResult {
  const [segmentHoverInfo, setSegmentHoverInfo] = dc.useState<SegmentHoverInfo | null>(null);

  const updateSegmentHover = dc.useCallback((cellX: number, cellY: number, localX: number, localY: number): void => {
    if (isDrawing) {
      setSegmentHoverInfo(null);
      return;
    }

    if (currentTool !== 'segmentDraw') {
      setSegmentHoverInfo(null);
      return;
    }

    const segment = getSegmentAtPosition(localX, localY);

    if (segment) {
      setSegmentHoverInfo({ cellX, cellY, segment });
    } else {
      setSegmentHoverInfo(null);
    }
  }, [currentTool, isDrawing]);

  dc.useEffect(() => {
    if (currentTool !== 'segmentDraw') {
      setSegmentHoverInfo(null);
    }
  }, [currentTool]);

  const clearSegmentHover = dc.useCallback((): void => {
    setSegmentHoverInfo(null);
  }, []);

  return { segmentHoverInfo, updateSegmentHover, clearSegmentHover };
}

return { useSegmentHover };
