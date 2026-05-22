return `// settingsPlugin-DeeplinkHover.js
// Hover preview lifecycle manager for windrose: deep links.
// Attaches mouseenter/mouseleave to deep-link anchors, shows a HoverPopover
// containing a Datacore-rendered map preview via window.datacore.executeJsx.
// This file is concatenated into the settings plugin template by the assembler.

const DeeplinkHover = (() => {
  const HL = '[Windrose:Hover]';
  const SHOW_DELAY_MS = 400;
  const HIDE_GRACE_MS = 300;

  // state: { el: HTMLElement -> { showTimer, hideTimer, popover, hoverEl } }
  const linkState = new WeakMap();
  let currentLink = null;

  function clearTimers(state) {
    if (!state) return;
    if (state.showTimer) { clearTimeout(state.showTimer); state.showTimer = null; }
    if (state.hideTimer) { clearTimeout(state.hideTimer); state.hideTimer = null; }
  }

  function destroyPopover(state) {
    if (!state) return;
    if (state.hoverEl && window.__windrose && typeof window.__windrose.unmountPreview === 'function') {
      try { window.__windrose.unmountPreview(state.host); } catch (err) { /* ignore */ }
    }
    if (state.popover) {
      try { state.popover.hide(); } catch (err) { /* ignore */ }
      state.popover = null;
    }
    state.hoverEl = null;
    state.host = null;
  }

  function scheduleHide(linkEl) {
    const state = linkState.get(linkEl);
    if (!state) return;
    if (state.hideTimer) return;
    state.hideTimer = window.setTimeout(() => {
      state.hideTimer = null;
      destroyPopover(state);
      if (currentLink === linkEl) currentLink = null;
    }, HIDE_GRACE_MS);
  }

  function cancelHide(linkEl) {
    const state = linkState.get(linkEl);
    if (state && state.hideTimer) {
      clearTimeout(state.hideTimer);
      state.hideTimer = null;
    }
  }

  function showPopover(plugin, linkEl, parsed) {
    if (currentLink && currentLink !== linkEl) {
      const prev = linkState.get(currentLink);
      clearTimers(prev);
      destroyPopover(prev);
    }
    currentLink = linkEl;

    const state = linkState.get(linkEl) || {};
    linkState.set(linkEl, state);

    // Custom popover div — simpler and more reliable than HoverPopover which
    // requires internal lifecycle we don't have access to.
    const popoverEl = document.body.createDiv({ cls: 'windrose-hover-preview-popover popover' });
    popoverEl.style.position = 'fixed';
    popoverEl.style.zIndex = '1000';

    const rect = linkEl.getBoundingClientRect();
    const viewportW = window.innerWidth || 1200;
    const viewportH = window.innerHeight || 800;
    // Position below the link by default; flip above if it would overflow.
    const previewScale = Math.max(0.5, Math.min(2.0, Number(plugin.settings.hoverPreviewScale) || 1.0));
    const estWidth = Math.round(240 * previewScale) + 20;
    const estHeight = Math.round(180 * previewScale) + 64;
    let left = Math.min(Math.max(8, rect.left), viewportW - estWidth - 8);
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

    const render = window.__windrose && window.__windrose.renderPreview;
    if (typeof render !== 'function') {
      container.setText('Preview unavailable — open a map in this note.');
      return;
    }

    try {
      render(container, {
        mapId: parsed.mapId,
        x: Number.isFinite(parsed.x) ? parsed.x : 0,
        y: Number.isFinite(parsed.y) ? parsed.y : 0,
        zoom: Number.isFinite(parsed.zoom) && parsed.zoom > 0 ? parsed.zoom : undefined,
        layerId: parsed.layerId || '',
        notePath: parsed.notePath || ''
      });
    } catch (err) {
      console.error(HL, 'renderPreview failed', err);
      container.setText('Preview failed to load.');
    }
  }

  function onHoverEnter(plugin, linkEl, parsed) {
    if (!linkEl || !parsed) return;

    const state = linkState.get(linkEl) || {};
    linkState.set(linkEl, state);

    cancelHide(linkEl);

    if (state.showTimer) return;
    if (state.popover) return;

    state.showTimer = window.setTimeout(() => {
      state.showTimer = null;
      showPopover(plugin, linkEl, parsed);
    }, SHOW_DELAY_MS);
  }

  function onHoverLeave(linkEl) {
    if (!linkEl) return;
    const state = linkState.get(linkEl);
    if (!state) return;
    if (state.showTimer) {
      clearTimeout(state.showTimer);
      state.showTimer = null;
    }
    if (state.popover) scheduleHide(linkEl);
  }

  function attachReadingModeHover(plugin, anchor, parsed) {
    anchor.addEventListener('mouseenter', () => onHoverEnter(plugin, anchor, parsed));
    anchor.addEventListener('mouseleave', () => onHoverLeave(anchor));
  }

  // Live Preview: called from CM6 mouseover handler with the resolved windrose href.
  function onLivePreviewPointer(plugin, linkEl, parsed, kind) {
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
`;
