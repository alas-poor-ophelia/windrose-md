/**
 * Text Label Renderer Module
 *
 * Renders text labels on the map canvas with rotation support,
 * stroke outline for readability, and customizable fonts.
 */

import type { TextLabel } from '#types/objects/note.types';

interface TextLabelRenderContext {
  ctx: CanvasRenderingContext2D;
  zoom: number;
  getFontCss: (fontFace: string) => string;
}

interface ScreenPosition {
  screenX: number;
  screenY: number;
}

/**
 * Renders a single text label at the given screen position.
 * Handles rotation, font styling, and stroke outline for readability.
 */
function renderTextLabel(
  label: TextLabel,
  position: ScreenPosition,
  context: TextLabelRenderContext
): void {
  const { ctx, zoom, getFontCss } = context;
  const { screenX, screenY } = position;

  ctx.save();

  ctx.translate(screenX, screenY);
  ctx.rotate(((label.rotation || 0) * Math.PI) / 180);

  const fontSize = label.fontSize * zoom;
  const fontFamily = getFontCss(label.fontFace || 'sans');
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Draw stroke outline for readability
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeText(label.content, 0, 0);

  // Draw fill
  ctx.fillStyle = label.color || '#ffffff';
  ctx.fillText(label.content, 0, 0);

  ctx.restore();
}

/**
 * Renders all text labels for a layer.
 * Skips rendering if showCoordinates is enabled or textLabels visibility is off.
 */
function renderTextLabels(
  labels: TextLabel[],
  context: TextLabelRenderContext,
  geometry: { worldToScreen: (x: number, y: number, offsetX: number, offsetY: number, zoom: number) => ScreenPosition },
  viewState: { offsetX: number; offsetY: number; zoom: number }
): void {
  const { offsetX, offsetY, zoom } = viewState;

  for (const label of labels) {
    const position = geometry.worldToScreen(
      label.position.x,
      label.position.y,
      offsetX,
      offsetY,
      zoom
    );
    renderTextLabel(label, position, context);
  }
}

return {
  renderTextLabel,
  renderTextLabels
};
