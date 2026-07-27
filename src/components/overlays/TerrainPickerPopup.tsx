/**
 * TerrainPickerPopup.tsx
 *
 * Small transient popup for assigning a terrain to a measurement route
 * segment, anchored at the clicked segment's midpoint. Lists every terrain
 * from enabled travel packs plus an explicit "None" (unassigned = plain
 * mode speed). Click-outside dismisses.
 */

import type { VNode } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

import { CornerBrackets } from '../shared/CornerBrackets';
import { Z_INDEX } from '../../core/dmtConstants';

const DEFAULT_SWATCH = '#a8a29e';

interface TerrainPickerOption {
  id: string;
  name: string;
  color?: string;
  /** Multiplier shown as a hint (×0.5, ×1.25) */
  multiplier: number;
}

interface TerrainPickerPopupProps {
  /** Anchor position, container-relative (segment midpoint) */
  x: number;
  y: number;
  options: TerrainPickerOption[];
  currentTerrainId: string | null;
  onPick: (terrainId: string | null) => void;
  onClose: () => void;
}

const TerrainPickerPopup = ({
  x,
  y,
  options,
  currentTerrainId,
  onPick,
  onClose
}: TerrainPickerPopupProps): VNode => {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (e: PointerEvent): void => {
      if (rootRef.current != null && e.target instanceof Node && !rootRef.current.contains(e.target)) {
        onClose();
      }
    };
    // Deferred so the opening click does not immediately dismiss
    const id = window.setTimeout(() => activeDocument.addEventListener('pointerdown', handler, true), 0);
    return () => {
      window.clearTimeout(id);
      activeDocument.removeEventListener('pointerdown', handler, true);
    };
  }, [onClose]);

  return (
    <div
      ref={rootRef}
      className="windrose-selection-card windrose-terrain-picker"
      style={{
        left: `${x}px`,
        top: `${y + 10}px`,
        zIndex: Z_INDEX.DRAWING_LAYER + 2
      }}
    >
      <CornerBrackets classPrefix="windrose-selection-card-bracket" variant="minimal" filterId="terrain-picker-bracket" />
      <div className="windrose-selection-card-content">
        <div className="windrose-terrain-picker-title">Segment terrain</div>
        <button
          type="button"
          className={`windrose-terrain-picker-item ${currentTerrainId == null ? 'is-active' : ''}`}
          onClick={() => onPick(null)}
        >
          <span className="windrose-terrain-picker-swatch windrose-terrain-picker-swatch-none" />
          <span>None</span>
          <span className="windrose-terrain-picker-mult">×1</span>
        </button>
        {options.map(option => (
          <button
            key={option.id}
            type="button"
            className={`windrose-terrain-picker-item ${currentTerrainId === option.id ? 'is-active' : ''}`}
            onClick={() => onPick(option.id)}
          >
            <span
              className="windrose-terrain-picker-swatch"
              style={{ backgroundColor: option.color ?? DEFAULT_SWATCH }}
            />
            <span>{option.name}</span>
            <span className="windrose-terrain-picker-mult">×{option.multiplier}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export { TerrainPickerPopup };
export type { TerrainPickerOption };
