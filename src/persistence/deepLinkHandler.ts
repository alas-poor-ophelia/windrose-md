import { Notice } from 'obsidian';

export interface DeepLinkData {
  notePath: string;
  mapId: string;
  x: number;
  y: number;
  zoom: number;
  layerId: string;
}

export interface NavigationEventDetail extends DeepLinkData {
  timestamp: number;
}

const PROTOCOL = 'windrose:';
const LEGACY_PROTOCOL = 'obsidian://windrose?';
const NAVIGATION_EVENT = 'windrose-navigate-to';

function decodePathComponent(raw: string): string {
  return raw.replace(/%7C/gi, '|').replace(/%2C/gi, ',');
}

function parseDeepLinkData(rawDataStr: string): DeepLinkData | null {
  const pipeIndex = rawDataStr.indexOf('|');
  if (pipeIndex === -1) return null;

  const notePath = decodePathComponent(rawDataStr.slice(0, pipeIndex));
  const coordData = rawDataStr.slice(pipeIndex + 1);
  const parts = coordData.split(',');

  if (parts.length !== 5) return null;

  const [mapId, xStr, yStr, zoomStr, layerId] = parts;
  if (!notePath || !mapId || !layerId) return null;

  const x = parseFloat(xStr);
  const y = parseFloat(yStr);
  const zoom = parseFloat(zoomStr);

  if (isNaN(x) || isNaN(y) || isNaN(zoom)) return null;

  return { notePath, mapId, x, y, zoom, layerId };
}

function parseDeepLink(url: string): DeepLinkData | null {
  if (!url || typeof url !== 'string') return null;

  if (url.startsWith(PROTOCOL)) {
    return parseDeepLinkData(url.slice(PROTOCOL.length));
  }
  if (url.startsWith(LEGACY_PROTOCOL)) {
    return parseDeepLinkData(url.slice(LEGACY_PROTOCOL.length));
  }
  return null;
}

function generateDeepLink(
  notePath: string,
  mapId: string,
  x: number,
  y: number,
  zoom: number,
  layerId: string
): string {
  // Round to 2 decimal places for clean URLs
  const roundedX = Math.round(x * 100) / 100;
  const roundedY = Math.round(y * 100) / 100;
  const roundedZoom = Math.round(zoom * 100) / 100;

  const encodedPath = notePath.replace(/\|/g, '%7C').replace(/,/g, '%2C');
  return `${PROTOCOL}${encodedPath}|${mapId},${roundedX},${roundedY},${roundedZoom},${layerId}`;
}

function generateDeepLinkMarkdown(
  displayText: string,
  notePath: string,
  mapId: string,
  x: number,
  y: number,
  zoom: number,
  layerId: string
): string {
  const escapedText = displayText.replace(/[[\]()]/g, '');
  const url = generateDeepLink(notePath, mapId, x, y, zoom, layerId);
  return `[${escapedText}](${url})`;
}

function copyDeepLinkToClipboard(
  displayText: string,
  notePath: string,
  mapId: string,
  x: number,
  y: number,
  zoom: number,
  layerId: string
): void {
  const markdown = generateDeepLinkMarkdown(displayText, notePath, mapId, x, y, zoom, layerId);

  navigator.clipboard.writeText(markdown).then(() => {
    new Notice('Deep link copied to clipboard');
  }).catch((err: Error) => {
    console.error('Failed to copy link:', err);
    new Notice('Failed to copy link');
  });
}

let _pendingNavigate: NavigationEventDetail | null = null;

function emitNavigationEvent(data: DeepLinkData): void {
  const detail: NavigationEventDetail = {
    ...data,
    timestamp: Date.now()
  };

  _pendingNavigate = detail;
  const event = new CustomEvent(NAVIGATION_EVENT, { detail });
  window.dispatchEvent(event);
}

function consumePendingNavigate(mapId: string): NavigationEventDetail | null {
  if (_pendingNavigate && _pendingNavigate.mapId === mapId) {
    const data = _pendingNavigate;
    _pendingNavigate = null;
    return data;
  }
  return null;
}

export {
  PROTOCOL, LEGACY_PROTOCOL, NAVIGATION_EVENT,
  parseDeepLink, generateDeepLink, generateDeepLinkMarkdown,
  copyDeepLinkToClipboard, emitNavigationEvent, consumePendingNavigate
};