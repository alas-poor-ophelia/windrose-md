/**
 * useSelectionActions.ts
 *
 * Builds a normalized action list from selection state.
 * Consumed by SelectionActionsOverlay (toolbar) and context menu.
 */

import type { MapData } from '#types/core/map.types';
import type { SelectedItem } from '#types/contexts/context.types';
import { DEFAULT_DEPTH_MODE, depthModeOf } from '../../geometry/renderers/elementBands';
import type { DepthMode } from '../../geometry/renderers/elementBands';

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
  /** Ladder maps only: flips the object's depth mode (pop at the next rung / hold its size). */
  onDepthModeToggle?: (e?: Event) => void;
}

interface TextHandlers {
  onEdit: (e?: Event) => void;
  onRotate: (e?: Event) => void;
  onCopyLink: (e?: Event) => void;
  onDelete: (e?: Event) => void;
  /** Ladder maps only: flips the label's depth mode (pop at the next rung / hold its size). */
  onDepthModeToggle?: (e?: Event) => void;
}

interface TextActionOptions {
  /** True when the map is shown as a lattice ladder; the depth toggle is hidden otherwise. */
  isLadder?: boolean;
  /** The label's current depth mode, for the toggle's state. */
  depthMode?: DepthMode;
}

/** The depth toggle, shared by objects and labels. Hidden off the ladder. */
function depthModeAction(isLadder: boolean, depthMode: DepthMode, invoke: ((e?: Event) => void) | undefined): SelectionAction {
  const isPop = depthMode === 'pop';
  return {
    id: 'depthMode',
    label: isPop ? 'Hides at next zoom level' : 'Holds size when zooming in',
    icon: isPop ? 'lucide-eye-off' : 'lucide-anchor',
    group: 'transform',
    visible: isLadder,
    invoke: invoke ?? ((): void => {}),
    active: isPop,
    iconOnly: true
  };
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
  /** True when the map is shown as a lattice ladder; the depth toggle is hidden otherwise. */
  isLadder?: boolean;
}

function buildObjectActions(
  item: Extract<SelectedItem, { type: 'object' }>,
  handlers: ObjectHandlers,
  mapData: MapData,
  options?: ObjectActionOptions
): SelectionAction[] {
  const hasLinkedObject = item.data?.linkedObject != null;
  const isNotePin = item.data?.type === 'note_pin';
  const isFreeform = item.data?.freeform === true;
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
      id: 'measure', label: options?.isMeasuring === true ? 'Hide Ruler' : 'Ruler',
      icon: 'lucide-ruler', group: 'transform', visible: true,
      invoke: handlers.onMeasureToggle ?? ((): void => {}), active: options?.isMeasuring === true, iconOnly: true
    },
    depthModeAction(options?.isLadder === true, depthModeOf(item.data ?? {}), handlers.onDepthModeToggle),

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
      id: 'linkNote', label: item.data?.linkedNote != null && item.data.linkedNote !== '' ? 'Edit Note Link' : 'Link Note',
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
      id: 'playerToggle', label: options?.isPlayer === true ? 'Remove Player' : 'Mark as Player',
      icon: 'lucide-user', group: 'player', visible: true,
      invoke: handlers.onPlayerToggle ?? ((): void => {}), active: options?.isPlayer === true, iconOnly: true
    },

    // Danger group
    {
      id: 'delete', label: 'Delete', icon: 'lucide-trash-2',
      group: 'danger', visible: true, invoke: handlers.onDelete
    }
  ];
}

function buildTextActions(handlers: TextHandlers, options?: TextActionOptions): SelectionAction[] {
  return [
    {
      id: 'edit', label: 'Edit', icon: 'lucide-pencil',
      group: 'content', visible: true, invoke: handlers.onEdit
    },
    {
      id: 'rotate', label: 'Rotate', icon: 'lucide-rotate-cw',
      group: 'transform', visible: true, invoke: handlers.onRotate
    },
    depthModeAction(options?.isLadder === true, options?.depthMode ?? DEFAULT_DEPTH_MODE, handlers.onDepthModeToggle),
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
  onRotate: () => void;
}

function buildShapeOverlayActions(
  item: Extract<SelectedItem, { type: 'shapeOverlay' }>,
  handlers: ShapeOverlayHandlers
): SelectionAction[] {
  const isFreeform = item.data?.freeform === true;
  return [
    {
      // Rotation only shows on rectangles — a rotated circle looks identical
      id: 'rotate', label: 'Rotate', icon: 'lucide-rotate-cw',
      group: 'transform', visible: item.data?.shape !== 'circle', invoke: handlers.onRotate
    },
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
