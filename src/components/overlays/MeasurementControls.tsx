/**
 * MeasurementControls.tsx
 *
 * Floating controls card for the measure tool, shown while a route is being
 * measured. Sits statically at the top-center of the canvas container (the
 * route's live end chases the cursor, so anchoring to it would too) and
 * offers the editing affordances touch input needs on-screen:
 * remove last waypoint, clear all, and save-as-route.
 *
 * When enabled travel packs offer travel modes, the card grows a Travel
 * block: live travel times for the map's selected modes (explicit guidance
 * lines when a mode's units cannot be reconciled — never silent wrong
 * numbers), plus a collapsible selector for per-map modes and allowance.
 */

import type { VNode } from 'preact';
import { useState } from 'preact/hooks';

import { CornerBrackets } from '../shared/CornerBrackets';
import { Icon } from '../shared/Icon';
import { Z_INDEX } from '../../core/dmtConstants';

/** One computed travel-time line (or an explicit unit-guidance line) */
interface TravelTimeLine {
  modeId: string;
  name: string;
  text: string;
  isError: boolean;
}

/** A selectable travel mode from an enabled pack */
interface TravelModeOption {
  id: string;
  name: string;
  packName: string;
  selected: boolean;
}

/** A selectable per-day allowance from an enabled pack */
interface TravelAllowanceOption {
  id: string;
  name: string;
}

interface MeasurementControlsProps {
  /** Number of committed waypoints (save needs >= 2) */
  waypointCount: number;
  /** Formatted running total shown in the card header */
  formattedTotal: string | null;
  /** Computed travel-time lines for the map's selected modes */
  travelLines?: TravelTimeLine[];
  /** All modes offered by enabled packs (empty = no travel block) */
  modeOptions?: TravelModeOption[];
  /** All allowances offered by enabled packs */
  allowanceOptions?: TravelAllowanceOption[];
  selectedAllowanceId?: string | null;
  onToggleMode?: (modeId: string, selected: boolean) => void;
  onAllowanceChange?: (allowanceId: string | null) => void;
  onRemoveLast: () => void;
  onClear: () => void;
  onSaveRoute: () => void;
}

const MeasurementControls = ({
  waypointCount,
  formattedTotal,
  travelLines = [],
  modeOptions = [],
  allowanceOptions = [],
  selectedAllowanceId = null,
  onToggleMode,
  onAllowanceChange,
  onRemoveLast,
  onClear,
  onSaveRoute
}: MeasurementControlsProps): VNode | null => {
  const [travelExpanded, setTravelExpanded] = useState(false);

  if (waypointCount === 0) return null;

  const canSave = waypointCount >= 2;
  const hasTravel = modeOptions.length > 0;
  const multiPack = new Set(modeOptions.map(o => o.packName)).size > 1;

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

        {hasTravel && (
          <div className="windrose-measure-controls-travel">
            {travelLines.map(line => (
              <div
                key={line.modeId}
                className={`windrose-measure-controls-travel-line ${line.isError ? 'is-error' : ''}`}
                title={line.isError ? line.text : undefined}
              >
                {line.isError && <Icon icon="lucide-alert-triangle" size={11} />}
                <span className="windrose-measure-controls-travel-name">{line.name}</span>
                <span className="windrose-measure-controls-travel-time">
                  {line.isError ? 'units mismatch' : line.text}
                </span>
              </div>
            ))}
            {travelLines.some(l => l.isError) && (
              <div className="windrose-measure-controls-travel-hint">
                {travelLines.find(l => l.isError)?.text}
              </div>
            )}

            <button
              type="button"
              className={`windrose-measure-controls-travel-toggle ${travelExpanded ? 'expanded' : ''}`}
              onClick={() => setTravelExpanded(!travelExpanded)}
            >
              <Icon icon="lucide-footprints" size={12} />
              <span>Travel modes</span>
              <Icon icon={travelExpanded ? 'lucide-chevron-up' : 'lucide-chevron-down'} size={12} />
            </button>

            {travelExpanded && (
              <div className="windrose-measure-controls-travel-config">
                {modeOptions.map(option => (
                  <label key={option.id} className="windrose-measure-controls-travel-mode">
                    <input
                      type="checkbox"
                      checked={option.selected}
                      onChange={(e) => onToggleMode?.(option.id, (e.target as HTMLInputElement).checked)}
                    />
                    <span>{multiPack ? `${option.name} (${option.packName})` : option.name}</span>
                  </label>
                ))}
                {allowanceOptions.length > 0 && (
                  <label className="windrose-measure-controls-travel-allowance">
                    <span>Day length</span>
                    <select
                      value={selectedAllowanceId ?? ''}
                      onChange={(e) => {
                        const value = (e.target as HTMLSelectElement).value;
                        onAllowanceChange?.(value === '' ? null : value);
                      }}
                    >
                      <option value="">None</option>
                      {allowanceOptions.map(option => (
                        <option key={option.id} value={option.id}>{option.name}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export { MeasurementControls };
export type { TravelTimeLine, TravelModeOption, TravelAllowanceOption };
