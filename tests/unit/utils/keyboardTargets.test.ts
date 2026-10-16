// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { isTypingTarget, isKeyForMap, shouldHandleMapKey, focusMapOnPointerDown } from '../../../src/utils/keyboardTargets';

function keyEventFrom(target: Element, key = 'Backspace'): KeyboardEvent {
  let captured: KeyboardEvent | null = null;
  const listener = (e: Event): void => { captured = e as KeyboardEvent; };
  document.addEventListener('keydown', listener);
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  document.removeEventListener('keydown', listener);
  if (captured == null) throw new Error('keydown not captured');
  return captured;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('isTypingTarget', () => {
  it('treats form fields as typing targets', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      const el = document.createElement(tag);
      document.body.appendChild(el);
      expect(isTypingTarget(el)).toBe(true);
    }
  });

  it('treats contenteditable elements and their descendants as typing targets', () => {
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const child = document.createElement('span');
    editable.appendChild(child);
    document.body.appendChild(editable);
    expect(isTypingTarget(editable)).toBe(true);
    expect(isTypingTarget(child)).toBe(true);
  });

  it('treats anything inside a CodeMirror editor as a typing target', () => {
    const editor = document.createElement('div');
    editor.className = 'cm-editor';
    const line = document.createElement('div');
    line.className = 'cm-line';
    editor.appendChild(line);
    document.body.appendChild(editor);
    expect(isTypingTarget(line)).toBe(true);

    const content = document.createElement('div');
    content.className = 'cm-content';
    document.body.appendChild(content);
    expect(isTypingTarget(content)).toBe(true);
  });

  it('does not treat the canvas, body, buttons or non-elements as typing targets', () => {
    const canvas = document.createElement('canvas');
    const button = document.createElement('button');
    document.body.append(canvas, button);
    expect(isTypingTarget(canvas)).toBe(false);
    expect(isTypingTarget(button)).toBe(false);
    expect(isTypingTarget(document.body)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(window)).toBe(false);
  });
});

describe('isKeyForMap / shouldHandleMapKey', () => {
  function mountMap(): { wrapper: HTMLElement; canvas: HTMLCanvasElement } {
    const wrapper = document.createElement('div');
    wrapper.className = 'windrose-canvas-wrapper';
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    wrapper.appendChild(canvas);
    document.body.appendChild(wrapper);
    return { wrapper, canvas };
  }

  it('accepts a key whose target is inside the map wrapper', () => {
    const { canvas } = mountMap();
    const e = keyEventFrom(canvas);
    expect(isKeyForMap(e, canvas)).toBe(true);
    expect(shouldHandleMapKey(e, canvas)).toBe(true);
  });

  it('rejects a key aimed at another map (not hovered, target outside)', () => {
    const a = mountMap();
    const b = mountMap();
    const e = keyEventFrom(b.canvas);
    expect(isKeyForMap(e, a.canvas)).toBe(false);
  });

  it('rejects Backspace typed into the note editor even when the map is the anchor', () => {
    const { canvas } = mountMap();
    const editor = document.createElement('div');
    editor.className = 'cm-editor';
    const content = document.createElement('div');
    content.className = 'cm-content';
    content.setAttribute('contenteditable', 'true');
    editor.appendChild(content);
    document.body.appendChild(editor);
    expect(shouldHandleMapKey(keyEventFrom(content), canvas)).toBe(false);
  });

  it('a key focused in map B is not also taken by hovered map A', () => {
    const a = mountMap();
    const b = mountMap();
    a.wrapper.matches = (sel: string): boolean => sel === ':hover' || Element.prototype.matches.call(a.wrapper, sel);
    expect(isKeyForMap(keyEventFrom(b.wrapper, 'Delete'), a.canvas)).toBe(false);
    expect(isKeyForMap(keyEventFrom(b.wrapper, 'Delete'), b.canvas)).toBe(true);
    // Hover fallback still applies when focus is outside every map.
    expect(isKeyForMap(keyEventFrom(document.body, 'Delete'), a.canvas)).toBe(true);
  });

  it('rejects when there is no anchor', () => {
    const { canvas } = mountMap();
    expect(isKeyForMap(keyEventFrom(canvas), null)).toBe(false);
  });
});

