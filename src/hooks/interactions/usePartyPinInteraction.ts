/**
 * usePartyPinInteraction.ts
 *
 * Party pin tool behavior. First press places the pin at the pressed cell;
 * with a pin present, pressing moves it there and dragging carries it live
 * so the range ring follows. Intermediate drag positions suppress history;
 * release commits the gesture as a single undo step.
 */

// Type-only imports
import type { PartyPin } from '#types/core/map.types';
import type { Point } from '#types/core/geometry.types';

import { useCallback, useRef } from 'preact/hooks';
import { createPartyPin, getPartyPin, movePartyPin, upsertPartyPin } from '../../objects/partyPinOperations';

type PartyPinsChangeHandler = (partyPins: PartyPin[], suppressHistory?: boolean) => void;

interface UsePartyPinInteractionResult {
  handlePartyPinPointerDown: (gridX: number, gridY: number) => void;
  handlePartyPinMove: (gridX: number, gridY: number) => void;
  stopPartyPinDrag: () => void;
}

function usePartyPinInteraction(
  partyPins: PartyPin[] | undefined,
  onPartyPinsChange: PartyPinsChangeHandler
): UsePartyPinInteractionResult {
  // Latest pins without re-registering handlers each render
  const pinsRef = useRef<PartyPin[]>([]);
  pinsRef.current = partyPins ?? [];

  const isDraggingRef = useRef(false);
  // Last dragged cell, committed on release. Kept in a ref because the
  // pins prop can lag one render behind the final suppressed move.
  const dragPositionRef = useRef<Point | null>(null);

  const handlePartyPinPointerDown = useCallback((gridX: number, gridY: number): void => {
    const pins = pinsRef.current;
    const pin = getPartyPin(pins);

    if (!pin) {
      onPartyPinsChange(upsertPartyPin(pins, createPartyPin({ x: gridX, y: gridY })));
      return;
    }

    isDraggingRef.current = true;
    dragPositionRef.current = { x: gridX, y: gridY };
    onPartyPinsChange(movePartyPin(pins, pin.id, { x: gridX, y: gridY }), true);
  }, [onPartyPinsChange]);

  const handlePartyPinMove = useCallback((gridX: number, gridY: number): void => {
    if (!isDraggingRef.current) return;

    const pins = pinsRef.current;
    const pin = getPartyPin(pins);
    if (!pin) {
      isDraggingRef.current = false;
      return;
    }

    const previous = dragPositionRef.current;
    if (previous && previous.x === gridX && previous.y === gridY) return;
    dragPositionRef.current = { x: gridX, y: gridY };
    onPartyPinsChange(movePartyPin(pins, pin.id, { x: gridX, y: gridY }), true);
  }, [onPartyPinsChange]);

  const stopPartyPinDrag = useCallback((): void => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    const pins = pinsRef.current;
    const pin = getPartyPin(pins);
    const finalPosition = dragPositionRef.current;
    dragPositionRef.current = null;
    if (!pin || !finalPosition) return;

    onPartyPinsChange(movePartyPin(pins, pin.id, finalPosition), false);
  }, [onPartyPinsChange]);

  return { handlePartyPinPointerDown, handlePartyPinMove, stopPartyPinDrag };
}

export { usePartyPinInteraction };
