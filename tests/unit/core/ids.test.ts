import { describe, it, expect } from 'vitest';
import { mintId } from '../../../src/core/ids';

describe('mintId', () => {
  it('produces prefix-timestamp-random with 9 random chars by default', () => {
    expect(mintId('obj')).toMatch(/^obj-\d+-[a-z0-9]{1,9}$/);
  });

  it('honours randomLength', () => {
    expect(mintId('wall', { randomLength: 6 })).toMatch(/^wall-\d+-[a-z0-9]{1,6}$/);
  });

  it('is unique over 10k calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10000; i++) seen.add(mintId('x'));
    expect(seen.size).toBe(10000);
  });
});
