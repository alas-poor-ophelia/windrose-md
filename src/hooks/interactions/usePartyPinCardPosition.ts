/**
 * usePartyPinCardPosition.ts
 *
 * Anchor geometry + placement for the floating beacon controls card:
 * projects the pin cell to container-relative screen bounds, feeds the
 * shared toolbar positioning (flip above/below, edge clamping), and tracks
 * live pan/zoom gestures so the card can hide mid-gesture (it anchors to
 * committed coordinates — tracking the gesture would lag) and reanchor on
 * commit. Extracted from PartyPinControls.
 */

import { useEffect, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import type { IGeometry } from '#types/core/geometry.types';
import type { MapData, PartyPin } from '#types/core/map.types';
import type { ViewController } from '#types/hooks/viewController.types';

import { cellToScreen } from '../../drawing/cellToScreenConverter';
import { findCanvasContainer } from '../canvas/useLiveOverlayTransform';
import { useToolbarPosition } from './useToolbarPosition';

const CARD_WIDTH = 232;
const CARD_HEIGHT = 200;

interface PartyPinCardPositionArgs {
  pin: PartyPin;
  geometry: IGeometry | null;
  mapData: MapData | null;
  canvasRef: RefObject<HTMLCanvasElement> | null;
  /** Live pan/zoom controller — the card hides mid-gesture and reanchors on commit */
  viewController?: ViewController;
  /** In-range result count — grows the estimated card height for placement */
  resultCount: number;
}

interface PartyPinCardPosition {
  toolbarPos: ReturnType<typeof useToolbarPosition>;
  isViewGesturing: boolean;
}

function usePartyPinCardPosition({
  pin,
  geometry,
  mapData,
  canvasRef,
  viewController,
  resultCount
}: PartyPinCardPositionArgs): PartyPinCardPosition {
  // Hide mid pan/zoom gesture; reanchor on commit
  const [isViewGesturing, setIsViewGesturing] = useState(false);
  useEffect(() => {
    if (!viewController) return undefined;
    return viewController.subscribeLive(() => {
      setIsViewGesturing(viewController.isGesturing());
    });
  }, [viewController]);

  // Resolve anchor geometry up front so the positioning hook runs
  // unconditionally (bounds stay null until everything is available)
  let container: HTMLElement | null = null;
  let bounds: { screenX: number; screenY: number; width: number; height: number } | null = null;

  const canvas = canvasRef?.current ?? null;
  if (geometry && mapData?.viewState && canvas) {
    const { width: canvasWidth, height: canvasHeight } = canvas;
    const canvasRect = canvas.getBoundingClientRect();
    const displayScale = canvasRect.width / canvasWidth;

    container = findCanvasContainer(canvas);

    if (container) {
      const containerRect = container.getBoundingClientRect();
      const pinScreen = cellToScreen(
        pin.position.x, pin.position.y,
        geometry as Parameters<typeof cellToScreen>[2],
        mapData as Parameters<typeof cellToScreen>[3],
        canvasWidth, canvasHeight
      );
      const cellScreenSize = geometry.getScaledCellSize(mapData.viewState.zoom) * displayScale;
      bounds = {
        screenX: pinScreen.x * displayScale + (canvasRect.left - containerRect.left),
        screenY: pinScreen.y * displayScale + (canvasRect.top - containerRect.top),
        width: cellScreenSize,
        height: cellScreenSize * 2
      };
    }
  }

  const toolbarPos = useToolbarPosition({
    bounds,
    containerRef: { current: container },
    toolbarWidth: CARD_WIDTH,
    toolbarHeight: CARD_HEIGHT + Math.min(resultCount, 6) * 26 + 30,
    avoidAnchorOverlap: true
  });

  return { toolbarPos, isViewGesturing };
}

export { usePartyPinCardPosition, CARD_WIDTH };
