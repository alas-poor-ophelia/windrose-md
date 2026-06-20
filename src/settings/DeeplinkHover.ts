import { renderHoverPreview, unmountHoverPreview } from '../components/WindroseHoverPreview';

interface LinkState {
  showTimer: number | null;
  hideTimer: number | null;
  popover: { hide(): void } | null;
  hoverEl: HTMLElement | null;
  host: HTMLElement | null;
}

interface ParsedDeepLink {
  mapId: string;
  x: number;
  y: number;
  zoom: number;
  layerId: string;
  notePath: string;
}

interface HoverPlugin {
  settings: { hoverPreviewScale?: number; [key: string]: unknown };
}

const DeeplinkHover = (() => {
  const HL = '[Windrose:Hover]';
  const SHOW_DELAY_MS = 400;
  const HIDE_GRACE_MS = 300;

  // state: { el: HTMLElement -> { showTimer, hideTimer, popover, hoverEl } }
  const linkState = new WeakMap<HTMLElement, LinkState>();
  let currentLink: HTMLElement | null = null;

  function clearTimers(state: LinkState | undefined): void {
    if (!state) return;
    if (state.showTimer != null) { window.clearTimeout(state.showTimer); state.showTimer = null; }
    if (state.hideTimer != null) { window.clearTimeout(state.hideTimer); state.hideTimer = null; }
  }

  function destroyPopover(state: LinkState | undefined): void {
    if (!state) return;
    if (state.hoverEl && state.host) {
      try { unmountHoverPreview(state.host); } catch (_err: unknown) { /* ignore */ }
    }
    if (state.popover) {
      try { state.popover.hide(); } catch (_err: unknown) { /* ignore */ }
      state.popover = null;
    }
    state.hoverEl = null;
    state.host = null;
  }

  function scheduleHide(linkEl: HTMLElement): void {
    const state = linkState.get(linkEl);
    if (!state) return;
    if (state.hideTimer != null) return;
    state.hideTimer = window.setTimeout(() => {
      state.hideTimer = null;
      destroyPopover(state);
      if (currentLink === linkEl) currentLink = null;
    }, HIDE_GRACE_MS);
  }

  function cancelHide(linkEl: HTMLElement): void {
    const state = linkState.get(linkEl);
    if (state && state.hideTimer != null) {
      window.clearTimeout(state.hideTimer);
      state.hideTimer = null;
    }
  }

  function showPopover(plugin: HoverPlugin, linkEl: HTMLElement, parsed: ParsedDeepLink): void {
    if (currentLink && currentLink !== linkEl) {
      const prev = linkState.get(currentLink);
      clearTimers(prev);
      destroyPopover(prev);
    }
    currentLink = linkEl;

    const state: LinkState = linkState.get(linkEl) || { showTimer: null, hideTimer: null, popover: null, hoverEl: null, host: null };
    linkState.set(linkEl, state);

    // Custom popover div — simpler and more reliable than HoverPopover which
    // requires internal lifecycle we don't have access to.
    const popoverEl = document.body.createDiv({ cls: 'windrose-hover-preview-popover popover' });
    popoverEl.setCssStyles({ position: 'fixed', zIndex: '1000' });

    const rect = linkEl.getBoundingClientRect();
    const viewportW = window.innerWidth || 1200;
    const viewportH = window.innerHeight || 800;
    // Position below the link by default; flip above if it would overflow.
    const previewScale = Math.max(0.5, Math.min(2.0, Number(plugin.settings.hoverPreviewScale) || 1.0));
    const estWidth = Math.round(240 * previewScale) + 20;
    const estHeight = Math.round(180 * previewScale) + 64;
    const left = Math.min(Math.max(8, rect.left), viewportW - estWidth - 8);
    let top = rect.bottom + 8;
    if (top + estHeight > viewportH - 8) {
      top = Math.max(8, rect.top - estHeight - 8);
    }
    popoverEl.style.left = left + 'px';
    popoverEl.style.top = top + 'px';

    state.popover = { hide: () => popoverEl.remove() };
    state.hoverEl = popoverEl;

    const container = popoverEl.createDiv({ cls: 'windrose-hover-preview-host' });
    state.host = container;
    popoverEl.addEventListener('mouseenter', () => cancelHide(linkEl));
    popoverEl.addEventListener('mouseleave', () => scheduleHide(linkEl));

    try {
      renderHoverPreview(container, {
        mapId: parsed.mapId,
        x: Number.isFinite(parsed.x) ? parsed.x : 0,
        y: Number.isFinite(parsed.y) ? parsed.y : 0,
        zoom: Number.isFinite(parsed.zoom) && parsed.zoom > 0 ? parsed.zoom : undefined,
        layerId: parsed.layerId || '',
        notePath: parsed.notePath || ''
      });
    } catch (err: unknown) {
      console.error(HL, 'renderPreview failed', err);
      container.setText('Preview failed to load.');
    }
  }

  function onHoverEnter(plugin: HoverPlugin, linkEl: HTMLElement, parsed: ParsedDeepLink): void {
    if (!linkEl || !parsed) return;

    const state: LinkState = linkState.get(linkEl) || { showTimer: null, hideTimer: null, popover: null, hoverEl: null, host: null };
    linkState.set(linkEl, state);

    cancelHide(linkEl);

    if (state.showTimer != null) return;
    if (state.popover) return;

    state.showTimer = window.setTimeout(() => {
      state.showTimer = null;
      showPopover(plugin, linkEl, parsed);
    }, SHOW_DELAY_MS);
  }

  function onHoverLeave(linkEl: HTMLElement): void {
    if (!linkEl) return;
    const state = linkState.get(linkEl);
    if (!state) return;
    if (state.showTimer != null) {
      window.clearTimeout(state.showTimer);
      state.showTimer = null;
    }
    if (state.popover) scheduleHide(linkEl);
  }

  function attachReadingModeHover(plugin: HoverPlugin, anchor: HTMLElement, parsed: ParsedDeepLink): void {
    anchor.addEventListener('mouseenter', () => onHoverEnter(plugin, anchor, parsed));
    anchor.addEventListener('mouseleave', () => onHoverLeave(anchor));
  }

  // Live Preview: called from CM6 mouseover handler with the resolved windrose href.
  function onLivePreviewPointer(plugin: HoverPlugin, linkEl: HTMLElement, parsed: ParsedDeepLink, kind: string): void {
    if (kind === 'enter') onHoverEnter(plugin, linkEl, parsed);
    else if (kind === 'leave') onHoverLeave(linkEl);
  }

  return {
    attachReadingModeHover,
    onLivePreviewPointer,
    onHoverEnter,
    onHoverLeave
  };
})();

export { DeeplinkHover };
