// DeeplinkHover.ts
// Hover controller for windrose: deep links. One preview popover at a time,
// shown after a short rest over a link and torn down on pointer leave,
// Escape, a press outside the popover, or plugin unload. The popover lives in
// the link element's own document, so links in popout windows preview there.

import type { DeepLinkData } from '../persistence/deepLinkHandler';
import { renderHoverPreview, unmountHoverPreview, getPreviewDimensions } from '../components/WindroseHoverPreview';

const HL = '[Windrose:Hover]';
const SHOW_DELAY_MS = 400;
const HIDE_GRACE_MS = 300;

interface ActivePopover {
  href: string;
  popoverEl: HTMLElement;
  host: HTMLElement;
  doc: Document;
  onKeyDown: (e: KeyboardEvent) => void;
  onPointerDown: (e: PointerEvent) => void;
}

interface PendingShow {
  href: string;
  timer: number;
}

let pending: PendingShow | null = null;
let active: ActivePopover | null = null;
let hideTimer: number | null = null;

function cancelShow(): void {
  if (pending != null) {
    window.clearTimeout(pending.timer);
    pending = null;
  }
}

function cancelHide(): void {
  if (hideTimer != null) {
    window.clearTimeout(hideTimer);
    hideTimer = null;
  }
}

/** Tear down the visible popover (if any) and every pending timer. */
function hide(): void {
  cancelShow();
  cancelHide();
  if (active == null) return;
  const { popoverEl, host, doc, onKeyDown, onPointerDown } = active;
  active = null;
  doc.removeEventListener('keydown', onKeyDown, true);
  doc.removeEventListener('pointerdown', onPointerDown, true);
  unmountHoverPreview(host);
  popoverEl.remove();
}

function scheduleHide(): void {
  if (hideTimer != null || active == null) return;
  hideTimer = window.setTimeout(() => {
    hideTimer = null;
    hide();
  }, HIDE_GRACE_MS);
}

function show(linkEl: HTMLElement, href: string, parsed: DeepLinkData): void {
  hide();
  if (!linkEl.isConnected) return;

  const doc = linkEl.ownerDocument;
  const win = doc.defaultView ?? window;
  const dims = getPreviewDimensions();

  const popoverEl = doc.body.createDiv({ cls: 'windrose-hover-preview-popover popover' });
  const rect = linkEl.getBoundingClientRect();
  const viewportW = win.innerWidth || 1200;
  const viewportH = win.innerHeight || 800;
  // Below the link by default; flip above when it would overflow.
  const estWidth = dims.width + 20;
  const estHeight = dims.height + 64;
  const left = Math.min(Math.max(8, rect.left), viewportW - estWidth - 8);
  let top = rect.bottom + 8;
  if (top + estHeight > viewportH - 8) top = Math.max(8, rect.top - estHeight - 8);
  popoverEl.setCssStyles({ position: 'fixed', zIndex: 'var(--layer-popover)', left: `${left}px`, top: `${top}px` });

  const host = popoverEl.createDiv({ cls: 'windrose-hover-preview-host' });
  popoverEl.addEventListener('mouseenter', cancelHide);
  popoverEl.addEventListener('mouseleave', scheduleHide);

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') hide();
  };
  const onPointerDown = (e: PointerEvent): void => {
    const target = e.target as Node | null;
    if (target == null || !popoverEl.contains(target)) hide();
  };
  doc.addEventListener('keydown', onKeyDown, true);
  doc.addEventListener('pointerdown', onPointerDown, true);

  active = { href, popoverEl, host, doc, onKeyDown, onPointerDown };

  try {
    renderHoverPreview(host, {
      mapId: parsed.mapId,
      x: Number.isFinite(parsed.x) ? parsed.x : 0,
      y: Number.isFinite(parsed.y) ? parsed.y : 0,
      zoom: parsed.zoom,
      layerId: parsed.layerId || '',
      subHexPath: parsed.subHexPath,
      notePath: parsed.notePath || ''
    });
  } catch (err: unknown) {
    console.error(HL, 'renderPreview failed', err);
    host.setText('Preview failed to load.');
  }
}

/**
 * Pointer came to rest over a deep link. `href` identifies the link across
 * the child spans CodeMirror renders, so moving between them does not flicker.
 */
function onEnter(linkEl: HTMLElement, href: string, parsed: DeepLinkData): void {
  if (active?.href === href) {
    cancelHide();
    return;
  }
  if (pending?.href === href) return;
  cancelShow();
  pending = {
    href,
    timer: window.setTimeout(() => {
      pending = null;
      show(linkEl, href, parsed);
    }, SHOW_DELAY_MS),
  };
}

/** Pointer left a deep link. */
function onLeave(): void {
  cancelShow();
  scheduleHide();
}

export const DeeplinkHover = { onEnter, onLeave, hide };
