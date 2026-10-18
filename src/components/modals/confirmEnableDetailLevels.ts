/**
 * confirmEnableDetailLevels.ts
 *
 * The one confirmation shown before a map gains detail levels (new-map preset
 * or the map settings toggle). Older Windrose versions drop `mapData.lod` and
 * its content when they save, so every device on the vault must be current.
 * Nothing is persisted: the question is asked each time a map is opted in.
 */

import type { App } from 'obsidian';

import { ConfirmModal } from '../../settings/modals/ConfirmModal';

const ENABLE_DETAIL_LEVELS_TITLE = 'Enable detail levels?';
const ENABLE_DETAIL_LEVELS_MESSAGE =
  'Every device that opens this vault must run Windrose 2.5.0 or later. ' +
  'Older versions discard a map\'s detail levels when they save it. Continue?';

/** Resolves true on Enable, false on Cancel or dismiss. */
function confirmEnableDetailLevels(app: App): Promise<boolean> {
  return new ConfirmModal(app, {
    title: ENABLE_DETAIL_LEVELS_TITLE,
    message: ENABLE_DETAIL_LEVELS_MESSAGE,
    confirmText: 'Enable',
    cancelText: 'Cancel'
  }).openAndGetValue();
}

export { confirmEnableDetailLevels };
