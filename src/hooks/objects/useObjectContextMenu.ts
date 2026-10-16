/**
 * useObjectContextMenu.ts
 *
 * Native right-click menu for an UNSELECTED object.
 *
 * Claimant rule (mirrored in SelectionActionsOverlay): this menu claims a
 * right-click ONLY when it lands on an object that is NOT already selected.
 * It selects that object first, then shows its menu. A right-click on an
 * already-selected item, or anywhere else while a selection exists, belongs
 * to the selection's SelectionActionsOverlay, which never claims a click on
 * an unselected object. The predicates are disjoint, so listener
 * registration order does not decide which menu appears.
 *
 * Everything the listener reads goes through refs so the effect registers
 * once per mount. Menu items deref the handler ref at CLICK time: by then the
 * setSelectedItem below has re-rendered, so handlers that act on "the
 * selection" see the clicked object; rotate/duplicate/delete/link-note
 * receive its id explicitly.
 */

import { useEffect, useRef } from 'preact/hooks';
import type { MenuItem } from 'obsidian';
import { Menu } from 'obsidian';
import type { MapObject } from '#types/objects/object.types';
import type { MapData } from '#types/core/map.types';
import type { Point } from '#types/core/geometry.types';
import type { SelectedItem } from '#types/contexts/context.types';
import type { SelectionContextMenuDetail } from '../../core/windroseEvents';
import { isForeignInstanceEvent } from '../../core/windroseEvents';
import { useMapState, useMapOperations } from '../../context/MapContext';
import { useMapSelection } from '../../context/MapSelectionContext';
import { buildObjectActions } from '../../components/toolbars/selectionActionBuilders';
import { getActiveLayer } from '../../persistence/layerAccessor';
import { pickLadderObject } from '../../objects/ladderHitTest';
import { classicHitRung } from '../../objects/hexSlotPositioner';
import { isLadderView } from '../../core/lodFlags';

export type ObjectMenuHandlers = Parameters<typeof buildObjectActions>[1];

/** Actions that must target the right-clicked object by id */
export interface ObjectMenuIdActions {
  rotate: (id: string) => void;
  duplicate: (id: string) => void;
  delete: (id: string) => void;
  editNoteLink: (id: string) => void;
}

export interface ContextMenuTargetInput {
  mapData: MapData | null;
  hasGeometry: boolean;
  screenToGrid: (clientX: number, clientY: number) => Point | null;
  getObjectAtPosition: (objects: MapObject[], x: number, y: number, homeLevel?: number) => MapObject | null;
  selectedItems: SelectedItem[];
  /**
   * Lattice ladder pick: the object DRAWN under the pointer (home rung, held
   * size, depth-mode visibility). When set it replaces the level-0 cell lookup.
   */
  pickAt?: ((clientX: number, clientY: number) => MapObject | null) | null;
}

/**
 * The object this right-click should open a menu for, or null when the
 * click is not ours (no object hit, or the hit object is already selected).
 */
export function resolveContextMenuTarget(
  input: ContextMenuTargetInput,
  clientX: number,
  clientY: number
): MapObject | null {
  if (!input.mapData || !input.hasGeometry) return null;
  let obj: MapObject | null;
  if (input.pickAt != null) {
    obj = input.pickAt(clientX, clientY);
  } else {
    const coords = input.screenToGrid(clientX, clientY);
    if (!coords) return null;
    // A `lod` map off the ladder view draws rung 0 only: deep objects are not hittable.
    obj = input.getObjectAtPosition(getActiveLayer(input.mapData).objects ?? [], coords.x, coords.y, classicHitRung(input.mapData));
  }
  if (!obj) return null;
  if (input.selectedItems.some(s => s.id === obj.id)) return null;
  return obj;
}

export interface ObjectContextMenuOptions {
  /** Current single-object action handlers (read at click time) */
  handlers: ObjectMenuHandlers;
  idActions: ObjectMenuIdActions;
  measureMovement: boolean;
}

