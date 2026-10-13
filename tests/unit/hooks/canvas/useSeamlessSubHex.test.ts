import { describe, it, expect } from 'vitest';
import { MAX_WHEEL_ZOOM } from '../../../../src/hooks/canvas/useSeamlessSubHex';

describe('useSeamlessSubHex constants', () => {
  it('keeps the wheel/pinch zoom ceiling at 4', () => {
    expect(MAX_WHEEL_ZOOM).toBe(4);
  });
});
