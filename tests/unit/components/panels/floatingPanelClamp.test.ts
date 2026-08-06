import { describe, it, expect } from 'vitest';
import { clampPanelPosition } from '../../../../src/components/panels/FloatingPanel';

// windrose-pqv: floated panels must always land fully inside their own
// window's viewport — stale or cross-window coordinates self-heal via clamp.
describe('clampPanelPosition', () => {
  it('leaves an in-bounds position unchanged', () => {
    expect(clampPanelPosition(200, 150, 300, 400, 1920, 1080)).toEqual({ x: 200, y: 150 });
  });

  it('clamps a position past the right edge to fully visible', () => {
    expect(clampPanelPosition(1900, 100, 300, 200, 1920, 1080)).toEqual({ x: 1920 - 300, y: 100 });
  });

  it('clamps a position past the bottom edge to fully visible', () => {
    expect(clampPanelPosition(100, 1050, 300, 200, 1920, 1080)).toEqual({ x: 100, y: 1080 - 200 });
  });

  it('clamps negative coordinates to the origin', () => {
    expect(clampPanelPosition(-50, -999, 300, 200, 1920, 1080)).toEqual({ x: 0, y: 0 });
  });

  it('recovers coordinates captured in a wider window (cross-window bleed)', () => {
    // x=2400 was valid in a 2560-wide popout; applied in a 1400-wide main
    // window it must pull back on-screen, not pin off the right edge.
    expect(clampPanelPosition(2400, 80, 260, 300, 1400, 900)).toEqual({ x: 1400 - 260, y: 80 });
  });

  it('pins at the origin when the panel is larger than the window', () => {
    expect(clampPanelPosition(300, 300, 2000, 1500, 1400, 900)).toEqual({ x: 0, y: 0 });
  });
});