export function useObjectContextMenu({ handlers, idActions, measureMovement }: ObjectContextMenuOptions): void {
  const { mapData, geometry, screenToGrid, screenToWorld, instanceId, canvasRef, ladder, getActiveLevel, viewController } = useMapState();
  const { getObjectAtPosition } = useMapOperations();
  const { selectedItems, setSelectedItem, isResizeMode } = useMapSelection();

  const handlersRef = useRef<ObjectMenuHandlers>(handlers);
  handlersRef.current = handlers;
  // Ladder: hit-test what is drawn (world-space, home rung), not the level-0 cell.
  const pickAt = ladder !== null && mapData != null
    ? (clientX: number, clientY: number): MapObject | null => {
      const world = screenToWorld(clientX, clientY);
      if (!world) return null;
      const zoom = viewController?.getLive().zoom ?? mapData.viewState?.zoom ?? 1;
      return pickLadderObject(getActiveLayer(mapData).objects ?? [], world.worldX, world.worldY, {
        ladder, level: getActiveLevel(), zoom, orientation: mapData.orientation ?? 'flat'
      });
    }
    : null;
  const state = { mapData, geometry, screenToGrid, getObjectAtPosition, pickAt, selectedItems, setSelectedItem, isResizeMode, measureMovement, idActions };
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const handler = (e: CustomEvent<SelectionContextMenuDetail>): void => {
      const detail = e.detail;
      // Foreign mount's event: don't act on it, and don't claim it either.
      if (isForeignInstanceEvent(detail, instanceId)) return;
      if (detail.handled === true) return;

      const s = stateRef.current;
      const obj = resolveContextMenuTarget(
        { ...s, hasGeometry: s.geometry != null },
        detail.clientX, detail.clientY
      );
      if (!obj || !s.mapData) return;

      detail.handled = true;

      const item = { type: 'object' as const, id: obj.id, data: obj };
      s.setSelectedItem(item);

      const latest = (): ObjectMenuHandlers => handlersRef.current;
      const ids = (): ObjectMenuIdActions => stateRef.current.idActions;
      const targetId = obj.id;
      const actions = buildObjectActions(item, {
        onRotate: () => ids().rotate(targetId),
        onDuplicate: () => ids().duplicate(targetId),
        onDelete: () => ids().delete(targetId),
        onLinkNote: () => ids().editNoteLink(targetId),
        onFreeformToggle: (ev?: Event) => latest().onFreeformToggle(ev),
        onLabel: (ev?: Event) => latest().onLabel(ev),
        onLinkObject: (ev?: Event) => latest().onLinkObject(ev),
        onFollowLink: (ev?: Event) => latest().onFollowLink(ev),
        onRemoveLink: (ev?: Event) => latest().onRemoveLink(ev),
        onCopyLink: (ev?: Event) => latest().onCopyLink(ev),
        onColorClick: (ev?: Event) => latest().onColorClick(ev),
        onResize: (ev?: Event) => latest().onResize(ev),
        onMeasureToggle: (ev?: Event) => latest().onMeasureToggle?.(ev),
        onDepthModeToggle: (ev?: Event) => latest().onDepthModeToggle?.(ev),
        onLevels: (ev?: Event) => latest().onLevels?.(ev)
      }, s.mapData, { isResizeMode: s.isResizeMode, isMeasuring: s.measureMovement, isLadder: isLadderView(s.mapData) });

      const menu = new Menu();
      let lastGroup: string | null = null;
      for (const action of actions.filter(a => a.visible && a.disabled !== true)) {
        if (lastGroup != null && lastGroup !== '' && action.group !== lastGroup) menu.addSeparator();
        lastGroup = action.group;
        menu.addItem((mi: MenuItem) => {
          mi.setTitle(action.label);
          mi.setIcon(action.icon);
          if (action.id === 'delete') mi.setWarning(true);
          mi.onClick(() => action.invoke());
        });
      }
      menu.showAtPosition({ x: detail.screenX, y: detail.screenY });
    };

    // Popout-safe: the document that owns this canvas, captured once per run.
    const doc = canvasRef.current?.ownerDocument ?? activeDocument;
    doc.addEventListener('windrose:selection-context-menu', handler);
    return () => doc.removeEventListener('windrose:selection-context-menu', handler);
  }, [instanceId, canvasRef]);
}
