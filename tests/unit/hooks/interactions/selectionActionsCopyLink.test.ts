/**
 * Copy link follows the Note pins feature flag (audit WIRE-11), as the
 * removed selection toolbars did.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const flags = vi.hoisted(() => ({ notePins: true }));

vi.mock('../../../../src/core/featureFlags', () => ({
  isFeatureEnabled: (feature: string) => (feature === 'notePins' ? flags.notePins : true),
}));

import { buildObjectActions, buildTextActions } from '../../../../src/components/toolbars/selectionActionBuilders';
import type { MapData } from '../../../../types/core/map.types';
import type { SelectedItem } from '../../../../types/contexts/context.types';

const noop = (): void => {};
const objectHandlers = {
  onRotate: noop, onLabel: noop, onDuplicate: noop, onFreeformToggle: noop, onLinkNote: noop,
  onLinkObject: noop, onFollowLink: noop, onRemoveLink: noop, onCopyLink: noop, onColorClick: noop,
  onResize: noop, onDelete: noop,
};
const textHandlers = { onEdit: noop, onRotate: noop, onCopyLink: noop, onDelete: noop };
const objectItem = { type: 'object', id: 'o1', data: { type: 'chest' } } as unknown as Extract<SelectedItem, { type: 'object' }>;
const mapData = { mapType: 'grid' } as unknown as MapData;

const copyLinkVisible = (actions: Array<{ id: string; visible: boolean }>): boolean | undefined =>
  actions.find(a => a.id === 'copyLink')?.visible;

describe('Copy link gating', () => {
  beforeEach(() => { flags.notePins = true; });

  it('is visible on objects and text when note pins are enabled', () => {
    expect(copyLinkVisible(buildObjectActions(objectItem, objectHandlers, mapData))).toBe(true);
    expect(copyLinkVisible(buildTextActions(textHandlers))).toBe(true);
  });

  it('is hidden on objects and text when note pins are disabled', () => {
    flags.notePins = false;
    expect(copyLinkVisible(buildObjectActions(objectItem, objectHandlers, mapData))).toBe(false);
    expect(copyLinkVisible(buildTextActions(textHandlers))).toBe(false);
  });
});
