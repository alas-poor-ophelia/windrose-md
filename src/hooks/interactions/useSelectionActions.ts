/**
 * useSelectionActions.ts
 *
 * Builds a normalized action list from selection state.
 * Consumed by SelectionActionsOverlay (toolbar) and context menu.
 */

import type { MapData } from '#types/core/map.types';
import type { MapObject } from '#types/objects/object.types';

export type ActionGroup = 'transform' | 'content' | 'links' | 'style' | 'player' | 'danger';

export interface SelectionAction {
  id: string;
  label: string;
  icon: string;
  group: ActionGroup;
  visible: boolean;
  disabled?: boolean;
  active?: boolean;
  invoke: (e?: Event) => void;
  special?: 'color' | 'resize';
  iconOnly?: boolean;
}

interface SelectedItem {
  type: 'object' | 'text' | 'notePin';
  id: string;
  data?: MapObject;
}

interface ObjectHandlers {
  onRotate: (e?: Event) => void;
  onLabel: (e?: Event) => void;
  onDuplicate: (e?: Event) => void;
  onFreeformToggle: (e?: Event) => void;
  onLinkNote: (e?: Event) => void;
  onLinkObject: (e?: Event) => void;
  onFollowLink: (e?: Event) => void;
  onRemoveLink: (e?: Event) => void;
  onCopyLink: (e?: Event) => void;
  onColorClick: (e?: Event) => void;
  onResize: (e?: Event) => void;
  onDelete: (e?: Event) => void;
  onPlayerToggle?: (e?: Event) => void;
  onMeasureToggle?: (e?: Event) => void;
}

interface TextHandlers {
  onEdit: (e?: Event) => void;
  onRotate: (e?: Event) => void;
  onCopyLink: (e?: Event) => void;
  onDelete: (e?: Event) => void;
}

interface MultiHandlers {
  onRotateAll: (e?: Event) => void;
  onDuplicateAll: (e?: Event) => void;
  onDeleteAll: (e?: Event) => void;
}

interface ObjectActionOptions {
  isResizeMode?: boolean;
  isPlayer?: boolean;
  isMeasuring?: boolean;
}

function buildObjectActions(
  item: SelectedItem,
  handlers: ObjectHandlers,
  mapData: MapData,
  options?: ObjectActionOptions
): SelectionAction[] {
  const hasLinkedObject = !!(item.data?.linkedObject);
  const isNotePin = item.data?.type === 'note_pin';
  const isFreeform = !!(item.data?.freeform);
  const isHex = mapData.mapType === 'hex';
  const isResizing = options?.isResizeMode ?? false;

  return [
    // Transform group
    {
      id: 'rotate', label: 'Rotate', icon: 'lucide-rotate-cw',
      group: 'transform', visible: true, invoke: handlers.onRotate
    },
    {
      id: 'resize', label: 'Resize', icon: 'lucide-scaling',
      group: 'transform', visible: !isHex, invoke: handlers.onResize, special: 'resize',
      active: isResizing
    },
    {
      id: 'freeform', label: isFreeform ? 'Snap to Grid' : 'Freeform',
      icon: 'lucide-diamond', group: 'transform', visible: true,
      invoke: handlers.onFreeformToggle, active: isFreeform, iconOnly: true
    },
    {
      id: 'measure', label: options?.isMeasuring ? 'Hide Ruler' : 'Ruler',
      icon: 'lucide-ruler', group: 'transform', visible: true,
      invoke: handlers.onMeasureToggle!, active: !!options?.isMeasuring, iconOnly: true
    },

    // Content group
    {
      id: 'label', label: 'Label', icon: 'lucide-sticky-note',
      group: 'content', visible: !isNotePin, invoke: handlers.onLabel
    },
    {
      id: 'duplicate', label: 'Duplicate', icon: 'lucide-copy',
      group: 'content', visible: true, invoke: handlers.onDuplicate
    },

    // Links group (expandable in toolbar, flat in context menu)
    {
      id: 'linkNote', label: item.data?.linkedNote ? 'Edit Note Link' : 'Link Note',
      icon: 'lucide-scroll-text', group: 'links', visible: true, invoke: handlers.onLinkNote
    },
    {
      id: 'linkObject', label: hasLinkedObject ? 'Edit Object Link' : 'Link Object',
      icon: 'lucide-link-2', group: 'links', visible: true,
      invoke: handlers.onLinkObject, active: hasLinkedObject
    },
    {
      id: 'followLink', label: 'Follow Link', icon: 'lucide-arrow-right-circle',
      group: 'links', visible: true, disabled: !hasLinkedObject, invoke: handlers.onFollowLink
    },
    {
      id: 'removeLink', label: 'Remove Link', icon: 'lucide-unlink',
      group: 'links', visible: true, disabled: !hasLinkedObject, invoke: handlers.onRemoveLink
    },
    {
      id: 'copyLink', label: 'Copy Link', icon: 'lucide-link',
      group: 'links', visible: true, invoke: handlers.onCopyLink, iconOnly: true
    },

    // Style group
    {
      id: 'color', label: 'Color', icon: 'lucide-palette',
      group: 'style', visible: true, invoke: handlers.onColorClick, special: 'color'
    },

    // Player group
    {
      id: 'playerToggle', label: options?.isPlayer ? 'Remove Player' : 'Mark as Player',
      icon: 'lucide-user', group: 'player', visible: true,
      invoke: handlers.onPlayerToggle!, active: !!options?.isPlayer, iconOnly: true
    },

    // Danger group
    {
      id: 'delete', label: 'Delete', icon: 'lucide-trash-2',
      group: 'danger', visible: true, invoke: handlers.onDelete
    }
  ];
}

