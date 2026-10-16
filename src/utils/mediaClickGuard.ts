/**
 * mediaClickGuard.ts
 *
 * Obsidian's reading view delegates `img, video` clicks on
 * `.markdown-preview-sizer` to its full-screen image viewer (and its own image
 * context menu). A map embedded in reading view lives inside that sizer, so a
 * click on an image object or tile thumbnail would open the viewer. This guard
 * stops those two events at the map container (bubble phase, after the map's
 * own handlers) before they reach the sizer.
 *
 * The sizer test runs per event, not at install: a code block is rendered
 * before Obsidian inserts it into the sizer, so an install-time `closest()`
 * would miss reading view. Outside the sizer (full-pane view, live preview,
 * popouts) the events pass through untouched.
 */

const MEDIA_TAGS = new Set(['IMG', 'VIDEO']);
const READING_VIEW_SIZER = '.markdown-preview-sizer';

/** Stop media click/contextmenu bubbling out of `el` while `el` sits in reading view. Returns the cleanup. */
function installMediaClickGuard(el: HTMLElement): () => void {
  const stop = (e: Event): void => {
    // Tag test, not instanceof: a popout window has its own HTMLImageElement.
    const target = e.target as { tagName?: unknown } | null;
    if (target === null || typeof target.tagName !== 'string' || !MEDIA_TAGS.has(target.tagName)) return;
    if (el.closest(READING_VIEW_SIZER) === null) return;
    e.stopPropagation();
  };
  el.addEventListener('click', stop);
  el.addEventListener('contextmenu', stop);
  return () => {
    el.removeEventListener('click', stop);
    el.removeEventListener('contextmenu', stop);
  };
}

export { installMediaClickGuard };
