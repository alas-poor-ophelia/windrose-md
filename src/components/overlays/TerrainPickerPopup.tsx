/**
 * TerrainPickerPopup.tsx
 *
 * Small transient popup for assigning a terrain to a measurement route
 * segment, anchored at the clicked segment's midpoint. Lists every terrain
 * from enabled travel packs, plus a Clear button (shown only when the
 * segment already has a terrain) that unassigns it back to plain mode
 * speed. Click-outside and Escape dismiss (AnchoredPopup).
 */

import type { VNode } from 'preact';
import { AnchoredPopup } from './AnchoredPopup';

const DEFAULT_SWATCH = '#a8a29e';

interface TerrainPickerOption {
  id: string;
  name: string;
  color?: string;
  /** Multiplier shown as a hint (×0.5, ×1.25) */
  multiplier: number;
}

interface TerrainPickerPopupProps {
  /** Anchor position, container-relative (the clicked point on the segment) */
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
  return (
    <AnchoredPopup x={x} y={y} className="windrose-terrain-picker" filterId="terrain-picker-bracket" onClose={onClose}>
      <div className="windrose-terrain-picker-title">Segment terrain</div>
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
      {currentTerrainId != null && (
        <button
          type="button"
          className="windrose-terrain-picker-clear"
          onClick={() => onPick(null)}
        >
          Clear
        </button>
      )}
    </AnchoredPopup>
  );
};

export { TerrainPickerPopup };

