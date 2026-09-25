import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSettings = vi.fn(() => ({} as Record<string, unknown>));
vi.mock('../../../src/core/settingsAccessor', () => ({ getSettings }));

const { isLodLadderEnabled } = await import('../../../src/core/lodFlags');

describe('lodFlags: lattice ladder capability', () => {
  beforeEach(() => { getSettings.mockReset(); });

  it('is off when the setting is absent', () => {
    getSettings.mockReturnValue({});
    expect(isLodLadderEnabled()).toBe(false);
  });

  it('is off when the setting is explicitly false', () => {
    getSettings.mockReturnValue({ lodLadder: false });
    expect(isLodLadderEnabled()).toBe(false);
  });

  it('is on only for a literal true', () => {
    getSettings.mockReturnValue({ lodLadder: true });
    expect(isLodLadderEnabled()).toBe(true);
    getSettings.mockReturnValue({ lodLadder: 'yes' });
    expect(isLodLadderEnabled()).toBe(false);
  });
});
