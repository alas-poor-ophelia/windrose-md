/**
 * deepLinkHandler.ts
 *
 * Deep link parsing and generation for Windrose maps.
 * Handles windrose: protocol URLs for navigating to specific map locations.
 */

// ===========================================
// Types
// ===========================================

/** Parsed deep link data */
export interface DeepLinkData {
  notePath: string;
  mapId: string;
  x: number;
  y: number;
  zoom: number;
  layerId: string;
}

/** Navigation event detail (extends DeepLinkData with timestamp) */
export interface NavigationEventDetail extends DeepLinkData {
  timestamp: number;
}

// ===========================================
// Constants
// ===========================================

/** Protocol prefix for Windrose deep links (uses Obsidian's protocol handler) */
const PROTOCOL = 'obsidian://windrose?';

/** Custom event name for map navigation */
const NAVIGATION_EVENT = 'dmt-navigate-to';

// ===========================================
// Functions
// ===========================================

/**
 * Parse a deep link URL into structured data.
 * Format: windrose:notePath|mapId,x,y,zoom,layerId
 * @param url The deep link URL to parse
 * @returns Parsed data or null if invalid
 */
function parseDeepLink(url: string): DeepLinkData | null {
  if (!url || typeof url !== 'string') {
    return null;
  }

  if (!url.startsWith(PROTOCOL)) {
    return null;
  }

  const dataStr = url.slice(PROTOCOL.length);

  // Split notePath from coordinate data (using | as delimiter)
  const pipeIndex = dataStr.indexOf('|');
  if (pipeIndex === -1) {
    return null;
  }

  const notePath = dataStr.slice(0, pipeIndex);
  const coordData = dataStr.slice(pipeIndex + 1);
  const parts = coordData.split(',');

  if (parts.length !== 5) {
    return null;
  }

  const [mapId, xStr, yStr, zoomStr, layerId] = parts;

  // Validate notePath, mapId and layerId are non-empty
  if (!notePath || !mapId || !layerId) {
    return null;
  }

  // Parse numeric values
  const x = parseFloat(xStr);
  const y = parseFloat(yStr);
  const zoom = parseFloat(zoomStr);

  // Validate numeric values
  if (isNaN(x) || isNaN(y) || isNaN(zoom)) {
    return null;
  }

  return {
    notePath,
    mapId,
    x,
    y,
    zoom,
    layerId
  };
}

/**
 * Generate a deep link URL from map location data.
 * Format: windrose:notePath|mapId,x,y,zoom,layerId
 * @param notePath Path to the note containing the map
 * @param mapId The map identifier
 * @param x X coordinate
 * @param y Y coordinate
 * @param zoom Zoom level
 * @param layerId Layer identifier
 * @returns Deep link URL
 */
function generateDeepLink(
  notePath: string,
  mapId: string,
  x: number,
  y: number,
  zoom: number,
  layerId: string
): string {
  // Round coordinates to 2 decimal places for clean URLs
  const roundedX = Math.round(x * 100) / 100;
  const roundedY = Math.round(y * 100) / 100;
  const roundedZoom = Math.round(zoom * 100) / 100;

  return `${PROTOCOL}${notePath}|${mapId},${roundedX},${roundedY},${roundedZoom},${layerId}`;
}

/**
 * Generate a markdown link with display text.
 * @param displayText Text to show for the link
 * @param notePath Path to the note containing the map
 * @param mapId The map identifier
 * @param x X coordinate
 * @param y Y coordinate
 * @param zoom Zoom level
 * @param layerId Layer identifier
 * @returns Markdown link syntax
 */
function generateDeepLinkMarkdown(
  displayText: string,
  notePath: string,
  mapId: string,
  x: number,
  y: number,
  zoom: number,
  layerId: string
): string {
  // Escape brackets in display text (remove them to avoid breaking markdown)
  const escapedText = displayText.replace(/[\[\]]/g, '');
  const url = generateDeepLink(notePath, mapId, x, y, zoom, layerId);
  return `[${escapedText}](${url})`;
}

/**
 * Emit a navigation event for map components to handle.
 * @param data Navigation target data
 */
function emitNavigationEvent(data: DeepLinkData): void {
  const detail: NavigationEventDetail = {
    ...data,
    timestamp: Date.now()
  };

  const event = new CustomEvent(NAVIGATION_EVENT, { detail });
  window.dispatchEvent(event);
}

// ===========================================
// Exports
// ===========================================

return {
  PROTOCOL,
  NAVIGATION_EVENT,
  parseDeepLink,
  generateDeepLink,
  generateDeepLinkMarkdown,
  emitNavigationEvent
};