// Live Preview: the map is a CodeMirror widget, so the whole wrapper sits
// inside the editor's contenteditable `.cm-content`.
describe('map embedded in a Live Preview editor', () => {
  function mountLivePreviewMap(widgetEditable: 'false' | null): {
    content: HTMLElement; wrapper: HTMLElement; container: HTMLElement; canvas: HTMLCanvasElement;
  } {
    const editor = document.createElement('div');
    editor.className = 'cm-editor';
    const content = document.createElement('div');
    content.className = 'cm-content';
    content.setAttribute('contenteditable', 'true');
    const widget = document.createElement('div');
    widget.className = 'cm-embed-block';
    if (widgetEditable != null) widget.setAttribute('contenteditable', widgetEditable);
    const wrapper = document.createElement('div');
    wrapper.className = 'windrose-canvas-wrapper';
    wrapper.tabIndex = -1;
    const container = document.createElement('div');
    container.className = 'windrose-canvas-container';
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    wrapper.appendChild(container);
    widget.appendChild(wrapper);
    content.appendChild(widget);
    editor.appendChild(content);
    document.body.appendChild(editor);
    return { content, wrapper, container, canvas };
  }

  for (const widgetEditable of ['false', null] as const) {
    describe(`widget contenteditable=${String(widgetEditable)}`, () => {
      it('handles a key whose target is the canvas or the focused wrapper', () => {
        const { wrapper, canvas } = mountLivePreviewMap(widgetEditable);
        expect(isTypingTarget(canvas)).toBe(false);
        expect(isTypingTarget(wrapper)).toBe(false);
        expect(shouldHandleMapKey(keyEventFrom(canvas, 'Delete'), canvas)).toBe(true);
        expect(shouldHandleMapKey(keyEventFrom(wrapper, 'r'), canvas)).toBe(true);
      });

      it('ignores a key typed into the note text (target = .cm-content outside the wrapper)', () => {
        const { content, canvas } = mountLivePreviewMap(widgetEditable);
        expect(shouldHandleMapKey(keyEventFrom(content, 'Backspace'), canvas)).toBe(false);
        expect(shouldHandleMapKey(keyEventFrom(content, 'r'), canvas)).toBe(false);
      });

      it('ignores keys typed into an input or editable label inside the map', () => {
        const { wrapper, canvas } = mountLivePreviewMap(widgetEditable);
        const input = document.createElement('input');
        const label = document.createElement('div');
        label.setAttribute('contenteditable', 'true');
        const labelText = document.createElement('span');
        label.appendChild(labelText);
        wrapper.append(input, label);
        expect(shouldHandleMapKey(keyEventFrom(input, 'Backspace'), canvas)).toBe(false);
        expect(shouldHandleMapKey(keyEventFrom(labelText, 'r'), canvas)).toBe(false);
      });
    });
  }

  it('a press on the canvas focuses the wrapper so the next key targets the map', () => {
    const { content, wrapper, container, canvas } = mountLivePreviewMap('false');
    content.focus();
    focusMapOnPointerDown(canvas, container);
    expect(document.activeElement).toBe(wrapper);
    const target = document.activeElement ?? document.body;
    expect(shouldHandleMapKey(keyEventFrom(target, 'Delete'), canvas)).toBe(true);
  });

  it('a press on an input, button or tabindexed control inside the map keeps its own focus', () => {
    const { wrapper, container } = mountLivePreviewMap('false');
    const input = document.createElement('input');
    const button = document.createElement('button');
    const icon = document.createElement('span');
    button.appendChild(icon);
    container.append(input, button);
    input.focus();
    focusMapOnPointerDown(input, container);
    expect(document.activeElement).toBe(input);
    focusMapOnPointerDown(icon, container);
    expect(document.activeElement).toBe(input);
    expect(document.activeElement).not.toBe(wrapper);
  });

  it('is a no-op without an anchor', () => {
    const { canvas } = mountLivePreviewMap('false');
    expect(() => focusMapOnPointerDown(canvas, null)).not.toThrow();
  });
});
