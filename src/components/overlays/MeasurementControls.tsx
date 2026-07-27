/**
 * MeasurementControls.tsx
 *
 * Floating controls card for the measure tool, shown while a route is being
 * measured. Sits statically at the top-center of the canvas container (the
 * route's live end chases the cursor, so anchoring to it would too) and
 * offers the editing affordances touch input needs on-screen:
 * remove last waypoint, clear all, and save-as-route.
 */

import type { VNode } from 'preact';

import { CornerBrackets } from '../shared/CornerBrackets';
import { Icon } from '../shared/Icon';
import { Z_INDEX } from '../../core/dmtConstants';

interface MeasurementControlsProps {
  /** Number of committed waypoints (save needs >= 2) */
  waypointCount: number;
  /** Formatted running total shown in the card header */
  formattedTotal: string | null;
  onRemoveLast: () => void;
  onClear: () => void;
  onSaveRoute: () => void;
}

const MeasurementControls = ({
  waypointCount,
  formattedTotal,
  onRemoveLast,
  onClear,
  onSaveRoute
}: MeasurementControlsProps): VNode | null => {
  if (waypointCount === 0) return null;

  const canSave = waypointCount >= 2;

  return (
    <div
      className="windrose-selection-card windrose-measure-controls"
      style={{ zIndex: Z_INDEX.DRAWING_LAYER + 1 }}
    >
      <CornerBrackets classPrefix="windrose-selection-card-bracket" variant="minimal" filterId="measure-controls-bracket" />
      <div className="windrose-selection-card-content">
        <div className="windrose-measure-controls-row">
          <Icon icon="lucide-ruler" size={14} />
          {formattedTotal != null && formattedTotal !== '' && (
            <span className="windrose-measure-controls-total">{formattedTotal}</span>
          )}
          <button
            type="button"
            className="windrose-measure-controls-btn"
            title="Remove last waypoint (Backspace)"
            aria-label="Remove last waypoint"
            onClick={onRemoveLast}
          >
            <Icon icon="lucide-undo-2" size={14} />
          </button>
          <button
            type="button"
            className="windrose-measure-controls-btn"
            title="Clear measurement (Escape)"
            aria-label="Clear measurement"
            onClick={onClear}
          >
            <Icon icon="lucide-x" size={14} />
          </button>
          <button
            type="button"
            className="windrose-measure-controls-btn windrose-measure-controls-save"
            title={canSave ? 'Save as route' : 'Add at least two waypoints to save'}
            aria-label="Save as route"
            disabled={!canSave}
            onClick={onSaveRoute}
          >
            <Icon icon="lucide-route" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export { MeasurementControls };
