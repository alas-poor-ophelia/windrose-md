/**
 * usePartyPinInteraction.ts
 *
 * Party pin tool behavior. Pressing a pin's icon grabs that pin and dragging
 * carries it live so its range ring follows; pressing anywhere else places
 * a NEW pin in that cell while the cell has a free slot (up to four pins
 * share a cell, arranged like stacked objects), and grabs the topmost pin
 * once the cell is full. A drag refuses cells that are already full.
 * Intermediate drag positions suppress history; release commits the
 * gesture as a single undo step.
 *
 * Icon hit-testing needs the press in world space; without a screen-to-
 * world converter (or the client position) the hook falls back to the
 * cell: a cell holding exactly one pin counts as a hit on that pin.
 */

// Type-only imports
import type { PartyPin } from '#types/core/map.types';
import type { IGeometry, Point } from '#types/core/geometry.types';

import { useCallback, useRef } from 'preact/hooks';
import {
  canAddPartyPinToCell,
  createPartyPin,
  findPartyPinAtWorld,
  getPartyPinById,
  getPartyPinsAt,
  movePartyPin,
  nextPartyPinDefaults,
  upsertPartyPin
} from '../../objects/partyPinOperations';

type PartyPinsChangeHandler = (partyPins: PartyPin[], suppressHistory?: boolean) => void;

/**
 * Reports which pin the gesture targeted. `viaSelect` is true only for the
 * select tool, whose selection also drives the controls card outside the
 * party pin tool.
 */
type ActivePinChangeHandler = (pinId: string | null, viaSelect: boolean) => void;

/** What the hook needs to hit-test pin icons rather than whole cells */
interface PartyPinLocator {
  geometry: IGeometry | null;
  screenToWorld: (clientX: number, clientY: number) => { worldX: number; worldY: number } | null;
}

interface UsePartyPinInteractionResult {
  handlePartyPinPointerDown: (gridX: number, gridY: number, clientX?: number, clientY?: number) => void;
  handlePartyPinSelectPointerDown: (gridX: number, gridY: number, clientX?: number, clientY?: number) => boolean;
  handlePartyPinMove: (gridX: number, gridY: number) => void;
  stopPartyPinDrag: () => void;
  isPartyPinDragging: () => boolean;
}

