import { describe, it, expect } from 'vitest';
import { clampPopoverLeft, popoverOpensAbove } from '../../../../src/components/shared/popoverClamp';

// windrose-1bw: portalled color/icon pickers open at their anchor's left edge;
// near the right edge of a phone-width window they must slide back on screen.
describe('clampPopoverLeft', () => {
  it('keeps the anchor position when the popover fits', () => {
    expect(clampPopoverLeft(40, 304, 390)).toBe(40);
  });

  it('slides left so the right edge meets the window edge', () => {
    expect(clampPopoverLeft(250, 304, 390)).toBe(390 - 304);
  });

  it('never goes past the left edge', () => {
    expect(clampPopoverLeft(-20, 200, 390)).toBe(0);
  });

  it('pins at 0 when the popover is wider than the window', () => {
    expect(clampPopoverLeft(100, 420, 390)).toBe(0);
  });

  it('is a no-op before the width is measured (width 0)', () => {
    expect(clampPopoverLeft(250, 0, 390)).toBe(250);
  });
});

describe('popoverOpensAbove', () => {
  // Anchor at top 82..110 in a 740px window, 8px gap, 148px popover (the phone case).
  it('flips a preferred-above popover below when the top lacks room', () => {
    expect(popoverOpensAbove(true, 82, 110, 148, 8, 740)).toBe(false);
  });

  it('keeps above when there is room above', () => {
    expect(popoverOpensAbove(true, 400, 428, 148, 8, 740)).toBe(true);
  });

  it('keeps the preferred side when neither side fits', () => {
    expect(popoverOpensAbove(true, 82, 110, 700, 8, 740)).toBe(true);
    expect(popoverOpensAbove(false, 82, 110, 700, 8, 740)).toBe(false);
  });

  it('flips a preferred-below popover above when the bottom lacks room', () => {
    expect(popoverOpensAbove(false, 650, 678, 148, 8, 740)).toBe(true);
  });

  it('keeps the preference before the size is measured (height 0)', () => {
    expect(popoverOpensAbove(true, 82, 110, 0, 8, 740)).toBe(true);
    expect(popoverOpensAbove(false, 650, 678, 0, 8, 740)).toBe(false);
  });
});
