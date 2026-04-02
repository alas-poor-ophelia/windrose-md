# Obsidian Bridge & Plugin Integration

Reference this skill when working with Obsidian API access, native modals, the settings plugin, or cross-context communication in Windrose.

## Two Execution Contexts

Windrose runs across two isolated execution contexts that can only communicate via `window` globals and DOM events:

| Context | Runtime | Obsidian Access | Code Style |
|---------|---------|-----------------|------------|
| **Datacore** (main app) | `new Function()` eval | Via bridge only | `dc.*` hooks, `return {}` exports |
| **Settings Plugin** | Obsidian plugin loader | `require('obsidian')` works | Standard JS class, `module.exports` |

**You cannot share code between these contexts.** The settings plugin is assembled from template strings and written to disk as a standalone Obsidian plugin. Datacore modules use `requireModuleByName()`. They are completely separate codebases.

## The Bridge: `window.__windrose`

The settings plugin populates the bridge during its `onload()`:

```javascript
// In settingsPluginMain.js (Settings Plugin context)
const obsidianModule = require('obsidian');
window.__windrose = {
  obsidian: obsidianModule,  // Live reference to full Obsidian module
  version: PLUGIN_VERSION,
  ready: true
};
window.dispatchEvent(new CustomEvent('windrose:bridge-ready'));
```

On `onunload()`, the bridge is torn down:
```javascript
window.__windrose.ready = false;
window.__windrose.obsidian = null;
window.dispatchEvent(new CustomEvent('windrose:bridge-teardown'));
```

## Accessing Obsidian APIs from Datacore

**Always check bridge availability first:**

```typescript
const { isBridgeAvailable, getObsidianModule } = await requireModuleByName("obsidianBridge.ts");

if (!isBridgeAvailable()) {
  return <FallbackComponent />;  // Preact-based fallback
}

const obs = getObsidianModule();
const Modal = obs.Modal;      // Constructor
const Setting = obs.Setting;  // Constructor
const Menu = obs.Menu;        // Constructor
const Notice = obs.Notice;    // Constructor
```

**For async initialization (waiting for plugin to load):**
```typescript
const { waitForBridge } = await requireModuleByName("obsidianBridge.ts");
await waitForBridge(5000);  // Throws after 5s timeout
```

### What Does NOT Work

```typescript
// WRONG — require() not available in Datacore context
const { Modal } = require('obsidian');

// WRONG — ES imports not available at runtime
import { Modal } from 'obsidian';

// WRONG — bridge might not be ready
const Modal = window.__windrose.obsidian.Modal;  // Could be null
```

## Custom Event Bus

Two event targets serve different scopes:

### Window Events (Cross-Context)

Used when Settings Plugin and Datacore need to communicate:

| Event | Direction | Payload |
|-------|-----------|---------|
| `windrose:bridge-ready` | Plugin → Datacore | None |
| `windrose:bridge-teardown` | Plugin → Datacore | None |
| `dmt-navigate-to` | Plugin → Datacore | `{ mapId, x, y, zoom, layerId, timestamp }` |
| `dmt-settings-changed` | Plugin → Datacore | `{ timestamp }` |
| `dmt-create-object-link` | Datacore → Datacore | `{ sourceLayerId, sourceObjectId, sourceLink, targetLayerId, targetObjectId, targetLink }` |
| `dmt-remove-object-link` | Datacore → Datacore | `{ sourceLayerId, sourceObjectId, targetLayerId, targetObjectId }` |

### Document Events (Intra-Datacore)

Used for communication between Datacore components:

| Event | Payload | Notes |
|-------|---------|-------|
| `windrose:enter-sub-hex` | `{ q, r }` | Double-click hex to drill down |
| `windrose:hex-context-menu` | `{ q, r, screenX, screenY }` | Right-click hex |
| `windrose:center-on-region` | `{ regionId }` | Pan to region |
| `windrose:edit-region` | `{ regionId }` | Open region editor |
| `windrose:before-undo` | None (cancelable) | `preventDefault()` to cancel undo |

**Dispatch pattern:**
```typescript
// Window event (cross-context)
window.dispatchEvent(new CustomEvent('dmt-navigate-to', {
  detail: { mapId, x, y, zoom, layerId, timestamp: Date.now() }
}));

// Document event (intra-Datacore, cancelable)
const event = new CustomEvent('windrose:before-undo', { cancelable: true });
document.dispatchEvent(event);
if (event.defaultPrevented) return;  // Something handled it
```

**Listener cleanup is mandatory:**
```typescript
dc.useEffect(() => {
  const handler = (e: Event) => { /* ... */ };
  window.addEventListener('dmt-navigate-to', handler);
  return () => window.removeEventListener('dmt-navigate-to', handler);
}, []);
```

## Native Modal Pattern

Three approaches, in order of preference:

### 1. Pure Native Modal (best)

For modals that don't need Preact rendering — forms, inputs, confirmations:

