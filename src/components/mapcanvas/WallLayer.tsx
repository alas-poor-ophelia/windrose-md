/**
 * WallLayer.tsx
 *
 * Wall/path tool layer: draw and edit texture strips along polylines, and
 * seat openings (doors/windows/thresholds) in wall gaps.
 *
 * This component only composes the tool:
 * - useWallTools (hooks/walls): tool state, pointer/keyboard handling, wall
 *   mutation; pure edit geometry in drawing/wallEditGeometry.ts,
 * - useWallOverlay (via useWallTools): the private overlay canvas (draw
 *   preview, edit handles, opening ghost), through useOverlayCanvas,
 * - useWallToolSurface: publishes the drawer-footer control surface.
 * It renders no DOM: controls live in the drawer footer, handles on the overlay.
 */

import type { WallPath, WallToolSurface } from '#types/core/wallpath.types';
import type { VNode } from 'preact';

import { useLayerHandlers } from '../../hooks/canvas/useLayerHandlers';
import { useWallTools } from '../../hooks/walls/useWallTools';
import { useWallToolSurface } from '../../hooks/walls/useWallToolSurface';

export interface WallLayerProps {
  currentTool: string;
  selectedTilesetId: string | null;
  selectedTileId: string | null;
  onWallPathsChange: (wallPaths: WallPath[], suppressHistory?: boolean) => void;
  /**
   * Reports the wall currently being edit-dragged (null when idle). The parent
   * threads this to the renderer so the static raster drops the dragged wall —
   * the live overlay owns it during the gesture, and mapData is untouched until
   * the single commit on pointerup.
   */
  onDragStateChange?: (wallId: string | null) => void;
  /**
   * Publishes the wall-tool control surface (draw/edit state + actions) so the
   * tile-drawer footer can render the tool's controls. WallLayer renders no DOM
   * of its own — its controls live in the drawer. Null when the tool is idle.
   */
  onSurfaceChange?: (surface: WallToolSurface | null) => void;
  /**
   * Arms the built-in "Threshold" placement mode (§5.3 primary trigger): every
   * click cuts a BARE gap (no seated art) at a default 1-cell width, regardless
   * of whether a portal asset is also armed. Independent of the Alt-click bare
   * path (which uses the armed asset's derived width).
   */
  bareThresholdArmed?: boolean;
  /** Called on Escape while bare-threshold placement is armed, to disarm it. */
  onDisarmOpening?: () => void;
  /**
   * Tile-brush Scale slider value (1 = natural size). Multiplies the armed
   * portal art's derived width at placement time — baked into the gap's
   * `widthCells`, so the seated art (aspect-preserving) scales uniformly and
   * later edge-handle resizes compose on top. Bare thresholds ignore it.
   */
  tileScale?: number;
}

const WallLayer = (props: WallLayerProps): VNode | null => {
  const { handlers, surfaceLive, surfaceSnapshot } = useWallTools(props);

  useLayerHandlers('wall', handlers);

  useWallToolSurface(props.onSurfaceChange, surfaceLive, surfaceSnapshot);

  // No chrome: the tool's controls live in the drawer footer, its handles on
  // the canvas overlay. Nothing to render here.
  return null;
};

export { WallLayer };
