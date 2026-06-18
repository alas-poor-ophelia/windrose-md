/**
 * windroseEvents.ts
 *
 * Central typed registry for Windrose's custom DOM events. Augments the global
 * WindowEventMap / DocumentEventMap so `addEventListener` / `removeEventListener`
 * are keyed by event name and `event.detail` carries its real shape instead of
 * `any`. Listeners can drop the `as EventListener` cast and read typed details.
 *
 * Dispatch and listen on the SAME target (window vs document) per event — the
 * augmentation covers both maps identically, so either works at the type level.
 */

import type { NavigationEventDetail } from '../persistence/deepLinkHandler';
import type { ObjectLink } from '#types/objects/object.types';

/** Axial hex coordinate payload (sub-hex entry / sibling navigation). */
export interface SubHexCoordDetail {
  q: number;
  r: number;
}

/** Right-click on a hex: axial coord + screen position for the context menu. */
export interface HexContextMenuDetail {
  q: number;
  r: number;
  screenX: number;
  screenY: number;
}

/**
 * Right-click on a selection. `handled` is a mutable claim flag: the first
 * handler to act sets it true so later handlers skip (not a cancelable event).
 */
export interface SelectionContextMenuDetail {
  screenX: number;
  screenY: number;
  clientX: number;
  clientY: number;
  handled: boolean;
}

/** Region-targeted events (edit / center-on). */
export interface RegionIdDetail {
  regionId: string;
}

/** A player object was dropped — clear fog within its light radius. */
export interface PlayerFogClearDetail {
  objectId: string;
}

/** Cross-layer object link creation. */
export interface CreateObjectLinkDetail {
  sourceLayerId: string;
  sourceObjectId: string;
  sourceLink: ObjectLink;
  targetLayerId: string;
  targetObjectId: string;
  targetLink: ObjectLink;
}

/** Cross-layer object link removal. */
export interface RemoveObjectLinkDetail {
  sourceLayerId: string;
  sourceObjectId: string;
  targetLayerId: string;
  targetObjectId: string;
}

/**
 * Settings-changed signal. Some dispatch sites omit detail entirely (bare
 * Event), so `timestamp` is optional — no listener currently reads it.
 */
export interface SettingsChangedDetail {
  timestamp?: number;
}

/** Name → CustomEvent map for every Windrose custom DOM event. */
export interface WindroseEventMap {
  'windrose:enter-sub-hex': CustomEvent<SubHexCoordDetail>;
  'windrose:navigate-sibling-sub-hex': CustomEvent<SubHexCoordDetail>;
  'windrose:hex-context-menu': CustomEvent<HexContextMenuDetail>;
  'windrose:selection-context-menu': CustomEvent<SelectionContextMenuDetail>;
  'windrose:edit-region': CustomEvent<RegionIdDetail>;
  'windrose:center-on-region': CustomEvent<RegionIdDetail>;
  'windrose:before-undo': CustomEvent<null>;
  'windrose:player-fog-clear': CustomEvent<PlayerFogClearDetail>;
  'windrose-navigate-to': CustomEvent<NavigationEventDetail>;
  'windrose-create-object-link': CustomEvent<CreateObjectLinkDetail>;
  'windrose-remove-object-link': CustomEvent<RemoveObjectLinkDetail>;
  'windrose-settings-changed': CustomEvent<SettingsChangedDetail>;
}

declare global {
  // Empty-body interface merge is the canonical way to extend the DOM event maps.
  /* eslint-disable @typescript-eslint/no-empty-object-type */
  interface WindowEventMap extends WindroseEventMap {}
  interface DocumentEventMap extends WindroseEventMap {}
  /* eslint-enable @typescript-eslint/no-empty-object-type */
}
