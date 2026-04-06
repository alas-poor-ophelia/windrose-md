/**
 * useToolbarPosition.ts
 *
 * Shared positioning logic for selection toolbars.
 * Handles flip-above/below detection and horizontal clamping.
 */

interface ToolbarBounds {
  screenX: number;
  screenY: number;
  width: number;
  height: number;
}

interface ToolbarPositionOptions {
  bounds: ToolbarBounds | null;
  containerRef: { current: HTMLElement | null };
  toolbarWidth: number;
  toolbarHeight: number;
  extraHeight?: number;
}

interface ToolbarPositionResult {
  toolbarX: number;
  toolbarY: number;
  shouldFlipAbove: boolean;
  selectionTop: number;
  selectionBottom: number;
}

function useToolbarPosition({
  bounds,
  containerRef,
  toolbarWidth,
  toolbarHeight,
  extraHeight = 0
}: ToolbarPositionOptions): ToolbarPositionResult | null {
  if (!bounds || !containerRef.current) return null;

  const toolbarGap = 4;
  const containerRect = containerRef.current.getBoundingClientRect();
  const containerHeight = containerRect.height;

  const selectionBottom = bounds.screenY + bounds.height / 2;
  const selectionTop = bounds.screenY - bounds.height / 2;

  const totalHeightBelow = toolbarGap + toolbarHeight + extraHeight;
  const spaceBelow = containerHeight - selectionBottom;
  const shouldFlipAbove = spaceBelow < totalHeightBelow + 20;

  let toolbarX = bounds.screenX - toolbarWidth / 2;
  let toolbarY: number;

  if (shouldFlipAbove) {
    toolbarY = selectionTop - toolbarGap - toolbarHeight;
  } else {
    toolbarY = selectionBottom + toolbarGap;
  }

  const minX = 4;
  const maxX = containerRect.width - toolbarWidth - 4;
  toolbarX = Math.max(minX, Math.min(maxX, toolbarX));

  return { toolbarX, toolbarY, shouldFlipAbove, selectionTop, selectionBottom };
}

return { useToolbarPosition };