function buildTextActions(handlers: TextHandlers): SelectionAction[] {
  return [
    {
      id: 'edit', label: 'Edit', icon: 'lucide-pencil',
      group: 'content', visible: true, invoke: handlers.onEdit
    },
    {
      id: 'rotate', label: 'Rotate', icon: 'lucide-rotate-cw',
      group: 'transform', visible: true, invoke: handlers.onRotate
    },
    {
      id: 'copyLink', label: 'Copy Link', icon: 'lucide-link',
      group: 'links', visible: true, invoke: handlers.onCopyLink, iconOnly: true
    },
    {
      id: 'delete', label: 'Delete', icon: 'lucide-trash-2',
      group: 'danger', visible: true, invoke: handlers.onDelete
    }
  ];
}

function buildMultiActions(
  _count: number,
  handlers: MultiHandlers
): SelectionAction[] {
  return [
    {
      id: 'rotate', label: 'Rotate All', icon: 'lucide-rotate-cw',
      group: 'transform', visible: true, invoke: handlers.onRotateAll
    },
    {
      id: 'duplicate', label: 'Duplicate All', icon: 'lucide-copy',
      group: 'content', visible: true, invoke: handlers.onDuplicateAll
    },
    {
      id: 'delete', label: 'Delete All', icon: 'lucide-trash-2',
      group: 'danger', visible: true, invoke: handlers.onDeleteAll
    }
  ];
}

interface ShapeOverlayHandlers {
  onColorClick: () => void;
  onDelete: () => void;
  onFreeformToggle: () => void;
}

function buildShapeOverlayActions(
  item: SelectedItem,
  handlers: ShapeOverlayHandlers
): SelectionAction[] {
  const isFreeform = !!(item.data?.freeform);
  return [
    {
      id: 'freeform', label: isFreeform ? 'Snap to Grid' : 'Freeform',
      icon: 'lucide-diamond', group: 'transform', visible: true,
      invoke: handlers.onFreeformToggle, active: isFreeform, iconOnly: true
    },
    {
      id: 'color', label: 'Color', icon: 'lucide-palette',
      group: 'style', visible: true, invoke: handlers.onColorClick, special: 'color'
    },
    {
      id: 'delete', label: 'Delete', icon: 'lucide-trash-2',
      group: 'danger', visible: true, invoke: handlers.onDelete
    }
  ];
}

export { buildObjectActions, buildTextActions, buildMultiActions, buildShapeOverlayActions };