```typescript
function openNativeModal(app: App, options: ModalOptions): boolean {
  if (!isBridgeAvailable()) return false;  // Signal caller to use fallback

  const obs = getObsidianModule();
  const modal = new (class extends obs.Modal {
    onOpen() {
      this.titleEl.setText('Modal Title');
      // Use Obsidian's Setting API for form controls
      new obs.Setting(this.contentEl)
        .setName('Field Name')
        .addText(text => text.setValue(options.initialValue));
    }
    onClose() {
      options.onClose();
    }
  })(app);

  modal.open();
  return true;  // Signal success
}

// Usage: try native, fall back to Preact
if (!openNativeModal(app, options)) {
  return <PreactFallbackModal {...options} />;
}
```

### 2. NativeModalPortal (for Preact content in native shell)

When you need Preact rendering inside an Obsidian modal:

```typescript
<NativeModalPortal
  onClose={handleClose}
  title="Settings"
  modalClass="dmt-settings-modal"
  draggable={true}
  resizable={true}
  contextBridge={(children) => (
    <SomeProvider value={value}>
      {children}
    </SomeProvider>
  )}
>
  <PreactContent />
</NativeModalPortal>
```

**Critical: `contextBridge` is required.** NativeModalPortal creates an independent Preact tree via `dc.preact.render()`. Parent contexts don't propagate. You must explicitly re-wrap children with any context providers they need.

### 3. Preact ModalPortal (fallback when no bridge)

Custom overlay with its own drag/resize. Used when settings plugin isn't installed.

### interact.js for Drag/Resize

Native modals use vendored interact.js for drag and resize:

```typescript
const interact = await loadInteract();  // Cached after first load
const interactable = interact(modalEl);

interactable.draggable({
  allowFrom: '.modal-header',
  listeners: { move(event) { /* update position */ } }
});

interactable.resizable({
  edges: { top: '.dmt-resize-top', right: '.dmt-resize-right', /* ... */ },
  listeners: {
    move(event) { /* update size, clamp to 400-900 x 300-800 */ },
    end(event) { saveModalSize(event.rect.width, event.rect.height); }
  }
});
```

Modal size persists in `localStorage` key `windrose-native-modal-size`.

## Settings Plugin Assembly

The settings plugin is NOT compiled or bundled normally. It's assembled from template strings:

```
settingsPluginMain.js          ← Base template with {{PLACEHOLDERS}}
settingsPlugin-*.js files      ← Each returns a STRING of code (not executable)
settingsPluginAssembler.js     ← Concatenates strings into sections
SettingsPluginInstaller.tsx     ← Replaces data placeholders, writes to vault
```

**Assembly pipeline:**
1. Datacore loads `settingsPluginAssembler.js` → calls `assembleSettingsPlugin()`
2. Assembler loads all `settingsPlugin-*.js` template files
3. Concatenates into sections: HELPERS, MODALS, TAB_RENDERS
4. Replaces structural placeholders: `{{HELPER_NAMESPACES}}`, `{{MODAL_CLASSES}}`, `{{TAB_RENDER_METHODS}}`
5. `SettingsPluginInstaller.tsx` replaces data placeholders: `{{PLUGIN_VERSION}}`, `{{BUILT_IN_OBJECTS}}`, `{{RA_ICONS}}`, theme values, defaults
6. Writes assembled `main.js` + `manifest.json` + `styles.css` to `.obsidian/plugins/dungeon-map-tracker-settings/`
7. Obsidian loads it as a standard plugin

**This only happens on install/upgrade**, not at runtime. The plugin is a static file once written.

**Key gotcha:** `settingsPlugin-*.js` files return **strings**, not code. They look like code but are wrapped in template literals. Agents often try to execute or import them directly.

**Unicode escaping:** RPG Awesome icons use PUA (Private Use Area) characters that must be escaped as `\uXXXX` via `escapeUnicode()` before injection into the template.

**Version management:**
- `PACKAGED_PLUGIN_VERSION` in `SettingsPluginInstaller.tsx` is the source of truth
- Compared against installed version via `dc.app.plugins.manifests['dungeon-map-tracker-settings']?.version`
- `data.json` (user settings) is preserved during upgrades
- Users can decline upgrades (tracked in localStorage by version)

## Anti-Patterns

| Mistake | Why It Fails | Fix |
|---------|-------------|-----|
| `require('obsidian')` in Datacore | Not available outside plugin loader | Use `getObsidianModule()` via bridge |
| Skip `isBridgeAvailable()` check | Bridge may not be ready or plugin uninstalled | Always check, provide fallback |
| `window` events for intra-Datacore | Works but wrong scope | Use `document` for same-context events |
| `document` events for cross-context | Settings plugin can't hear them | Use `window` for cross-context |
| Missing `contextBridge` on NativeModalPortal | Child components lose all context | Wrap children with needed providers |
| `appendChild` on Preact-managed DOM | Reconciliation yanks it back | Use `dc.preact.render()` for independent trees |
| Importing settings plugin code in Datacore | Different execution contexts | They cannot share code |
| Treating `settingsPlugin-*.js` as executable | They return template strings | Only the assembler consumes them |
| Forgetting event listener cleanup | Memory leaks, double-triggering | Always return cleanup from `dc.useEffect` |
