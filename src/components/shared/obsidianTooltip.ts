/**
 * obsidianTooltip.ts
 *
 * Hover tooltips via Obsidian's setTooltip() API.
 *
 * Native `title`-attribute tooltips render through Electron/Chromium and are
 * unreliable — and when they DO fire alongside setTooltip they double up.
 * Obsidian's own chrome uses its JS-driven tooltip manager, exposed to plugins
 * as setTooltip(). Do NOT also set a `title` attribute on the element; E2E
 * selectors should target the `aria-label` setTooltip applies instead.
 */

import type { TooltipOptions } from 'obsidian';
import { setTooltip } from 'obsidian';

type TooltipRefCallback = (el: HTMLElement | null) => void;

/**
 * aria-label text setTooltip last wrote per element, so a re-invocation can
 * tell "our own previous tooltip text" apart from a JSX-authored label.
 */
const lastAppliedTooltip = new WeakMap<HTMLElement, string>();

/**
 * Ref callback attaching an Obsidian-managed tooltip to the element.
 *
 * Usage: `<button ref={tooltipRef('Undo')}>`. Returns a new closure each
 * render, so Preact re-invokes it and the tooltip text stays current when
 * it changes (e.g. sub-tool swaps).
 *
 * setTooltip() writes the tooltip text into aria-label. When JSX authored
 * an explicit aria-label (accessibility name distinct from the tooltip,
 * e.g. "Remove last waypoint" vs "Remove last waypoint (Backspace)"), the
 * authored label wins — refs run after props, so it is restored here. A
 * label matching what setTooltip itself wrote last time is NOT authored;
 * it must follow the new tooltip text (e.g. tool group identity swaps).
 *
 * Composing with an anchor RefObject (popup positioning): because these
 * closures change identity every render, Preact re-invokes the composed
 * ref with null mid-commit on EVERY render — guard the anchor assignment
 * with `if (el != null)` or portalled popups lose their anchor rect and
 * render off-viewport.
 */
function tooltipRef(text: string, options?: TooltipOptions): TooltipRefCallback {
  return (el) => {
    if (el == null) return;
    const currentLabel = el.getAttribute('aria-label');
    const isAuthored = currentLabel != null && currentLabel !== ''
      && currentLabel !== text && currentLabel !== lastAppliedTooltip.get(el);
    setTooltip(el, text, options);
    lastAppliedTooltip.set(el, text);
    if (isAuthored && currentLabel != null) {
      el.setAttribute('aria-label', currentLabel);
    }
  };
}

export { tooltipRef };
export type { TooltipRefCallback };
