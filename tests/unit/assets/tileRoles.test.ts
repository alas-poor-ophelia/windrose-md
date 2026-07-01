import { describe, it, expect } from 'vitest';

import type { TileLayerRole } from '#types/tiles/tile.types';
import { ROLE_META, roleMeta } from '../../../src/assets/tileRoles';

describe('tileRoles — canonical role metadata', () => {
  it('defines exactly the four roles in stack order (ground → decoration)', () => {
    expect(ROLE_META.map(m => m.id)).toEqual([
      'ground',
      'structure',
      'props',
      'decoration',
    ]);
  });

  it('maps the ground role to the UI label "Terrain"', () => {
    expect(roleMeta('ground').label).toBe('Terrain');
  });

  it('keeps the other three labels aligned to their ids', () => {
    expect(roleMeta('structure').label).toBe('Structure');
    expect(roleMeta('props').label).toBe('Props');
    expect(roleMeta('decoration').label).toBe('Decoration');
  });

  it('gives every role a non-empty icon and hint', () => {
    for (const m of ROLE_META) {
      expect(m.icon.length).toBeGreaterThan(0);
      expect(m.hint.length).toBeGreaterThan(0);
    }
  });

  it('roleMeta resolves each role to itself', () => {
    const roles: TileLayerRole[] = ['ground', 'structure', 'props', 'decoration'];
    for (const r of roles) {
      expect(roleMeta(r).id).toBe(r);
    }
  });

  it('roleMeta falls back to ground for an unknown role', () => {
    expect(roleMeta('bogus' as TileLayerRole).id).toBe('ground');
  });
});
