/**
 * renderFrame.types.ts
 *
 * The one per-target render contract (ABS-05). A RenderFrame describes WHERE
 * and AT WHAT TRANSFORM a pass draws: the target context, the geometry, the
 * world->screen transform and the target surface size. Passes take
 * `(frame, data, options?)`; map-type branches read `frame.geometry.type`
 * rather than separate isHexMap/orientation flags.
 *
 * The static map passes (src/geometry/renderers/staticPasses.ts) are the
 * first adopters. Older layer renderers still take their own argument lists
 * and their own {x, y, zoom} shapes; `viewState` here is the bridge to them
 * until they move to `(frame, data, options?)`.
 */

import type { ExtendedGeometry } from '../contexts/context.types';
import type { RendererTheme, RendererViewState } from '../hooks/canvasRenderer.types';

export interface RenderFrame {
  /** Target context: the live canvas or the static-layer offscreen. */
  readonly ctx: CanvasRenderingContext2D;
  readonly geometry: ExtendedGeometry;
  readonly theme: RendererTheme;
  /** Screen position of the world origin on the target, in target px. */
  readonly offsetX: number;
  readonly offsetY: number;
  readonly zoom: number;
  /** Target surface size in px (the offscreen is larger than the viewport). */
  readonly width: number;
  readonly height: number;
  /**
   * Rotation (degrees) the target context is drawn under: 0 for the unrotated
   * offscreen snapshot, the map's northDirection when drawing straight onto
   * the rotated live canvas. Only widens viewport culling.
   */
  readonly cullNorth: number;
  /** `{ x: offsetX, y: offsetY, zoom }` for renderers still on RendererViewState. */
  readonly viewState: RendererViewState;
}
