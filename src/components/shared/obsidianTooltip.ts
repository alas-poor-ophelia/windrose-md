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
 * Ref callback attaching an Obsidian-managed tooltip to the element.
 *
 * Usage: `<button ref={tooltipRef('Undo')} title="Undo">`. Returns a new
 * closure each render, so Preact re-invokes it and the tooltip text stays
 * current when it changes (e.g. sub-tool swaps).
 */
function tooltipRef(text: string, options?: TooltipOptions): TooltipRefCallback {
  return (el) => {
    if (el != null) setTooltip(el, text, options);
  };
}

export { tooltipRef };
export type { TooltipRefCallback };
