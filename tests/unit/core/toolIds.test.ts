/**
 * toolIds.test.ts
 *
 * The runtime ToolId table: a wrong id (the classic probe mistake 'paint')
 * must be refused loudly instead of falling through every tool branch.
 */
import { describe, it, expect } from 'vitest';

import { TOOL_IDS, isToolId } from '../../../src/core/toolIds';

describe('toolIds', () => {
  it('knows the paint tool as draw and refuses paint', () => {
    expect(isToolId('draw')).toBe(true);
    expect(isToolId('paint')).toBe(false);
  });

  it('accepts every listed id and nothing else', () => {
    for (const id of TOOL_IDS) expect(isToolId(id)).toBe(true);
    expect(isToolId('')).toBe(false);
    expect(isToolId('toString')).toBe(false);
    expect(isToolId(42)).toBe(false);
    expect(isToolId(null)).toBe(false);
  });
});
