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

/**
 * Per-mount instance scoping for map-scoped events.
 *
 * Every windrose-map code block is its own component mount, but these custom
 * events broadcast on `activeDocument`/`window`, which the whole Obsidian
 * window shares — so without a sender identity, EVERY mounted map reacts to
 * every other map's events (the 2.3.1 "sympathetic zoom" family of bugs).
 * Dispatchers stamp their mount's `instanceId` into the detail; listeners
 * gate with `isForeignInstanceEvent`. The gate is FAIL-OPEN: an event with no
 * instanceId (hand-dispatched from the console, older tooling) is handled by
 * everyone, preserving pre-token behavior.
 */
export interface InstanceScopedDetail {
  /** Per-mount sender id; absent = unscoped (handled by all instances). */
  instanceId?: string;
}

/**
 * True when `detail` carries another mount's instanceId — the listener should
 * ignore the event. Fail-open: missing detail, missing instanceId, or a
 * listener with no own id all return false (event is handled).
 */
export function isForeignInstanceEvent(
  detail: InstanceScopedDetail | null | undefined,
  ownInstanceId: string | null | undefined
): boolean {
  return detail?.instanceId != null && ownInstanceId != null && detail.instanceId !== ownInstanceId;
}

/** Axial hex coordinate payload (sub-hex entry / sibling navigation). */
export interface SubHexCoordDetail {
  q: number;
  r: number;
  /**
   * Optional view to open the sub-map at, overriding its stored viewState.
   * Seamless zoom dives pass a visual-continuity view here so the sub-map
   * appears exactly where the parent hex was on screen.
   */
  viewOverride?: { zoom: number; center: { x: number; y: number } };
  /**
   * Optional world-space point the user targeted (e.g. the double-clicked
   * pixel). When `viewOverride` is absent, the listener uses this to open the
   * sub-map centered on the corresponding point instead of the child origin.
   */
  anchor?: { worldX: number; worldY: number };
  /**
   * Live canvas size at dispatch time, so the listener can compute the
   * sub-map's fit zoom against the REAL viewport instead of trusting a
   * stored fit computed at creation-time canvas dimensions.
   */
  canvasSize?: { width: number; height: number };
}

/** Right-click on a hex: axial coord + screen position for the context menu. */
export interface HexContextMenuDetail extends InstanceScopedDetail {
  q: number;
  r: number;
  screenX: number;
  screenY: number;
  /** Live canvas size at dispatch time (see SubHexCoordDetail.canvasSize). */
  canvasSize?: { width: number; height: number };
}

/**
 * Seamless zoom-out surfacing payload: the child view at the moment the
 * surface fired, so the exit can restore a visually-continuous parent view
 * (sub-map footprint → parent hex footprint) instead of the stale dive-time
 * view. Escape-key / breadcrumb exits dispatch no detail and keep the
 * classic restore.
 */
export interface SubHexExitDetail {
  /** Child zoom the surfacing tick was heading to. */
  childZoom: number;
  /** Child world point under the zoom anchor (cursor / pinch center). */
  childAnchor: { x: number; y: number };
  /** Anchor's screen offset from the canvas center, in canvas pixels. */
  anchorOffset: { dx: number; dy: number };
}

/**
 * Right-click on a selection. `handled` is a mutable claim flag: the first
 * handler to act sets it true so later handlers skip (not a cancelable event).
 */
export interface SelectionContextMenuDetail extends InstanceScopedDetail {
  screenX: number;
  screenY: number;
  clientX: number;
  clientY: number;
  handled: boolean;
}

/** Region-targeted events (edit / center-on). */
export interface RegionIdDetail extends InstanceScopedDetail {
  regionId: string;
}

/** A player object was dropped — clear fog within its light radius. */
export interface PlayerFogClearDetail extends InstanceScopedDetail {
  objectId: string;
}

/** Cross-layer object link creation. */
export interface CreateObjectLinkDetail extends InstanceScopedDetail {
  sourceLayerId: string;
  sourceObjectId: string;
  sourceLink: ObjectLink;
  targetLayerId: string;
  targetObjectId: string;
  targetLink: ObjectLink;
}

/** Cross-layer object link removal. */
export interface RemoveObjectLinkDetail extends InstanceScopedDetail {
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

/**
 * Name → CustomEvent map for every Windrose custom DOM event.
 *
 * Sub-hex navigation (enter / exit / navigate-sibling) is NOT event-driven
 * anymore: dispatcher and listener were always the same mount, so as of 2.3.2
 * those flow through direct callbacks (requestEnterSubHex / requestExitSubHex
 * via MapContext, navigateToSibling in DungeonMapTracker) and can no longer
 * leak between co-mounted maps.
 */
export interface WindroseEventMap {
  'windrose:hex-context-menu': CustomEvent<HexContextMenuDetail>;
  'windrose:selection-context-menu': CustomEvent<SelectionContextMenuDetail>;
  'windrose:edit-region': CustomEvent<RegionIdDetail>;
  'windrose:center-on-region': CustomEvent<RegionIdDetail>;
  'windrose:before-undo': CustomEvent<InstanceScopedDetail | null>;
  'windrose:player-fog-clear': CustomEvent<PlayerFogClearDetail>;
  'windrose-navigate-to': CustomEvent<NavigationEventDetail>;
  'windrose-create-object-link': CustomEvent<CreateObjectLinkDetail>;
  'windrose-remove-object-link': CustomEvent<RemoveObjectLinkDetail>;
  'windrose-settings-changed': CustomEvent<SettingsChangedDetail>;
}

declare global {
  /* eslint-disable @typescript-eslint/no-empty-object-type -- empty-body interface merge is the canonical way to extend the DOM event maps */
  interface WindowEventMap extends WindroseEventMap {}
  interface DocumentEventMap extends WindroseEventMap {}
  /* eslint-enable @typescript-eslint/no-empty-object-type -- end of DOM event map merges */
}
