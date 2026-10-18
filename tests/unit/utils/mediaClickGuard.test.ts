// @vitest-environment happy-dom
/**
 * installMediaClickGuard (REACT-01 / OBS-07): media clicks inside a map that
 * sits in reading view's .markdown-preview-sizer never reach the sizer's image
 * viewer delegate; everywhere else they bubble as usual.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { installMediaClickGuard } from '../../../src/utils/mediaClickGuard';

function build(inSizer: boolean): { host: HTMLElement; container: HTMLElement; img: HTMLElement; div: HTMLElement } {
  const host = document.createElement('div');
  if (inSizer) host.className = 'markdown-preview-sizer';
  const container = document.createElement('div');
  const img = document.createElement('img');
  const div = document.createElement('div');
  container.append(img, div);
  host.appendChild(container);
  document.body.appendChild(host);
  return { host, container, img, div };
}

function reaches(host: HTMLElement, target: HTMLElement, type: 'click' | 'contextmenu'): boolean {
  let seen = false;
  const listener = (): void => { seen = true; };
  host.addEventListener(type, listener);
  target.dispatchEvent(new Event(type, { bubbles: true }));
  host.removeEventListener(type, listener);
  return seen;
}

describe('installMediaClickGuard', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('acts only inside the sizer; stops img click propagation; cleanup removes the listeners', () => {
    const reading = build(true);
    const cleanup = installMediaClickGuard(reading.container);
    expect(reaches(reading.host, reading.img, 'click')).toBe(false);
    expect(reaches(reading.host, reading.img, 'contextmenu')).toBe(false);
    // Non-media targets bubble.
    expect(reaches(reading.host, reading.div, 'click')).toBe(true);
    cleanup();
    expect(reaches(reading.host, reading.img, 'click')).toBe(true);

    // Full-pane / live preview: not inside the sizer, so Obsidian's own behaviour is untouched.
    const pane = build(false);
    const cleanupPane = installMediaClickGuard(pane.container);
    expect(reaches(pane.host, pane.img, 'click')).toBe(true);
    expect(reaches(pane.host, pane.img, 'contextmenu')).toBe(true);
    cleanupPane();
  });

  it('checks the sizer per event, so a block inserted into reading view after install is guarded', () => {
    const detached = document.createElement('div');
    const img = document.createElement('img');
    detached.appendChild(img);
    const cleanup = installMediaClickGuard(detached);
    const sizer = document.createElement('div');
    sizer.className = 'markdown-preview-sizer';
    sizer.appendChild(detached);
    document.body.appendChild(sizer);
    expect(reaches(sizer, img, 'click')).toBe(false);
    cleanup();
  });
});
