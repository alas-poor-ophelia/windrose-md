import type { TileLayerRole } from '#types/tiles/tile.types';

interface RoleMeta {
  id: TileLayerRole;
  label: string;
  icon: string;
  hint: string;
}

/**
 * Canonical tile-role metadata — the single source of truth for role label/icon/hint,
 * shared by the depth bar, the tile browser, and (Phase 7) the layers panel.
 * Order is the render/stack order: ground (painted first) → decoration (painted last).
 * Role hues live as CSS vars (--windrose-depth-<id>) in scss/_variables.scss.
 */
const ROLE_META: readonly RoleMeta[] = [
  { id: 'ground',     label: 'Terrain',    icon: 'grid-2x-2x', hint: 'ground' },
  { id: 'structure',  label: 'Structure',  icon: 'door-open',  hint: 'walls' },
  { id: 'props',      label: 'Props',      icon: 'sofa',       hint: 'objects' },
  { id: 'decoration', label: 'Decoration', icon: 'sparkles',   hint: 'top' },
];

function roleMeta(id: TileLayerRole): RoleMeta {
  return ROLE_META.find(m => m.id === id) ?? ROLE_META[0];
}

export { ROLE_META, roleMeta };
export type { RoleMeta };
