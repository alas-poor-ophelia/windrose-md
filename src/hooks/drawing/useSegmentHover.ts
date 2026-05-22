/**
 * useSegmentHover.ts
 *
 * Manages segment hover preview state for the segment draw tool.
 */

import type { ToolId } from '#types/tools/tool.types';
import type { SegmentHoverInfo } from '#types/hooks/drawingTools.types';

import { useCallback, useEffect, useState } from 'preact/hooks';
import { getSegmentAtPosition } from '../../geometry/core/cellAccessor';






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
  const [segmentHoverInfo, setSegmentHoverInfo] = useState<SegmentHoverInfo | null>(null);

  const updateSegmentHover = useCallback((cellX: number, cellY: number, localX: number, localY: number): void => {
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

  useEffect(() => {
    if (currentTool !== 'segmentDraw') {
      setSegmentHoverInfo(null);
    }
  }, [currentTool]);

  const clearSegmentHover = useCallback((): void => {
    setSegmentHoverInfo(null);
  }, []);

  return { segmentHoverInfo, updateSegmentHover, clearSegmentHover };
}

export { useSegmentHover };