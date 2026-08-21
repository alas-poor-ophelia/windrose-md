import { Notice } from 'obsidian';

export interface DeepLinkData {
  notePath: string;
  mapId: string;
  x: number;
  y: number;
  zoom: number;
  layerId: string;
  /**
   * Optional sub-hex drill path ('/'-joined "q,r" axial hexKeys, e.g.
   * "0,0/2,-1"). Present only for links copied from inside a sub-hex; when
   * set, navigation drills into this path before applying x/y/zoom/layer.
   * Absent for root-level (legacy) links.
   */
  subHexPath?: string;
}

export interface NavigationEventDetail extends DeepLinkData {
  timestamp: number;
  /**
   * Mutable claim flag: with the same map embedded in several blocks, every
   * mount's listener passes the mapId gate — the first to act sets this so
   * the rest skip, instead of every block drilling/navigating in parallel.
   */
  handled?: boolean;
}

const PROTOCOL = 'windrose:';
const LEGACY_PROTOCOL = 'obsidian://windrose?';
const NAVIGATION_EVENT = 'windrose-navigate-to';

// Deep-link grammar:
//   windrose:<notePath>|<mapId>,<x>,<y>,<zoom>,<layerId>[|<subHexPath>]
// - <notePath>: percent-encoded pipe (%7C) and comma (%2C).
// - core block: exactly 5 comma-separated fields.
// - <subHexPath> (OPTIONAL): '/'-joined "q,r" axial hexKeys ("0,0/2,-1").
//   Split off by the SECOND '|' before the core block is comma-parsed, so its
//   literal commas are safe and legacy (no sub-hex) links stay byte-identical.
//   Example: windrose:World.md|world-map,3.5,4,1.18,layer_001|0,0/2,-1

function decodePathComponent(raw: string): string {
  return raw.replace(/%7C/gi, '|').replace(/%2C/gi, ',');
}

function parseDeepLinkData(rawDataStr: string): DeepLinkData | null {
  const pipeIndex = rawDataStr.indexOf('|');
  if (pipeIndex === -1) return null;

  const notePath = decodePathComponent(rawDataStr.slice(0, pipeIndex));
  const afterNote = rawDataStr.slice(pipeIndex + 1);

  // Split off an optional trailing '|<subHexPath>' BEFORE comma-parsing the
  // core block, so legacy links (no sub-hex) parse exactly as before.
  const subHexPipeIndex = afterNote.indexOf('|');
  const coordData = subHexPipeIndex === -1 ? afterNote : afterNote.slice(0, subHexPipeIndex);
  const subHexPathRaw = subHexPipeIndex === -1 ? '' : afterNote.slice(subHexPipeIndex + 1);

  const parts = coordData.split(',');

  if (parts.length !== 5) return null;

  const [mapId, xStr, yStr, zoomStr, layerId] = parts;
  if (!notePath || !mapId || !layerId) return null;

  const x = parseFloat(xStr);
  const y = parseFloat(yStr);
  const zoom = parseFloat(zoomStr);

  if (isNaN(x) || isNaN(y) || isNaN(zoom)) return null;

  const data: DeepLinkData = { notePath, mapId, x, y, zoom, layerId };
  if (subHexPathRaw !== '') data.subHexPath = subHexPathRaw;
  return data;
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
  layerId: string,
  subHexPath?: string | null
): string {
  // Round to 2 decimal places for clean URLs
  const roundedX = Math.round(x * 100) / 100;
  const roundedY = Math.round(y * 100) / 100;
  const roundedZoom = Math.round(zoom * 100) / 100;

  const encodedPath = notePath.replace(/\|/g, '%7C').replace(/,/g, '%2C');
  const base = `${PROTOCOL}${encodedPath}|${mapId},${roundedX},${roundedY},${roundedZoom},${layerId}`;
  // Append the sub-hex segment only when present — keeps root links byte-identical.
  return (subHexPath != null && subHexPath !== '') ? `${base}|${subHexPath}` : base;
}

function generateDeepLinkMarkdown(
  displayText: string,
  notePath: string,
  mapId: string,
  x: number,
  y: number,
  zoom: number,
  layerId: string,
  subHexPath?: string | null
): string {
  const escapedText = displayText.replace(/[[\]()]/g, '');
  const url = generateDeepLink(notePath, mapId, x, y, zoom, layerId, subHexPath);
  return `[${escapedText}](${url})`;
}

function copyDeepLinkToClipboard(
  displayText: string,
  notePath: string,
  mapId: string,
  x: number,
  y: number,
  zoom: number,
  layerId: string,
  subHexPath?: string | null
): void {
  const markdown = generateDeepLinkMarkdown(displayText, notePath, mapId, x, y, zoom, layerId, subHexPath);

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