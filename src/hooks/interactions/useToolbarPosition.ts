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
  /**
   * Never cover the anchor: when neither above nor below fully fits, place
   * the toolbar BESIDE the anchor (vertically clamped) instead of letting it
   * overflow onto it. Opt-in — default keeps the classic flip-only behavior.
   */
  avoidAnchorOverlap?: boolean;
}

interface ToolbarPositionResult {
  toolbarX: number;
  toolbarY: number;
  shouldFlipAbove: boolean;
  selectionTop: number;
  selectionBottom: number;
  viewportOffsetX: number;
  viewportOffsetY: number;
  /**
   * Set for avoidAnchorOverlap above-placements: CSS `bottom` (px from the
   * container's bottom edge) pinning the toolbar's BOTTOM above the anchor.
   * Consumers must style `bottom` instead of `top` when present — the real
   * rendered height can exceed the estimate, and a top-anchored card would
   * bleed down over the anchor; bottom-anchored it grows upward and clips
   * at the container top instead.
   */
  anchorBottom?: number;
}

function useToolbarPosition({
  bounds,
  containerRef,
  toolbarWidth,
  toolbarHeight,
  extraHeight = 0,
  avoidAnchorOverlap = false
}: ToolbarPositionOptions): ToolbarPositionResult | null {
  if (!bounds || !containerRef.current) return null;

  const toolbarGap = 8;
  const containerRect = containerRef.current.getBoundingClientRect();
  const containerHeight = containerRect.height;

  const selectionBottom = bounds.screenY + bounds.height / 2;
  const selectionTop = bounds.screenY - bounds.height / 2;

  const totalHeight = toolbarHeight + extraHeight;
  const totalHeightBelow = toolbarGap + totalHeight;
  const spaceBelow = containerHeight - selectionBottom;
  let shouldFlipAbove = spaceBelow < totalHeightBelow + 20;

  let toolbarX = bounds.screenX - toolbarWidth / 2;
  let toolbarY: number;

  if (shouldFlipAbove) {
    toolbarY = selectionTop - toolbarGap - toolbarHeight;
  } else {
    toolbarY = selectionBottom + toolbarGap;
  }

  let anchorBottom: number | undefined;
  if (avoidAnchorOverlap) {
    // Invariant: the toolbar must NEVER cover the anchor. Below placements
    // pin the TOP edge under the anchor (growth clips at container bottom);
    // above placements pin the BOTTOM edge over it via `anchorBottom`
    // (growth clips at container top). There is deliberately no centered
    // fallback — partial clipping beats covering the anchor.
    const fitsBelow = selectionBottom + toolbarGap + totalHeight <= containerHeight - 4;
    const fitsAbove = selectionTop - toolbarGap - totalHeight >= 4;
    const rightX = bounds.screenX + bounds.width / 2 + toolbarGap;
    const leftX = bounds.screenX - bounds.width / 2 - toolbarGap - toolbarWidth;
    const fitsRight = rightX + toolbarWidth <= containerRect.width - 4;
    const fitsLeft = leftX >= 4;
    if (fitsBelow) {
      shouldFlipAbove = false;
      toolbarY = selectionBottom + toolbarGap;
    } else if (fitsAbove) {
      shouldFlipAbove = true;
      toolbarY = selectionTop - toolbarGap - toolbarHeight;
      anchorBottom = containerHeight - (selectionTop - toolbarGap);
    } else if (fitsRight || fitsLeft) {
      // Beside the anchor (right first), vertically clamped — the offset
      // clears the anchor's half-width, so it can never sit on it
      toolbarY = Math.max(4, Math.min(containerHeight - totalHeight - 4, bounds.screenY - totalHeight / 2));
      toolbarX = fitsRight ? rightX : leftX;
      return {
        toolbarX, toolbarY, shouldFlipAbove, selectionTop, selectionBottom,
        viewportOffsetX: containerRect.left,
        viewportOffsetY: containerRect.top
      };
    } else {
      // Nothing fits: above, bottom-anchored — clipped at the top rather
      // than ever covering the anchor
      shouldFlipAbove = true;
      toolbarY = selectionTop - toolbarGap - toolbarHeight;
      anchorBottom = containerHeight - (selectionTop - toolbarGap);
    }
  }

  const minX = 4;
  const maxX = containerRect.width - toolbarWidth - 4;
  toolbarX = Math.max(minX, Math.min(maxX, toolbarX));

  return {
    toolbarX, toolbarY, shouldFlipAbove, selectionTop, selectionBottom,
    viewportOffsetX: containerRect.left,
    viewportOffsetY: containerRect.top,
    ...(anchorBottom != null ? { anchorBottom } : {})
  };
}

export { useToolbarPosition };