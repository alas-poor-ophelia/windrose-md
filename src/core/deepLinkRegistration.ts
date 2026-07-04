import { Notice } from 'obsidian';
import type { Plugin } from 'obsidian';
import { parseDeepLink, emitNavigationEvent } from '../persistence/deepLinkHandler';
import type { DeepLinkData } from '../persistence/deepLinkHandler';

async function navigateToLink(plugin: Plugin, parsed: DeepLinkData, sourcePath: string): Promise<void> {
  const currentPath = sourcePath ?? '';
  const isSameNote = parsed.notePath === currentPath || parsed.notePath === currentPath.replace(/\.md$/, '');

  if (!isSameNote) {
    try {
      const linkPath = parsed.notePath.replace(/\.md$/, '');
      await plugin.app.workspace.openLinkText(linkPath, '', false);
    } catch (err) {
      console.error('[Windrose] Deep link: failed to open note', err);
      new Notice('Failed to open map note');
      return;
    }
    await new Promise(resolve => window.setTimeout(resolve, 100));
  }

  emitNavigationEvent(parsed);

  window.setTimeout(() => {
    try {
      const leaf = activeDocument.querySelector('.workspace-leaf.mod-active .view-content');
      if (leaf) {
        const mapEl = leaf.querySelector('.windrose-container');
        if (mapEl) {
          mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    } catch { /* scroll is best-effort */ }
  }, 200);
}

export function registerDeepLinks(plugin: Plugin): void {
  registerProtocolHandler(plugin);
  registerPostProcessor(plugin);
  registerDomCapture(plugin);
  registerEditorExtension(plugin);
}

function registerProtocolHandler(plugin: Plugin): void {
  plugin.registerObsidianProtocolHandler('windrose', async (params) => {
    const rawQuery = Object.keys(params).find(key => key.includes('|'));
    if (rawQuery == null || rawQuery === '') return;

    const parsed = parseDeepLink('windrose:' + rawQuery);
    if (parsed == null) return;

    try {
      const linkPath = parsed.notePath.replace(/\.md$/, '');
      await plugin.app.workspace.openLinkText(linkPath, '', false);
      window.setTimeout(() => emitNavigationEvent(parsed), 100);
    } catch (err) {
      console.error('[Windrose] Protocol handler failed:', err);
      new Notice('Failed to open map note');
    }
  });
}

function registerPostProcessor(plugin: Plugin): void {
  plugin.registerMarkdownPostProcessor((el, _ctx) => {
    const candidates = el.querySelectorAll(
      'a[href^="windrose:"], a[data-href^="windrose:"]'
    );
    if (candidates.length === 0) return;

    candidates.forEach((link) => {
      const rawHref = link.getAttribute('href') ?? '';
      const dataHref = link.getAttribute('data-href') ?? '';
      const original = rawHref.startsWith('windrose:') ? rawHref
        : dataHref.startsWith('windrose:') ? dataHref : '';
      if (original === '') return;

      const replacement = activeWindow.createEl('a');
      replacement.textContent = link.textContent;
      replacement.className = 'windrose-deep-link';
      replacement.setAttribute('href', '#');
      replacement.setAttribute('data-windrose-href', original);
      link.replaceWith(replacement);
    });
  });
}

function registerDomCapture(plugin: Plugin): void {
  plugin.registerDomEvent(activeDocument, 'click', async (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target?.closest == null) return;

    const link = target.closest(
      'a[href^="windrose:"], a[data-href^="windrose:"], a[data-windrose-href]'
    );
    if (link == null) return;

    e.preventDefault();
    e.stopPropagation();

    const href = link.getAttribute('data-windrose-href')
      ?? link.getAttribute('href')
      ?? link.getAttribute('data-href')
      ?? '';

    const parsed = parseDeepLink(href);
    if (parsed == null) return;

    const sourcePath = plugin.app.workspace.getActiveFile()?.path ?? '';
    await navigateToLink(plugin, parsed, sourcePath);
  }, { capture: true } as AddEventListenerOptions);
}

/** The Extension type Obsidian's registerEditorExtension accepts (from @codemirror/state). */
type CMExtension = Parameters<Plugin['registerEditorExtension']>[0];

/** The slice of a CM EditorView instance the click handler reads. */
interface CMEditorViewInstance {
  posAtCoords(coords: { x: number; y: number }): number | null;
  state: { doc: { lineAt(pos: number): { text: string; from: number } } };
}

/** The slice of the @codemirror/view module we consume (provided by Obsidian at runtime). */
interface CMViewModule {
  EditorView: {
    domEventHandlers(
      handlers: Record<string, (event: MouseEvent, view: CMEditorViewInstance) => boolean>
    ): CMExtension;
  };
}

function registerEditorExtension(plugin: Plugin): void {
  try {

    // eslint-disable-next-line @typescript-eslint/no-require-imports, import/no-extraneous-dependencies, no-undef -- @codemirror/view is provided by Obsidian at runtime
    const cmView = require('@codemirror/view') as CMViewModule | undefined;
    if (cmView?.EditorView == null) return;

    const SCHEME = 'windrose:';

    const findWindroseHrefAtPos = (view: { state: { doc: { lineAt(pos: number): { text: string; from: number } } } }, pos: number): string | null => {
      try {
        const line = view.state.doc.lineAt(pos);
        const localPos = pos - line.from;
        const urls: { start: number; end: number; url: string }[] = [];
        let search = 0;

        while (true) {
          const idx = line.text.indexOf(SCHEME, search);
          if (idx === -1) break;
          let end = idx;
          while (end < line.text.length) {
            const ch = line.text[end];
            if (ch === ')' || ch === ' ' || ch === '\t' || ch === '\n') break;
            end++;
          }
          urls.push({ start: idx, end, url: line.text.slice(idx, end) });
          search = end;
        }

        if (urls.length === 0) return null;

        for (const u of urls) {
          const linkStart = Math.max(0, u.start - 200);
          const linkEnd = Math.min(line.text.length, u.end + 5);
          if (localPos >= linkStart && localPos <= linkEnd) return u.url;
        }
        return urls[0].url;
      } catch { return null; }
    };

    const windroseEditorExt = cmView.EditorView.domEventHandlers({
      click(event: MouseEvent, view: CMEditorViewInstance) {
        const target = event.target as HTMLElement;
        if (target?.closest == null) return false;

        const anchor = target.closest('a[href^="windrose:"], a[data-href^="windrose:"], a[data-windrose-href]');
        if (anchor != null) {
          const href = anchor.getAttribute('data-windrose-href')
            ?? anchor.getAttribute('href')
            ?? anchor.getAttribute('data-href')
            ?? '';
          const parsed = parseDeepLink(href);
          if (parsed != null) {
            event.preventDefault();
            event.stopPropagation();
            const sourcePath = plugin.app.workspace.getActiveFile()?.path ?? '';
            void navigateToLink(plugin, parsed, sourcePath);
            return true;
          }
        }

        const linkSpan = target.closest('.cm-link, .cm-underline, .cm-hmd-internal-link');
        if (linkSpan != null) {
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos != null) {
            const href = findWindroseHrefAtPos(view, pos);
            if (href != null && href !== '') {
              const parsed = parseDeepLink(href);
              if (parsed != null) {
                event.preventDefault();
                event.stopPropagation();
                const sourcePath = plugin.app.workspace.getActiveFile()?.path ?? '';
                void navigateToLink(plugin, parsed, sourcePath);
                return true;
              }
            }
          }
        }
        return false;
      }
    });

    plugin.registerEditorExtension([windroseEditorExt]);
  } catch (err) {
    console.warn('[Windrose] Could not register CM6 extension:', err);
  }
}
