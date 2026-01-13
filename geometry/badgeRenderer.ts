/**
 * Badge Renderer Module
 *
 * Renders indicator badges on map objects:
 * - Note link badge (linked to Obsidian note)
 * - Custom tooltip indicator
 * - Object link indicator (inter-object linking)
 *
 * All functions are pure - they draw to the provided canvas context
 * without side effects.
 */

interface BadgePosition {
  screenX: number;
  screenY: number;
  objectWidth: number;
  objectHeight: number;
}

interface BadgeConfig {
  scaledSize: number;
}

/**
 * Renders a note link badge in the top-right corner of an object.
 * Shows a blue circle with a scroll emoji for objects linked to notes.
 */
function renderNoteLinkBadge(
  ctx: CanvasRenderingContext2D,
  position: BadgePosition,
  config: BadgeConfig
): void {
  const { screenX, screenY, objectWidth, objectHeight } = position;
  const { scaledSize } = config;

  const maxBadgeSize = Math.min(objectWidth, objectHeight) * 0.3;
  const badgeSize = Math.min(maxBadgeSize, Math.max(8, scaledSize * 0.25));
  const badgeX = screenX + objectWidth - badgeSize - 3;
  const badgeY = screenY + 3;

  ctx.fillStyle = 'rgba(74, 158, 255, 0.9)';
  ctx.beginPath();
  ctx.arc(badgeX + badgeSize / 2, badgeY + badgeSize / 2, badgeSize / 2, 0, Math.PI * 2);
  ctx.fill();

  const badgeFontSize = badgeSize * 0.7;
  ctx.font = `${badgeFontSize}px 'Noto Emoji', 'Noto Sans Symbols 2', monospace`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('\u{1F4DC}', badgeX + badgeSize / 2, badgeY + badgeSize / 2);
}

/**
 * Renders a custom tooltip indicator in the bottom-right corner.
 * Shows a small blue dot with white border for objects with custom tooltips.
 */
function renderTooltipIndicator(
  ctx: CanvasRenderingContext2D,
  position: BadgePosition,
  config: BadgeConfig
): void {
  const { screenX, screenY, objectWidth, objectHeight } = position;
  const { scaledSize } = config;

  const indicatorSize = Math.max(4, scaledSize * 0.12);
  const indicatorX = screenX + objectWidth - indicatorSize - 2;
  const indicatorY = screenY + objectHeight - indicatorSize - 2;

  ctx.fillStyle = '#4a9eff';
  ctx.beginPath();
  ctx.arc(indicatorX + indicatorSize / 2, indicatorY + indicatorSize / 2, indicatorSize / 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.stroke();
}

/**
 * Renders an object link indicator in the top-left corner.
 * Shows a green circle with chain link emoji for inter-object links.
 */
function renderObjectLinkIndicator(
  ctx: CanvasRenderingContext2D,
  position: BadgePosition,
  config: BadgeConfig
): void {
  const { screenX, screenY } = position;
  const { scaledSize } = config;

  const linkSize = Math.max(6, scaledSize * 0.15);
  const linkX = screenX + 2;
  const linkY = screenY + 2;

  ctx.fillStyle = '#10b981';
  ctx.beginPath();
  ctx.arc(linkX + linkSize / 2, linkY + linkSize / 2, linkSize / 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Draw chain link icon
  const iconSize = linkSize * 0.6;
  ctx.font = `${iconSize}px 'Noto Emoji', 'Noto Sans Symbols 2', monospace`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('\u{1F517}', linkX + linkSize / 2, linkY + linkSize / 2);
}

return {
  renderNoteLinkBadge,
  renderTooltipIndicator,
  renderObjectLinkIndicator
};
