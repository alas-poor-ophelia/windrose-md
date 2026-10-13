/**
 * keyboardTargets.ts
 *
 * Guards for map-scoped keyboard handlers. The map installs window/document
 * keydown listeners (Delete removes the selected object or wall, R rotates),
 * so every such handler must ignore keystrokes meant for a typing surface:
 * a form field, or Obsidian's CodeMirror note editor (a contenteditable div,
 * NOT an INPUT/TEXTAREA) — otherwise Backspace in the note deletes a map
 * object and "r" rotates it instead of typing.
 *
 * In Live Preview the map is a CodeMirror widget, i.e. it sits INSIDE
 * `.cm-content`. So "inside the editor" cannot by itself mean "typing": the
 * map wrapper is made focusable (tabIndex -1) and takes focus when the user
 * presses on the map (focusMapOnPointerDown), and any target inside a map
 * wrapper is judged only by the map's own form fields/editables.
 *
 * Rule (shouldHandleMapKey):
 *   1. target inside this map's wrapper -> handle, unless it is a form field or
 *      an editable element owned by the map (label/search inputs keep typing);
 *   2. target outside the wrapper and a typing surface (note editor, inputs,
 *      modals) -> ignore;
 *   3. otherwise -> handle only while the pointer is over the wrapper.
 */

/** Map wrapper: focus target and hover anchor (mouseenter/leave drive isFocused). */
const MAP_FOCUS_WRAPPER_SELECTOR = '.windrose-canvas-wrapper';

/** Elements that manage their own focus; a press on them must not move focus to the wrapper. */
const SELF_FOCUSING_SELECTOR =
  'input, textarea, select, button, a[href], [contenteditable]:not([contenteditable="false"]), [tabindex]';

function isFormField(el: Element): boolean {
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * True when the event target is somewhere the user types: INPUT, TEXTAREA,
 * SELECT, any contenteditable element, or anything inside a CodeMirror editor.
 * Inside a map wrapper only the map's own form fields and editables count,
 * because the wrapper itself may live inside the editor's `.cm-content`.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (target == null || typeof (target as Element).closest !== 'function') return false;
  const el = target as HTMLElement;
  if (isFormField(el)) return true;
  const mapWrapper = el.closest(MAP_FOCUS_WRAPPER_SELECTOR);
  if (mapWrapper != null) {
    const editable = el.closest('[contenteditable]');
    return editable != null && mapWrapper.contains(editable)
      && editable.getAttribute('contenteditable') !== 'false';
  }
  if (el.isContentEditable === true) return true;
  return el.closest('.cm-editor, .cm-content, [contenteditable=""], [contenteditable="true"]') != null;
}

function wrapperOf(anchor: Element): Element {
  return anchor.closest(MAP_FOCUS_WRAPPER_SELECTOR) ?? anchor;
}

/**
 * Focus gate for map-scoped keys: the key belongs to this map when the event
 * target is inside its wrapper (the wrapper or a control in it has focus), or
 * the wrapper is currently hovered. With several maps mounted, only the
 * focused or hovered one acts.
 */
function isKeyForMap(e: KeyboardEvent, anchor: Element | null | undefined): boolean {
  if (anchor == null) return false;
  const wrapper = wrapperOf(anchor);
  if (e.target instanceof Node && wrapper.contains(e.target)) return true;
  // Focus inside ANOTHER map claims the key for that map; hover must not let
  // this one act too.
  if (e.target instanceof Element && e.target.closest(MAP_FOCUS_WRAPPER_SELECTOR) != null) return false;
  return wrapper.matches(':hover');
}

/** Combined guard: a map key handler should run only when this is true. */
function shouldHandleMapKey(e: KeyboardEvent, anchor: Element | null | undefined): boolean {
  return !isTypingTarget(e.target) && isKeyForMap(e, anchor);
}

/**
 * Pointerdown handler body: move keyboard focus to the map wrapper so the next
 * key's target is inside the map (the canvas handlers preventDefault on
 * mousedown/touchstart, so the browser never moves focus on its own, and in
 * Live Preview it would stay on the note editor). Presses on elements that
 * manage their own focus (inputs, buttons, editables, tabindexed controls) are
 * left alone. preventScroll keeps the note from jumping.
 */
function focusMapOnPointerDown(target: EventTarget | null, anchor: Element | null | undefined): void {
  if (anchor == null) return;
  const wrapper = wrapperOf(anchor) as HTMLElement;
  if (typeof wrapper.focus !== 'function') return;
  if (target instanceof Element && target !== wrapper) {
    const control = target.closest(SELF_FOCUSING_SELECTOR);
    if (control != null && control !== wrapper && wrapper.contains(control)) return;
  }
  if (wrapper.ownerDocument.activeElement === wrapper) return;
  wrapper.focus({ preventScroll: true });
}

export { isTypingTarget, isKeyForMap, shouldHandleMapKey, focusMapOnPointerDown, MAP_FOCUS_WRAPPER_SELECTOR };
