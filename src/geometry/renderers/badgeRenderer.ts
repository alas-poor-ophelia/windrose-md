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

/** Note-link badge: max share of the object's short side, size relative to scaledSize, floor, glyph share. */
const NOTE_BADGE_MAX_OBJECT_RATIO = 0.3;
const NOTE_BADGE_SIZE_RATIO = 0.25;
const NOTE_BADGE_MIN_PX = 8;
const NOTE_BADGE_GLYPH_RATIO = 0.7;

/** Tooltip indicator dot: size relative to scaledSize and its pixel floor. */
const TOOLTIP_DOT_SIZE_RATIO = 0.12;
const TOOLTIP_DOT_MIN_PX = 4;

/** Object-link badge: size relative to scaledSize, pixel floor, glyph share of the badge. */
const LINK_BADGE_SIZE_RATIO = 0.15;
const LINK_BADGE_MIN_PX = 6;
const LINK_BADGE_GLYPH_RATIO = 0.6;


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

  const maxBadgeSize = Math.min(objectWidth, objectHeight) * NOTE_BADGE_MAX_OBJECT_RATIO;
  const badgeSize = Math.min(maxBadgeSize, Math.max(NOTE_BADGE_MIN_PX, scaledSize * NOTE_BADGE_SIZE_RATIO));
  const badgeX = screenX + objectWidth - badgeSize - 3;
  const badgeY = screenY + 3;

  ctx.fillStyle = 'rgba(74, 158, 255, 0.9)';
  ctx.beginPath();
  ctx.arc(badgeX + badgeSize / 2, badgeY + badgeSize / 2, badgeSize / 2, 0, Math.PI * 2);
  ctx.fill();

  const badgeFontSize = badgeSize * NOTE_BADGE_GLYPH_RATIO;
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

  const indicatorSize = Math.max(TOOLTIP_DOT_MIN_PX, scaledSize * TOOLTIP_DOT_SIZE_RATIO);
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

  const linkSize = Math.max(LINK_BADGE_MIN_PX, scaledSize * LINK_BADGE_SIZE_RATIO);
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
  const iconSize = linkSize * LINK_BADGE_GLYPH_RATIO;
  ctx.font = `${iconSize}px 'Noto Emoji', 'Noto Sans Symbols 2', monospace`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('\u{1F517}', linkX + linkSize / 2, linkY + linkSize / 2);
}

export { renderNoteLinkBadge, renderTooltipIndicator, renderObjectLinkIndicator };