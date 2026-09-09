/**
 * usePartyPinInteraction.ts
 *
 * Party pin tool behavior. Pressing an empty cell places a NEW pin there;
 * pressing a cell that already holds one grabs that pin and dragging carries
 * it live so its range ring follows. Two pins never share a cell — placement
 * on an occupied cell targets the pin already there, and a drag refuses cells
 * held by another pin. Intermediate drag positions suppress history; release
 * commits the gesture as a single undo step.
 */

// Type-only imports
import type { PartyPin } from '#types/core/map.types';
import type { Point } from '#types/core/geometry.types';

import { useCallback, useRef } from 'preact/hooks';
import { createPartyPin, findPartyPinAt, getPartyPinById, movePartyPin, nextPartyPinDefaults, upsertPartyPin } from '../../objects/partyPinOperations';

type PartyPinsChangeHandler = (partyPins: PartyPin[], suppressHistory?: boolean) => void;

/**
 * Reports which pin the gesture targeted. `viaSelect` is true only for the
 * select tool, whose selection also drives the controls card outside the
 * party pin tool.
 */
type ActivePinChangeHandler = (pinId: string | null, viaSelect: boolean) => void;

interface UsePartyPinInteractionResult {
  handlePartyPinPointerDown: (gridX: number, gridY: number) => void;
  handlePartyPinSelectPointerDown: (gridX: number, gridY: number) => boolean;
  handlePartyPinMove: (gridX: number, gridY: number) => void;
  stopPartyPinDrag: () => void;
  isPartyPinDragging: () => boolean;
}

function usePartyPinInteraction(
  partyPins: PartyPin[] | undefined,
  onPartyPinsChange: PartyPinsChangeHandler,
  onActivePinChange?: ActivePinChangeHandler
): UsePartyPinInteractionResult {
  // Latest pins without re-registering handlers each render
  const pinsRef = useRef<PartyPin[]>([]);
  pinsRef.current = partyPins ?? [];

  const isDraggingRef = useRef(false);
  // Pin currently under the gesture — a map can hold many
  const dragPinIdRef = useRef<string | null>(null);
  // True once a drag actually relocated the pin. A press that only selects
  // must not commit a no-op move (it would add an empty undo step).
  const didDragMoveRef = useRef(false);
  // Last dragged cell, committed on release. Kept in a ref because the
  // pins prop can lag one render behind the final suppressed move.
  const dragPositionRef = useRef<Point | null>(null);

  const handlePartyPinPointerDown = useCallback((gridX: number, gridY: number): void => {
    const pins = pinsRef.current;
    const existing = findPartyPinAt(pins, { x: gridX, y: gridY });

    if (!existing) {
      const pin = createPartyPin({ x: gridX, y: gridY }, nextPartyPinDefaults(pins));
      onPartyPinsChange(upsertPartyPin(pins, pin));
      onActivePinChange?.(pin.id, false);
      return;
    }

    isDraggingRef.current = true;
    dragPinIdRef.current = existing.id;
    dragPositionRef.current = { x: gridX, y: gridY };
    didDragMoveRef.current = false;
    onActivePinChange?.(existing.id, false);
  }, [onPartyPinsChange, onActivePinChange]);

  // Select-tool grab: only a press on a pin's own cell counts. A hit selects
  // that pin and starts a drag from its current cell; a miss deselects.
  const handlePartyPinSelectPointerDown = useCallback((gridX: number, gridY: number): boolean => {
    const pin = findPartyPinAt(pinsRef.current, { x: gridX, y: gridY });
    if (!pin) {
      onActivePinChange?.(null, true);
      return false;
    }
    isDraggingRef.current = true;
    dragPinIdRef.current = pin.id;
    dragPositionRef.current = { x: gridX, y: gridY };
    didDragMoveRef.current = false;
    onActivePinChange?.(pin.id, true);
    return true;
  }, [onActivePinChange]);

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
    // Never stack pins: a cell held by another pin refuses the move
    const occupant = findPartyPinAt(pins, { x: gridX, y: gridY });
    if (occupant && occupant.id !== pin.id) return;

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
    if (!pin || !finalPosition || !moved) return;

    onPartyPinsChange(movePartyPin(pins, pin.id, finalPosition), false);
  }, [onPartyPinsChange]);

  const isPartyPinDragging = useCallback((): boolean => isDraggingRef.current, []);

  return { handlePartyPinPointerDown, handlePartyPinSelectPointerDown, handlePartyPinMove, stopPartyPinDrag, isPartyPinDragging };
}

export { usePartyPinInteraction };
