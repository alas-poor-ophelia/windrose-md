// settingsPluginMain.js - Template for Windrose MapDesigner Settings Plugin
// Returns the plugin source as a string for templating by SettingsPluginInstaller
// This wrapper allows the file to be dc.require()'d without Datacore trying to execute it as a standard script

return `// settingsPluginMain.js - Windrose MapDesigner Settings Plugin
// This file is generated from a template by SettingsPluginInstaller
// Default values are injected at install time from dmtConstants and objectTypes

/**
 * ============================================================================
 * TABLE OF CONTENTS
 * ============================================================================
 * 
 * Line ~30:    VERSION & IMPORTS
 * Line ~35:    DATA CONSTANTS (BUILT_IN_OBJECTS, CATEGORIES, QUICK_SYMBOLS)
 * Line ~67:    BUILT_IN_COLORS (color palette defaults)
 * Line ~76:    HELPER_NAMESPACES - Injected at assembly time
 * Line ~83:    MODAL_CLASSES - Injected at assembly time
 * Line ~85:    MAIN PLUGIN CLASS (WindroseMDSettingsPlugin)
 * Line ~450:   SETTINGS TAB CLASS (WindroseMDSettingsTab)
 *              - TAB_RENDER_METHODS - Injected at assembly time
 * 
 * ============================================================================
 */

// =============================================================================
// VERSION & IMPORTS
// =============================================================================

const PLUGIN_VERSION = '{{PLUGIN_VERSION}}';

const obsidianModule = require('obsidian');
const { Plugin, PluginSettingTab, Setting, Modal, setIcon, AbstractInputSuggest } = obsidianModule;

// Initialize bridge for Datacore components
window.__windrose = window.__windrose || {};
window.__windrose.obsidian = obsidianModule;
window.__windrose.version = PLUGIN_VERSION;
window.__windrose.ready = true;
window.dispatchEvent(new CustomEvent('windrose:bridge-ready'));

// =============================================================================
// DATA CONSTANTS
// Injected from objectTypes.ts at install time - single source of truth
// =============================================================================

const BUILT_IN_OBJECTS = {{BUILT_IN_OBJECTS}};

const BUILT_IN_CATEGORIES = {{BUILT_IN_CATEGORIES}};

const CATEGORY_ORDER = {{CATEGORY_ORDER}};

// RPGAwesome icon data - injected from rpgAwesomeIcons.ts at install time
const RA_ICONS = {{RA_ICONS}};

const RA_CATEGORIES = {{RA_CATEGORIES}};

// Quick symbols palette - injected at install time
const QUICK_SYMBOLS = {{QUICK_SYMBOLS}};

// =============================================================================
// BUILT-IN COLOR PALETTE
// Default colors for drawing and objects
// =============================================================================

const BUILT_IN_COLORS = [
  { id: 'default', color: '#c4a57b', label: 'Default (Tan)' },
  { id: 'stone', color: '#808080', label: 'Stone Gray' },
  { id: 'dark-stone', color: '#505050', label: 'Dark Gray' },
  { id: 'water', color: '#4a9eff', label: 'Water Blue' },
  { id: 'forest', color: '#4ade80', label: 'Forest Green' },
  { id: 'danger', color: '#ef4444', label: 'Danger Red' },
  { id: 'sand', color: '#fbbf24', label: 'Sand Yellow' },
  { id: 'magic', color: '#a855f7', label: 'Magic Purple' },
  { id: 'fire', color: '#fb923c', label: 'Fire Orange' },
  { id: 'ice', color: '#14b8a6', label: 'Ice Teal' }
];


// =============================================================================
// HELPER NAMESPACES
// Injected at assembly time from settingsPlugin-*Helpers.js files
// =============================================================================

{{HELPER_NAMESPACES}}

// =============================================================================
// MODAL CLASSES
// Injected at assembly time from settingsPlugin-*Modal.js files
// =============================================================================

{{MODAL_CLASSES}}

class WindroseMDSettingsPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new WindroseMDSettingsTab(this.app, this));

    // Auto-load object sets from configured folder (deferred until vault is indexed)
    this.app.workspace.onLayoutReady(async () => {
      if (this.settings.objectSetsAutoLoadFolder) {
        try {
          const added = await ObjectSetHelpers.scanAutoLoadFolder(this);
          if (added > 0) await this.saveSettings();
        } catch (e) {
          console.warn('[Windrose] Auto-load scan failed:', e.message);
        }
      }
    });

    // Watch auto-load folder for changes (debounced re-scan)
    this._autoLoadScanTimer = null;
    const debouncedScan = () => {
      const folder = this.settings.objectSetsAutoLoadFolder;
      if (!folder) return;
      if (this._autoLoadScanTimer) clearTimeout(this._autoLoadScanTimer);
      this._autoLoadScanTimer = setTimeout(async () => {
        try {
          const added = await ObjectSetHelpers.scanAutoLoadFolder(this);
          if (added > 0) {
            await this.saveSettings();
            console.log('[Windrose] Auto-load: found', added, 'new set(s)');
          }
        } catch (e) {
          // Silently ignore - folder may have been removed
        }
      }, 2000);
    };

    const isInAutoLoadFolder = (file) => {
      const folder = this.settings.objectSetsAutoLoadFolder;
      return folder && file && file.path && file.path.startsWith(folder + '/');
    };

    this.registerEvent(this.app.vault.on('create', (file) => {
      if (isInAutoLoadFolder(file)) debouncedScan();
    }));
    this.registerEvent(this.app.vault.on('delete', (file) => {
      if (isInAutoLoadFolder(file)) debouncedScan();
    }));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      const folder = this.settings.objectSetsAutoLoadFolder;
      if (folder && ((file.path && file.path.startsWith(folder + '/')) || (oldPath && oldPath.startsWith(folder + '/')))) {
        debouncedScan();
      }
    }));
    this.registerEvent(this.app.vault.on('modify', (file) => {
      if (isInAutoLoadFolder(file) && file.path && file.path.endsWith('/objects.json')) {
        debouncedScan();
      }
    }));

    // Register windrose-map code block processor
    // Parses YAML config (id, name, type) and delegates rendering to Datacore
    this.registerMarkdownCodeBlockProcessor('windrose-map', (source, el, ctx) => {
      // Parse simple YAML key: value pairs
      const config = {};
      for (const line of source.split('\\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx === -1) continue;
        const key = trimmed.slice(0, colonIdx).trim();
        const value = trimmed.slice(colonIdx + 1).trim();
        config[key] = value;
      }

      const mapId = config.id || '';
      const mapName = config.name || 'Unnamed Map';
      const mapType = config.type || 'grid';

      if (!mapId) {
        el.createEl('div', {
          text: 'Windrose: Missing required "id" field in windrose-map block.',
          cls: 'windrose-error'
        });
        return;
      }

      // Check if Datacore is available
      if (!window.datacore) {
        el.createEl('div', {
          text: 'Windrose: Waiting for Datacore to load...',
          cls: 'windrose-loading'
        });
        // Retry when Datacore becomes available
        const onReady = () => {
          el.empty();
          this._renderWindroseBlock(mapId, mapName, mapType, el, ctx);
        };
        window.addEventListener('datacore:index-ready', onReady, { once: true });
        // Also register cleanup
        this.register(() => window.removeEventListener('datacore:index-ready', onReady));
        return;
      }

      this._renderWindroseBlock(mapId, mapName, mapType, el, ctx);
    });

    // Register command to insert a new map
    this.addCommand({
      id: 'insert-new-map',
      name: 'Insert new map',
      editorCallback: (editor, view) => {
        new InsertMapModal(this.app, (mapName, mapType) => {
          const mapId = 'map-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

          const codeBlock = [
            '\`\`\`windrose-map',
            \`id: \${mapId}\`,
            \`name: \${mapName}\`,
            \`type: \${mapType}\`,
            '\`\`\`'
          ].join('\\n');

          editor.replaceSelection(codeBlock);
        }).open();
      }
    });
    
    // Post-processor + document-capture fallback for windrose: deep links.
    // DIAGNOSTIC BUILD: heavy logging at each decision point to trace behavior.
    const W = '[Windrose:DL]';
    const parseWindroseHref = (href) => {
      if (!href || !href.startsWith('windrose:')) {
        console.warn(W, 'parse: not a windrose: href', { href });
        return null;
      }
      let dataStr = href.slice('windrose:'.length);
      try {
        dataStr = decodeURIComponent(dataStr);
      } catch (err) {
        console.warn(W, 'parse: decodeURIComponent failed, using raw', err);
      }
      const pipeIndex = dataStr.indexOf('|');
      if (pipeIndex === -1) {
        console.warn(W, 'parse: no pipe separator', { dataStr });
        return null;
      }
      const notePath = dataStr.slice(0, pipeIndex);
      const parts = dataStr.slice(pipeIndex + 1).split(',');
      if (parts.length !== 5) {
        console.warn(W, 'parse: wrong part count', { parts });
        return null;
      }
      const [mapId, x, y, zoom, layerId] = parts;
      const result = { notePath, mapId, x: parseFloat(x), y: parseFloat(y), zoom: parseFloat(zoom), layerId };
      return result;
    };

    const navigateToWindroseLink = async (parsed, sourcePath) => {
      const { notePath, mapId, x, y, zoom, layerId } = parsed;
      const currentPath = sourcePath || '';
      const isSameNote = notePath === currentPath || notePath === currentPath.replace(/\.md$/, '');
      if (!isSameNote) {
        try {
          const linkPath = notePath.replace(/\.md$/, '');
          await this.app.workspace.openLinkText(linkPath, '', false);
        } catch (err) {
          console.error(W, 'navigate: openLinkText FAILED', err);
          new Notice('Failed to open map note');
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const detail = { mapId, x, y, zoom, layerId, timestamp: Date.now() };
      window.__windrose = window.__windrose || {};
      window.__windrose.pendingNavigate = { ...detail, consumed: false };
      window.dispatchEvent(new CustomEvent('dmt-navigate-to', { detail }));

      // Scroll the note viewport to the map codeblock (may not be visible if below fold)
      setTimeout(() => {
        try {
          const leaf = document.querySelector('.workspace-leaf.mod-active .view-content');
          if (leaf) {
            const mapEl = leaf.querySelector('.dmt-container');
            if (mapEl) {
              mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }
        } catch (err) {
          console.warn(W, 'navigate: scroll failed', err);
        }
      }, 200);
    };

    this.registerMarkdownPostProcessor((el, ctx) => {
      const candidates = el.querySelectorAll(
        'a[href^="windrose:"], a[data-href^="windrose:"]'
      );
      if (candidates.length === 0) return;

      candidates.forEach((link, idx) => {
        const rawHref = link.getAttribute('href') || '';
        const dataHref = link.getAttribute('data-href') || '';
        const original = rawHref.startsWith('windrose:') ? rawHref
                       : dataHref.startsWith('windrose:') ? dataHref : '';
        if (!original) {
          console.warn(W, 'post-processor: no windrose: value to store');
          return;
        }

        const replacement = document.createElement('a');
        replacement.textContent = link.textContent;
        replacement.className = 'windrose-deep-link';
        replacement.setAttribute('href', '#');
        replacement.setAttribute('data-windrose-href', original);
        replacement.style.cursor = 'pointer';
        link.replaceWith(replacement);

        const parsed = parseWindroseHref(original);
        if (parsed && typeof DeeplinkHover !== 'undefined') {
          DeeplinkHover.attachReadingModeHover(this, replacement, parsed);
        }
      });
    });

    // Defense in depth: document-level capture handler for Live Preview or dynamic content.
    this.registerDomEvent(document, 'click', async (e) => {
      const target = e.target;
      if (!(target && target.closest)) return;
      const link = target.closest('a[href^="windrose:"], a[data-href^="windrose:"], a[data-windrose-href]');
      if (!link) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      const href = link.getAttribute('data-windrose-href')
        || link.getAttribute('href')
        || link.getAttribute('data-href')
        || '';
      const parsed = parseWindroseHref(href);
      if (!parsed) return;
      const sourcePath = this.app.workspace.getActiveFile()?.path || '';
      try {
        await navigateToWindroseLink(parsed, sourcePath);
      } catch (err) {
        console.error(W, 'doc-capture: navigate threw', err);
      }
    }, { capture: true });

    // Legacy: Obsidian protocol handler for old obsidian://windrose? links
    this.registerObsidianProtocolHandler('windrose', async (params) => {
      // The data comes as URL search params - we need to parse the raw query
      // params.action = 'windrose', and the rest is in the query string
      const rawQuery = Object.keys(params).find(key => key.includes('|'));
      if (!rawQuery) {
        console.error('[Windrose] Invalid deep link format');
        return;
      }

      const pipeIndex = rawQuery.indexOf('|');
      if (pipeIndex === -1) {
        console.error('[Windrose] Missing pipe separator in deep link');
        return;
      }

      const notePath = rawQuery.slice(0, pipeIndex);
      const coordData = rawQuery.slice(pipeIndex + 1);
      const parts = coordData.split(',');

      if (parts.length !== 5) {
        console.error('[Windrose] Invalid coordinate data in deep link');
        return;
      }

      const [mapId, x, y, zoom, layerId] = parts;

      try {
        // Remove .md extension if present for openLinkText
        const linkPath = notePath.replace(/\\.md$/, '');
        await this.app.workspace.openLinkText(linkPath, '', false);

        // Small delay to let the note render before navigating
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('dmt-navigate-to', {
            detail: {
              mapId,
              x: parseFloat(x),
              y: parseFloat(y),
              zoom: parseFloat(zoom),
              layerId,
              timestamp: Date.now()
            }
          }));
        }, 100);
      } catch (err) {
        console.error('[Windrose] Failed to open note:', err);
        new Notice('Failed to open map note');
      }
    });

    // CodeMirror 6 editor extension: catches clicks on windrose: links in Live Preview.
    // Post-processor does not run in Live Preview, so this is our only hook there.
    try {
      const cmView = require('@codemirror/view');
      if (cmView && cmView.EditorView) {
        const plugin = this;

        // In Live Preview, markdown links render as <span class="cm-link"> with no href
        // on the DOM — the URL lives in the editor's document model. We query the
        // document at the click position and scan for windrose: URLs on that line.
        // No regex: regex literals inside the outer backtick template lose their
        // escapes ("\[" becomes "[" after template eval), producing invalid patterns.
        const findWindroseHrefAtPos = (view, pos) => {
          try {
            const line = view.state.doc.lineAt(pos);
            const lineText = line.text;
            const localPos = pos - line.from;
            const SCHEME = 'windrose:';
            const urls = [];
            let search = 0;
            while (true) {
              const idx = lineText.indexOf(SCHEME, search);
              if (idx === -1) break;
              let end = idx;
              while (end < lineText.length) {
                const ch = lineText[end];
                if (ch === ')' || ch === ' ' || ch === '\\t' || ch === '\\n') break;
                end++;
              }
              urls.push({ start: idx, end, url: lineText.slice(idx, end) });
              search = end;
            }
            if (urls.length === 0) return null;
            for (const u of urls) {
              const linkStart = Math.max(0, u.start - 200);
              const linkEnd = Math.min(lineText.length, u.end + 5);
              if (localPos >= linkStart && localPos <= linkEnd) {
                return u.url;
              }
            }
            return urls[0].url;
          } catch (err) {
            console.warn(W, 'cm6: findWindroseHrefAtPos error', err);
          }
          return null;
        };

        // Resolve a windrose: href from a pointer event inside the CM6 editor.
        // Returns { href, anchorEl } or null. Used by click and hover handlers.
        const resolveWindroseFromEvent = (event, view) => {
          const target = event.target;
          if (!target || typeof target.closest !== 'function') return null;

          const anchor = target.closest('a[href^="windrose:"], a[data-href^="windrose:"], a[data-windrose-href]');
          if (anchor) {
            const href = anchor.getAttribute('data-windrose-href')
              || anchor.getAttribute('href')
              || anchor.getAttribute('data-href')
              || null;
            if (href) return { href, anchorEl: anchor };
          }

          const linkSpan = target.closest('.cm-link, .cm-underline, .cm-hmd-internal-link');
          if (linkSpan) {
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
            if (pos != null) {
              const href = findWindroseHrefAtPos(view, pos);
              if (href) return { href, anchorEl: linkSpan };
            }
          }
          return null;
        };

        // LP hover state: last link we fired 'enter' for. Used to dedupe mouseover
        // fires from walking the mouse across link spans and to emit 'leave' when
        // the pointer moves off a link.
        let lpHoverState = null; // { el, href }

        const lpFireLeave = () => {
          if (!lpHoverState) return;
          if (typeof DeeplinkHover !== 'undefined') {
            DeeplinkHover.onLivePreviewPointer(plugin, lpHoverState.el, null, 'leave');
          }
          lpHoverState = null;
        };

        const lpFireEnter = (linkEl, parsed, href) => {
          if (lpHoverState && lpHoverState.el === linkEl && lpHoverState.href === href) return;
          if (lpHoverState) lpFireLeave();
          lpHoverState = { el: linkEl, href };
          if (typeof DeeplinkHover !== 'undefined') {
            DeeplinkHover.onLivePreviewPointer(plugin, linkEl, parsed, 'enter');
          }
        };

        const windroseEditorExt = cmView.EditorView.domEventHandlers({
          click: (event, view) => {
            const target = event.target;
            const resolved = resolveWindroseFromEvent(event, view);
            if (!resolved) return false;

            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
            const parsed = parseWindroseHref(resolved.href);
            if (!parsed) return true;
            const sourcePath = plugin.app.workspace.getActiveFile()?.path || '';
            navigateToWindroseLink(parsed, sourcePath).catch((err) => {
              console.error(W, 'cm6: navigate threw', err);
            });
            return true;
          },
          mouseover: (event, view) => {
            const resolved = resolveWindroseFromEvent(event, view);
            if (!resolved) {
              if (lpHoverState) lpFireLeave();
              return false;
            }
            const parsed = parseWindroseHref(resolved.href);
            if (!parsed) return false;
            lpFireEnter(resolved.anchorEl, parsed, resolved.href);
            return false;
          },
          mouseout: (event, view) => {
            if (!lpHoverState) return false;
            const related = event.relatedTarget;
            if (related && typeof related.closest === 'function') {
              if (related.closest('.windrose-hover-preview-popover')) return false;
              if (related.closest('.cm-link, .cm-underline, .cm-hmd-internal-link, a[href^="windrose:"], a[data-href^="windrose:"], a[data-windrose-href]')) {
                return false;
              }
            }
            lpFireLeave();
            return false;
          }
        });
        // ViewPlugin: tag external-link icon spans on lines containing a windrose: URL
        // so the styles.css rule for .windrose-deep-link-icon can hide the ↗ icon.
        // LP collapses the URL text out of the DOM, so selectors alone can't tell a
        // windrose link apart from an http link — we correlate each icon span to its
        // source line via the CM6 document model.
        //
        // Uses rAF-debounced tagging + a MutationObserver on contentDOM because
        // Obsidian adds the .external-link class via a separate view plugin whose
        // run order isn't guaranteed relative to ours. Without the observer, newly
        // rendered spans (scroll, reload, cursor move) briefly show the default icon.
        const windroseIconTagger = cmView.ViewPlugin.fromClass(class {
          constructor(view) {
            this.view = view;
            this.pending = false;
            this.schedule();
            this.observer = new MutationObserver(() => this.schedule());
            this.observer.observe(view.contentDOM, { childList: true, subtree: true });
          }
          update() { this.schedule(); }
          schedule() {
            if (this.pending) return;
            this.pending = true;
            requestAnimationFrame(() => { this.pending = false; this.tag(); });
          }
          tag() {
            const view = this.view;
            const spans = view.contentDOM.querySelectorAll('.external-link');
            for (const el of spans) {
              let isWindrose = false;
              try {
                const pos = view.posAtDOM(el);
                const line = view.state.doc.lineAt(pos);
                if (line.text.indexOf('(windrose:') >= 0) isWindrose = true;
              } catch (_) { /* ignore */ }
              el.classList.toggle('windrose-deep-link-icon', isWindrose);
            }
          }
          destroy() { if (this.observer) this.observer.disconnect(); }
        });

        this.registerEditorExtension([windroseEditorExt, windroseIconTagger]);
      } else {
        console.warn(W, 'cm6: @codemirror/view not available, Live Preview interception unavailable');
      }
    } catch (err) {
      console.error(W, 'cm6: failed to register editor extension', err);
    }

    // Register command to generate a random dungeon
    this.addCommand({
      id: 'insert-random-dungeon',
      name: 'Generate random dungeon',
      editorCallback: async (editor, view) => {
        new InsertDungeonModal(this.app, this, async (mapName, cells, objects, edges, options) => {
          const mapId = 'map-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
          await this.saveDungeonToJson(mapId, mapName, cells, objects, edges, options);

          const codeBlock = [
            '\`\`\`windrose-map',
            \`id: \${mapId}\`,
            \`name: \${mapName}\`,
            'type: grid',
            '\`\`\`'
          ].join('\\n');

          editor.replaceSelection(codeBlock);
        }).open();
      }
    });
  }

  /**
   * Render a windrose-map block by generating JSX source and delegating to Datacore.
   */
  _renderWindroseBlock(mapId, mapName, mapType, el, ctx) {
    const debugFile = this.app.vault.getAbstractFileByPath('WINDROSE-DEBUG.json');

    const jsxSource = debugFile
      ? [
          'window.__dmtBasePath = "Projects/dungeon-map-tracker";',
          '',
          'const { DungeonMapTracker } = await dc.require(dc.resolvePath("Dungeon" + "MapTracker.tsx"));',
          '',
          'const mapId = "' + mapId + '";',
          'const mapName = "' + mapName.replace(/"/g, '\\\\"') + '";',
          'const mapType = "' + mapType + '";',
          '',
          'return <DungeonMapTracker mapId={mapId} mapName={mapName} mapType={mapType} />;'
        ].join('\\n')
      : [
          'const { View: DungeonMapTracker } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md.md"), "DungeonMapTracker"));',
          '',
          'const mapId = "' + mapId + '";',
          'const mapName = "' + mapName.replace(/"/g, '\\\\"') + '";',
          'const mapType = "' + mapType + '";',
          '',
          'return <DungeonMapTracker mapId={mapId} mapName={mapName} mapType={mapType} />;'
        ].join('\\n');

    try {
      window.datacore.executeJsx(jsxSource, el, ctx, ctx.sourcePath);
    } catch (err) {
      console.error('[Windrose] Failed to render map block:', err);
      el.createEl('div', {
        text: 'Windrose: Failed to render map. Check console for details.',
        cls: 'windrose-error'
      });
    }
  }

  onunload() {
    if (window.__windrose) {
      window.__windrose.ready = false;
      window.__windrose.obsidian = null;
      window.dispatchEvent(new CustomEvent('windrose:bridge-teardown'));
    }
  }

  /**
   * Get the path to the Windrose data file.
   * Priority: 1) WINDROSE-DEBUG.json override, 2) Auto-discover by filename, 3) Default to vault root
   * @returns {Promise<string>} The resolved data file path
   */
  async getDataFilePath() {
    // 1. Check for debug override at vault root
    const debugFile = this.app.vault.getAbstractFileByPath('WINDROSE-DEBUG.json');
    if (debugFile) {
      try {
        const content = await this.app.vault.read(debugFile);
        const config = JSON.parse(content);
        if (config.dataFilePath) {
          console.log('[Windrose DEBUG] Using data file:', config.dataFilePath);
          return config.dataFilePath;
        }
      } catch (e) {
        console.warn('[Windrose] Failed to read WINDROSE-DEBUG.json:', e);
      }
    }
    
    // 2. Auto-discover by filename
    const allFiles = this.app.vault.getFiles();
    const dataFile = allFiles.find(f => f.name === 'windrose-md-data.json');
    if (dataFile) {
      return dataFile.path;
    }
    
    // 3. Default to vault root (file will be created if needed)
    return 'windrose-md-data.json';
  }

  /**
   * Load the dungeon generator module.
   * In debug mode (WINDROSE-DEBUG.json with dungeonGeneratorPath), loads from a .js file directly.
   * Otherwise, extracts from compiled-windrose-md.md.
   * @returns {Promise<Object>} The dungeon generator module exports
   */
  async loadDungeonGenerator() {
    // 1. Check for debug override
    const debugFile = this.app.vault.getAbstractFileByPath('WINDROSE-DEBUG.json');
    if (debugFile) {
      try {
        const debugContent = await this.app.vault.read(debugFile);
        const config = JSON.parse(debugContent);
        if (config.dungeonGeneratorPath) {
          console.log('[Windrose DEBUG] Loading generator from:', config.dungeonGeneratorPath);
          const generatorFile = this.app.vault.getAbstractFileByPath(config.dungeonGeneratorPath);
          if (!generatorFile) {
            throw new Error('Debug dungeonGeneratorPath not found: ' + config.dungeonGeneratorPath);
          }
          const code = await this.app.vault.read(generatorFile);
          const moduleFunc = new Function(code);
          return moduleFunc();
        }
      } catch (e) {
        console.warn('[Windrose] Debug generator load failed, falling back to compiled:', e.message);
      }
    }
    
    // 2. Production: Load from compiled markdown
    const allFiles = this.app.vault.getFiles();
    const compiledFile = allFiles.find(f => f.name === 'compiled-windrose-md.md');
    
    if (!compiledFile) {
      throw new Error(
        'Could not find compiled-windrose-md.md in your vault. ' +
        'Please ensure Windrose MapDesigner is properly installed.'
      );
    }
    
    // Read the file content
    const fileContent = await this.app.vault.read(compiledFile);
    
    // Extract the dungeonGenerator code block
    // Format: # dungeonGenerator\\n\\n\`\`\`js\\n...code...\\n\`\`\`
    const headerPattern = /^# dungeonGenerator\\s*\\n+\`\`\`(?:js|javascript)?\\n([\\s\\S]*?)\\n\`\`\`/m;
    const match = fileContent.match(headerPattern);
    
    if (!match) {
      throw new Error(
        'Could not find dungeonGenerator section in compiled-windrose-md.md. ' +
        'The file may be corrupted or from an incompatible version.'
      );
    }
    
    const code = match[1];
    
    // Execute the code to get exports
    // The module uses "return { ... }" pattern
    try {
      const moduleFunc = new Function(code);
      return moduleFunc();
    } catch (e) {
      throw new Error('Failed to load dungeon generator: ' + e.message);
    }
  }

  /**
   * Load the object placer module for dungeon stocking.
   * In debug mode (WINDROSE-DEBUG.json with objectPlacerPath), loads from a .js file directly.
   * Otherwise, extracts from compiled-windrose-md.md.
   * @returns {Promise<Object>} The object placer module exports
   */
  async loadObjectPlacer() {
    // 1. Check for debug override
    const debugFile = this.app.vault.getAbstractFileByPath('WINDROSE-DEBUG.json');
    if (debugFile) {
      try {
        const debugContent = await this.app.vault.read(debugFile);
        const config = JSON.parse(debugContent);
        if (config.objectPlacerPath) {
          console.log('[Windrose DEBUG] Loading objectPlacer from:', config.objectPlacerPath);
          const placerFile = this.app.vault.getAbstractFileByPath(config.objectPlacerPath);
          if (!placerFile) {
            throw new Error('Debug objectPlacerPath not found: ' + config.objectPlacerPath);
          }
          const code = await this.app.vault.read(placerFile);
          const moduleFunc = new Function(code);
          return moduleFunc();
        }
      } catch (e) {
        console.warn('[Windrose] Debug objectPlacer load failed, falling back to compiled:', e.message);
      }
    }

    // 2. Production: Load from compiled markdown
    const allFiles = this.app.vault.getFiles();
    const compiledFile = allFiles.find(f => f.name === 'compiled-windrose-md.md');

    if (!compiledFile) {
      throw new Error(
        'Could not find compiled-windrose-md.md in your vault. ' +
        'Please ensure Windrose MapDesigner is properly installed.'
      );
    }

    // Read the file content
    const fileContent = await this.app.vault.read(compiledFile);

    // Extract the objectPlacer code block
    const headerPattern = /^# objectPlacer\\s*\\n+\`\`\`(?:js|javascript)?\\n([\\s\\S]*?)\\n\`\`\`/m;
    const match = fileContent.match(headerPattern);

    if (!match) {
      throw new Error(
        'Could not find objectPlacer section in compiled-windrose-md.md. ' +
        'The file may be corrupted or from an incompatible version.'
      );
    }

    const code = match[1];

    // Execute the code to get exports
    try {
      const moduleFunc = new Function(code);
      return moduleFunc();
    } catch (e) {
      throw new Error('Failed to load object placer: ' + e.message);
    }
  }

  /**
   * Build fog of war data for auto-fog feature.
   * Fogs all cells except entry room cells.
   */
  buildFogOfWar(cells, options) {
    const autoFogEnabled = options?.configOverrides?.autoFogEnabled;
    if (!autoFogEnabled) return null;

    const stockingMeta = options?.stockingMetadata;
    if (!stockingMeta?.rooms || !cells?.length) return null;

    // Find entry room
    const entryRoomId = stockingMeta.entryRoomId;
    const entryRoom = stockingMeta.rooms.find(r => r.id === entryRoomId);

    // Build set of entry room cells to exclude from fog
    const entryRoomCells = new Set();
    if (entryRoom) {
      for (let x = entryRoom.x; x < entryRoom.x + entryRoom.width; x++) {
        for (let y = entryRoom.y; y < entryRoom.y + entryRoom.height; y++) {
          // For circular rooms, check if cell is actually in room
          if (entryRoom.shape === 'circle') {
            const centerX = entryRoom.x + entryRoom.radius;
            const centerY = entryRoom.y + entryRoom.radius;
            const dx = x + 0.5 - centerX;
            const dy = y + 0.5 - centerY;
            if (dx * dx + dy * dy <= entryRoom.radius * entryRoom.radius) {
              entryRoomCells.add(\`\${x},\${y}\`);
            }
          } else if (entryRoom.shape === 'composite') {
            // Check if cell is in any of the room's parts
            for (const part of entryRoom.parts) {
              if (x >= part.x && x < part.x + part.width &&
                  y >= part.y && y < part.y + part.height) {
                entryRoomCells.add(\`\${x},\${y}\`);
                break;
              }
            }
          } else {
            entryRoomCells.add(\`\${x},\${y}\`);
          }
        }
      }
    }

    // Fog all cells except entry room
    const foggedCells = cells
      .filter(c => !entryRoomCells.has(\`\${c.x},\${c.y}\`))
      .map(c => ({ col: c.x, row: c.y }));

    return {
      enabled: true,
      foggedCells
    };
  }

  /**
   * Save a generated dungeon directly to the JSON data file
   */
  async saveDungeonToJson(mapId, mapName, cells, objects, edges, options) {
    const SCHEMA_VERSION = 2;
    
    try {
      const dataFilePath = await this.getDataFilePath();
      let allData = { maps: {} };
      
      // Load existing data
      const file = this.app.vault.getAbstractFileByPath(dataFilePath);
      if (file) {
        const content = await this.app.vault.read(file);
        allData = JSON.parse(content);
      }
      
      if (!allData.maps) allData.maps = {};
      
      // Generate layer ID
      const layerId = 'layer-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      
      // Calculate viewport center from generated cells (in grid cell coordinates)
      let centerX = 5, centerY = 5;
      const gridSize = 32;
      if (cells.length > 0) {
        const minX = Math.min(...cells.map(c => c.x));
        const maxX = Math.max(...cells.map(c => c.x));
        const minY = Math.min(...cells.map(c => c.y));
        const maxY = Math.max(...cells.map(c => c.y));
        // Center is in grid cell coordinates, NOT pixels
        centerX = (minX + maxX) / 2;
        centerY = (minY + maxY) / 2;
      }
      
      // Create the map data structure
      const mapData = {
        name: mapName,
        description: "",
        mapType: "grid",
        northDirection: 0,
        customColors: [],
        sidebarCollapsed: false,
        expandedState: false,
        // Store generation settings for re-roll feature
        generationSettings: {
          preset: options.preset,
          configOverrides: options.configOverrides || {},
          distancePerCell: options.distancePerCell || 5,
          distanceUnit: options.distanceUnit || 'ft',
          stockingMetadata: options.stockingMetadata || null
        },
        settings: {
          useGlobalSettings: false,
          overrides: {
            distancePerCellGrid: options.distancePerCell || 5,
            distanceUnitGrid: options.distanceUnit || 'ft'
          }
        },
        uiPreferences: {
          rememberPanZoom: true,
          rememberSidebarState: true,
          rememberExpandedState: false
        },
        lastTextLabelSettings: null,
        schemaVersion: SCHEMA_VERSION,
        activeLayerId: layerId,
        layerPanelVisible: false,
        layers: [{
          id: layerId,
          name: 'Layer 1',
          order: 0,
          visible: true,
          cells: cells,
          edges: edges || [],
          objects: objects || [],
          textLabels: [],
          fogOfWar: this.buildFogOfWar(cells, options)
        }],
        gridSize: gridSize,
        dimensions: { width: 300, height: 300 },
        viewState: {
          zoom: 1.5,
          center: { x: centerX, y: centerY }
        }
      };
      
      // Save to allData
      allData.maps[mapId] = mapData;
      
      // Write back to file
      const jsonString = JSON.stringify(allData, null, 2);
      if (file) {
        await this.app.vault.modify(file, jsonString);
      } else {
        // Create directory if needed
        const dirPath = dataFilePath.substring(0, dataFilePath.lastIndexOf('/'));
        try {
          await this.app.vault.createFolder(dirPath);
        } catch (e) {
          // Folder may already exist
        }
        await this.app.vault.create(dataFilePath, jsonString);
      }
      
    } catch (error) {
      console.error('[Windrose] Failed to save dungeon:', error);
      throw error;
    }
  }

  async loadSettings() {
    try {
      const data = await this.loadData();
      this.settings = Object.assign({
        version: '{{PLUGIN_VERSION}}',
        hexOrientation: '{{DEFAULT_HEX_ORIENTATION}}',
        gridLineColor: '{{DEFAULT_GRID_LINE_COLOR}}',
        gridLineWidth: 1,
        backgroundColor: '{{DEFAULT_BACKGROUND_COLOR}}',
        borderColor: '{{DEFAULT_BORDER_COLOR}}',
        coordinateKeyColor: '{{DEFAULT_COORDINATE_KEY_COLOR}}',
        coordinateTextColor: '{{DEFAULT_COORDINATE_TEXT_COLOR}}',
        coordinateTextShadow: '{{DEFAULT_COORDINATE_TEXT_SHADOW}}',
        coordinateKeyMode: 'hold',
        expandedByDefault: false,
        // Canvas dimensions
        canvasHeight: 600,
        canvasHeightMobile: 400,
        // Distance measurement settings
        distancePerCellGrid: 5,
        distancePerCellHex: 6,
        distanceUnitGrid: 'ft',
        distanceUnitHex: 'mi',
        gridDiagonalRule: 'alternating',
        distanceDisplayFormat: 'both',
        // Object customization - separate for hex and grid maps
        hexObjectOverrides: {},
        customHexObjects: [],
        customHexCategories: [],
        gridObjectOverrides: {},
        customGridObjects: [],
        customGridCategories: [],
        // Color palette customization
        colorPaletteOverrides: {},
        customPaletteColors: [],
        // Fog of War defaults
        fogOfWarBlurEnabled: false,
        fogOfWarBlurFactor: 0.20,
        // Controls visibility
        alwaysShowControls: false,
        // Object sets
        objectSets: [],
        activeObjectSetId: null,
        objectSetsAutoLoadFolder: '',
        // Tileset folders
        tilesetFolders: []
      }, data || {});
    } catch (error) {
      console.warn('[DMT Settings] Error loading settings, using defaults:', error);
      this.settings = {
        version: '{{PLUGIN_VERSION}}',
        hexOrientation: '{{DEFAULT_HEX_ORIENTATION}}',
        gridLineColor: '{{DEFAULT_GRID_LINE_COLOR}}',
        gridLineWidth: 1,
        backgroundColor: '{{DEFAULT_BACKGROUND_COLOR}}',
        borderColor: '{{DEFAULT_BORDER_COLOR}}',
        coordinateKeyColor: '{{DEFAULT_COORDINATE_KEY_COLOR}}',
        coordinateTextColor: '{{DEFAULT_COORDINATE_TEXT_COLOR}}',
        coordinateTextShadow: '{{DEFAULT_COORDINATE_TEXT_SHADOW}}',
        coordinateKeyMode: 'hold',
        expandedByDefault: false,
        // Canvas dimensions
        canvasHeight: 600,
        canvasHeightMobile: 400,
        // Distance measurement settings
        distancePerCellGrid: 5,
        distancePerCellHex: 6,
        distanceUnitGrid: 'ft',
        distanceUnitHex: 'mi',
        gridDiagonalRule: 'alternating',
        distanceDisplayFormat: 'both',
        // Object customization - separate for hex and grid maps
        hexObjectOverrides: {},
        customHexObjects: [],
        customHexCategories: [],
        gridObjectOverrides: {},
        customGridObjects: [],
        customGridCategories: [],
        // Color palette customization
        colorPaletteOverrides: {},
        customPaletteColors: [],
        // Fog of War defaults
        fogOfWarBlurEnabled: false,
        fogOfWarBlurFactor: 0.20,
        // Controls visibility
        alwaysShowControls: false,
        // Object sets
        objectSets: [],
        activeObjectSetId: null,
        objectSetsAutoLoadFolder: '',
        // Tileset folders
        tilesetFolders: []
      };
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

// =============================================================================
// SETTINGS TAB CLASS
// =============================================================================

class WindroseMDSettingsTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.settingsChanged = false;
    this.objectFilter = '';
    this.selectedMapType = 'grid'; // 'grid' or 'hex' for object editing
  }
  
  // ---------------------------------------------------------------------------
  // Helper: Get object settings for the selected map type
  // Returns a normalized object { objectOverrides, customObjects, customCategories }
  // ---------------------------------------------------------------------------
  
  getObjectSettingsForMapType() {
    const settings = this.plugin.settings;
    if (this.selectedMapType === 'hex') {
      return {
        objectOverrides: settings.hexObjectOverrides || {},
        customObjects: settings.customHexObjects || [],
        customCategories: settings.customHexCategories || []
      };
    } else {
      return {
        objectOverrides: settings.gridObjectOverrides || {},
        customObjects: settings.customGridObjects || [],
        customCategories: settings.customGridCategories || []
      };
    }
  }
  
  // ---------------------------------------------------------------------------
  // Helper: Update object settings for the selected map type
  // ---------------------------------------------------------------------------
  
  updateObjectSettingsForMapType(updates) {
    if (this.selectedMapType === 'hex') {
      if (updates.objectOverrides !== undefined) {
        this.plugin.settings.hexObjectOverrides = updates.objectOverrides;
      }
      if (updates.customObjects !== undefined) {
        this.plugin.settings.customHexObjects = updates.customObjects;
      }
      if (updates.customCategories !== undefined) {
        this.plugin.settings.customHexCategories = updates.customCategories;
      }
    } else {
      if (updates.objectOverrides !== undefined) {
        this.plugin.settings.gridObjectOverrides = updates.objectOverrides;
      }
      if (updates.customObjects !== undefined) {
        this.plugin.settings.customGridObjects = updates.customObjects;
      }
      if (updates.customCategories !== undefined) {
        this.plugin.settings.customGridCategories = updates.customCategories;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helper: Create collapsible section with details/summary
  // ---------------------------------------------------------------------------
  
  createCollapsibleSection(containerEl, title, renderFn, options = {}) {
    const details = containerEl.createEl('details', { cls: 'dmt-settings-section' });
    if (options.open) details.setAttribute('open', '');
    
    // Store section reference for search filtering
    if (!this.sections) this.sections = [];
    this.sections.push({ details, title });
    
    const summary = details.createEl('summary');
    summary.createEl('span', { text: title });
    
    const contentEl = details.createEl('div', { cls: 'dmt-settings-section-content' });
    
    // Track settings within this section for search
    const settingItems = [];
    const originalCreateEl = contentEl.createEl.bind(contentEl);
    
    // Render the section content
    renderFn(contentEl);
    
    // Collect all setting-item elements for search filtering
    details.settingItems = Array.from(contentEl.querySelectorAll('.setting-item'));
    
    return details;
  }
  
  // ---------------------------------------------------------------------------
  // Helper: Render search bar
  // ---------------------------------------------------------------------------
  

  // ---------------------------------------------------------------------------
  // Main display method - orchestrates section rendering
  // ---------------------------------------------------------------------------

  display() {
    const { containerEl } = this;
    
    // Preserve which sections are currently open before rebuilding
    const openSections = new Set();
    if (this.sections) {
      this.sections.forEach(({ details, title }) => {
        if (details.hasAttribute('open')) {
          openSections.add(title);
        }
      });
    }
    
    containerEl.empty();
    
    // Reset section tracking for search
    this.sections = [];
    
    this.renderSearchBar(containerEl);
    
    // Render collapsible sections (restore open state if previously open)
    this.createCollapsibleSection(containerEl, 'Hex Map Settings', 
      (el) => this.renderHexSettingsContent(el),
      { open: openSections.has('Hex Map Settings') });
    this.createCollapsibleSection(containerEl, 'Color Settings', 
      (el) => this.renderColorSettingsContent(el),
      { open: openSections.has('Color Settings') });
    this.createCollapsibleSection(containerEl, 'Color Palette', 
      (el) => this.renderColorPaletteContent(el),
      { open: openSections.has('Color Palette') });
    this.createCollapsibleSection(containerEl, 'Fog of War', 
      (el) => this.renderFogOfWarSettingsContent(el),
      { open: openSections.has('Fog of War') });
    this.createCollapsibleSection(containerEl, 'Map Behavior', 
      (el) => this.renderMapBehaviorSettingsContent(el),
      { open: openSections.has('Map Behavior') });
    this.createCollapsibleSection(containerEl, 'Distance Measurement', 
      (el) => this.renderDistanceMeasurementSettingsContent(el),
      { open: openSections.has('Distance Measurement') });
    this.createCollapsibleSection(containerEl, 'Tile Sets',
      (el) => this.renderTilesetFoldersContent(el),
      { open: openSections.has('Tile Sets') });
    this.createCollapsibleSection(containerEl, 'Object Types',
      (el) => this.renderObjectTypesContent(el),
      { open: openSections.has('Object Types') });
  }

  
  hide() {
    // Only dispatch event if settings were actually changed
    if (this.settingsChanged) {
      window.dispatchEvent(new CustomEvent('dmt-settings-changed', {
        detail: { timestamp: Date.now() }
      }));
      this.settingsChanged = false;
    }
    
  }
}

// =============================================================================
// TAB RENDER MIXINS
// Methods injected into WindroseMDSettingsTab prototype at assembly time
// =============================================================================

{{TAB_RENDER_METHODS}}

// Mix in the render methods to WindroseMDSettingsTab
Object.assign(WindroseMDSettingsTab.prototype, TabRenderCoreMethods);
Object.assign(WindroseMDSettingsTab.prototype, TabRenderSettingsMethods);
Object.assign(WindroseMDSettingsTab.prototype, TabRenderColorsMethods);
Object.assign(WindroseMDSettingsTab.prototype, TabRenderObjectsMethods);
Object.assign(WindroseMDSettingsTab.prototype, TabRenderTilesetsMethods);

module.exports = WindroseMDSettingsPlugin;`;