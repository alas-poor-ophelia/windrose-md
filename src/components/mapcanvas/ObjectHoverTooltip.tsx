/**
 * ObjectHoverTooltip.tsx
 *
 * Cursor-following label for the object under the pointer. It is the only
 * subscriber to the hover context, so a mousemove over an object re-renders
 * this tiny component instead of ObjectLayer and every selection consumer
 * (REACT-01).
 */

import type { VNode } from 'preact';
import { useHoverState } from '../../context/MapSelectionContext';
import { Z_INDEX } from '../../core/dmtConstants';

const ObjectHoverTooltip = (): VNode | null => {
  const { hoveredObject, mousePosition } = useHoverState();

  if (!hoveredObject || !mousePosition || hoveredObject.type === 'note_pin') return null;

  return (
    <div
      className="windrose-object-tooltip"
      style={{
        position: 'absolute',
        left: mousePosition.x + 20,
        top: mousePosition.y + 25,
        pointerEvents: 'none',
        zIndex: Z_INDEX.INTERACTIVE_LAYER
      }}
    >
      {hoveredObject.customTooltip != null && hoveredObject.customTooltip !== ''
        ? `${hoveredObject.label} - ${hoveredObject.customTooltip}`
        : hoveredObject.label
      }
    </div>
  );
};

export { ObjectHoverTooltip };