function usePartyPinInteraction(
  partyPins: PartyPin[] | undefined,
  onPartyPinsChange: PartyPinsChangeHandler,
  onActivePinChange?: ActivePinChangeHandler,
  locator?: PartyPinLocator,
  /** Drops held transient-history pins (useLayerHistory.clearTransient). */
  clearTransient?: () => void
): UsePartyPinInteractionResult {
  // Latest pins without re-registering handlers each render
  const pinsRef = useRef<PartyPin[]>([]);
  pinsRef.current = partyPins ?? [];
  const locatorRef = useRef<PartyPinLocator | undefined>(undefined);
  locatorRef.current = locator;

  const isDraggingRef = useRef(false);
  // Pin currently under the gesture — a map can hold many
  const dragPinIdRef = useRef<string | null>(null);
  // True once a drag actually relocated the pin. A press that only selects
  // must not commit a no-op move (it would add an empty undo step).
  const didDragMoveRef = useRef(false);
  // Last dragged cell, committed on release. Kept in a ref because the
  // pins prop can lag one render behind the final suppressed move.
  const dragPositionRef = useRef<Point | null>(null);

  /**
   * The pin a press lands on: its icon in world space when the press
   * position is known. Null is a miss. `cellFallback` lets a miss inside a
   * cell holding exactly one pin count as that pin — right for selecting,
   * wrong for the beacon tool, where a miss beside a lone pin must place
   * the next one. Without a world position the cell rule is all there is.
   */
  const resolvePressedPin = useCallback((gridX: number, gridY: number, clientX: number | undefined, clientY: number | undefined, cellFallback: boolean): PartyPin | null => {
    const pins = pinsRef.current;
    const cellPins = getPartyPinsAt(pins, { x: gridX, y: gridY });
    const solePin = cellPins.length === 1 ? cellPins[0] : null;
    const geometry = locatorRef.current?.geometry ?? null;
    const world = (clientX != null && clientY != null) ? locatorRef.current?.screenToWorld(clientX, clientY) ?? null : null;
    if (!geometry || !world) return solePin;
    const hit = findPartyPinAtWorld(pins, world.worldX, world.worldY, geometry);
    if (hit) return hit;
    return cellFallback ? solePin : null;
  }, []);

  const beginDrag = useCallback((pin: PartyPin, gridX: number, gridY: number, viaSelect: boolean): void => {
    isDraggingRef.current = true;
    dragPinIdRef.current = pin.id;
    dragPositionRef.current = { x: gridX, y: gridY };
    didDragMoveRef.current = false;
    onActivePinChange?.(pin.id, viaSelect);
  }, [onActivePinChange]);

  const handlePartyPinPointerDown = useCallback((gridX: number, gridY: number, clientX?: number, clientY?: number): void => {
    const pins = pinsRef.current;
    const cell = { x: gridX, y: gridY };
    const pressed = resolvePressedPin(gridX, gridY, clientX, clientY, false);
    if (pressed) {
      beginDrag(pressed, gridX, gridY, false);
      return;
    }

    if (canAddPartyPinToCell(pins, cell)) {
      const pin = createPartyPin(cell, nextPartyPinDefaults(pins));
      onPartyPinsChange(upsertPartyPin(pins, pin));
      onActivePinChange?.(pin.id, false);
      return;
    }

    // Full cell: the press grabs the topmost pin rather than doing nothing
    const cellPins = getPartyPinsAt(pins, cell);
    beginDrag(cellPins[cellPins.length - 1], gridX, gridY, false);
  }, [resolvePressedPin, beginDrag, onPartyPinsChange, onActivePinChange]);

  // Select-tool grab: a press on a pin's icon (or a cell's sole pin) selects
  // that pin and starts a drag from its current cell; a miss deselects.
  const handlePartyPinSelectPointerDown = useCallback((gridX: number, gridY: number, clientX?: number, clientY?: number): boolean => {
    const pin = resolvePressedPin(gridX, gridY, clientX, clientY, true);
    if (!pin) {
      onActivePinChange?.(null, true);
      return false;
    }
    beginDrag(pin, gridX, gridY, true);
    return true;
  }, [resolvePressedPin, beginDrag, onActivePinChange]);

  const handlePartyPinMove = useCallback((gridX: number, gridY: number): void => {
    if (!isDraggingRef.current) return;

    const pins = pinsRef.current;
    const pin = getPartyPinById(pins, dragPinIdRef.current);
    if (!pin) {
      isDraggingRef.current = false;
      dragPinIdRef.current = null;
      return;
    }

    const previous = dragPositionRef.current;
    if (previous && previous.x === gridX && previous.y === gridY) return;
    // A full cell refuses the move; a cell with a free slot takes the pin
    if (!canAddPartyPinToCell(pins, { x: gridX, y: gridY }, pin.id)) return;

    dragPositionRef.current = { x: gridX, y: gridY };
    didDragMoveRef.current = true;
    onPartyPinsChange(movePartyPin(pins, pin.id, { x: gridX, y: gridY }), true);
  }, [onPartyPinsChange]);

  const stopPartyPinDrag = useCallback((): void => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    const pins = pinsRef.current;
    const pin = getPartyPinById(pins, dragPinIdRef.current);
    const finalPosition = dragPositionRef.current;
    const moved = didDragMoveRef.current;
    dragPinIdRef.current = null;
    dragPositionRef.current = null;
    didDragMoveRef.current = false;
    if (!pin || !finalPosition || !moved) {
      // No commit (no move, or the pin is gone): drop any live-move pin so the
      // next unrelated commit cannot absorb it.
      clearTransient?.();
      return;
    }

    onPartyPinsChange(movePartyPin(pins, pin.id, finalPosition), false);
  }, [onPartyPinsChange, clearTransient]);

  const isPartyPinDragging = useCallback((): boolean => isDraggingRef.current, []);

  return { handlePartyPinPointerDown, handlePartyPinSelectPointerDown, handlePartyPinMove, stopPartyPinDrag, isPartyPinDragging };
}

export { usePartyPinInteraction };
