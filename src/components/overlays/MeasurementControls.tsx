/**
 * MeasurementControls.tsx
 *
 * Floating controls card for the measure tool, shown while a route is being
 * measured. Sits statically at the top-center of the canvas container (the
 * route's live end chases the cursor, so anchoring to it would too) and
 * offers the editing affordances touch input needs on-screen:
 * remove last waypoint, clear all, recategorize terrain, and save-as-route.
 *
 * When enabled travel packs offer travel modes, the card grows a Travel
 * block: live travel times for the map's selected modes (explicit guidance
 * lines when a mode's units cannot be reconciled — never silent wrong
 * numbers), plus a collapsible selector for per-map modes and allowance.
 *
 * With weather and a day length, the times come from the forecast walk and
 * the card adds the itinerary (one row per travel day: glyph, day, distance
 * made, weather, hours lost) and a "Leave on" departure window (the next
 * seven departure days with their total time, the fastest highlighted;
 * clicking one sets the departure day).
 */

import type { VNode } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';

import { CornerBrackets } from '../shared/CornerBrackets';
import { Icon } from '../shared/Icon';
import { Z_INDEX } from '../../core/dmtConstants';
import { tooltipRef } from '../shared/obsidianTooltip';
import { mountGlyphSvg } from '../../weather/svgGlyph';

/** One computed travel-time line (or an explicit unit-guidance line) */
interface TravelTimeLine {
  modeId: string;
  name: string;
  text: string;
  isError: boolean;
  /** Extra time the weather costs over fair weather, e.g. "+5 h for weather" */
  weatherDelta?: string;
}

/** One travel day of the forecast walk */
interface ItineraryDay {
  day: number;
  /** The weather plugin's day label */
  label: string;
  /** The glyph of the day's slowest weather area (an SVG string from the weather plugin) */
  glyphSvg: string | null;
  /** Distance made, with unit */
  distance: string;
  /** Weather met that day, e.g. "Heavy rain, Gale"; null = fair */
  weather: string | null;
  /** Hours lost to weather; null when none */
  hoursLost: string | null;
}

/** One day of the departure window */
interface DepartureChip {
  day: number;
  label: string;
  /** Total travel time leaving that day */
  time: string;
  /** Fastest of the window */
  best: boolean;
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
  /** Weather already folded into the travel lines, e.g. "Heavy snow, Gale (+28%)"; null = none */
  weatherNote?: string | null;
  /** Forecast itinerary, one entry per travel day (empty = none) */
  itinerary?: ItineraryDay[];
  /** The mode the itinerary and departure window are costed for */
  itineraryModeName?: string;
  /** Departure window (empty = none) */
  departures?: DepartureChip[];
  /** The departure day in effect */
  departureDay?: number | null;
  onDepartureChange?: (day: number) => void;
  /** All modes offered by enabled packs (empty = no travel block) */
  modeOptions?: TravelModeOption[];
  /** All allowances offered by enabled packs */
  allowanceOptions?: TravelAllowanceOption[];
  selectedAllowanceId?: string | null;
  onToggleMode?: (modeId: string, selected: boolean) => void;
  onAllowanceChange?: (allowanceId: string | null) => void;
  /** Store the current selection as the global default for new/unset maps */
  onSetAsDefault?: () => void;
  onRemoveLast: () => void;
  onClear: () => void;
  onSaveRoute: () => void;
  /**
   * Re-sample every segment's terrain from the map, hand-picked segments
   * included. Undefined hides the action (no terrains, or nothing to sample).
   */
  onRecategorize?: () => void;
}

/** The weather plugin's glyph, parsed and checked before it touches the DOM */
const WeatherGlyph = ({ svg }: { svg: string | null }): VNode => {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  useLayoutEffect(() => {
    if (hostRef.current != null) mountGlyphSvg(hostRef.current, svg);
  }, [svg]);
  return <span ref={hostRef} className="windrose-measure-itinerary-glyph" aria-hidden="true" />;
};

const MeasurementControls = ({
  waypointCount,
  formattedTotal,
  travelLines = [],
  weatherNote = null,
  itinerary = [],
  itineraryModeName = '',
  departures = [],
  departureDay = null,
  onDepartureChange,
  modeOptions = [],
  allowanceOptions = [],
  selectedAllowanceId = null,
  onToggleMode,
  onAllowanceChange,
  onSetAsDefault,
  onRemoveLast,
  onClear,
  onSaveRoute,
  onRecategorize
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
            ref={tooltipRef('Remove last waypoint (Backspace)')}
            aria-label="Remove last waypoint"
            onClick={onRemoveLast}
          >
            <Icon icon="lucide-undo-2" size={14} />
          </button>
          <button
            type="button"
            className="windrose-measure-controls-btn"
            ref={tooltipRef('Clear measurement (Escape)')}
            aria-label="Clear measurement"
            onClick={onClear}
          >
            <Icon icon="lucide-x" size={14} />
          </button>
          {onRecategorize != null && (
            <button
              type="button"
              className="windrose-measure-controls-btn"
              ref={tooltipRef('Recategorize terrain from the map')}
              aria-label="Recategorize terrain"
              onClick={onRecategorize}
            >
              <Icon icon="lucide-wand-2" size={14} />
            </button>
          )}
          <button
            type="button"
            className="windrose-measure-controls-btn windrose-measure-controls-save"
            ref={tooltipRef(canSave ? 'Save as route' : 'Add at least two waypoints to save')}
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
                ref={line.isError ? tooltipRef(line.text) : undefined}
              >
                {line.isError && <Icon icon="lucide-alert-triangle" size={11} />}
                <span className="windrose-measure-controls-travel-name">{line.name}</span>
                <span className="windrose-measure-controls-travel-time">
                  {line.isError ? 'units mismatch' : line.text}
                </span>
                {!line.isError && line.weatherDelta != null && (
                  <span className="windrose-measure-controls-travel-delta">{line.weatherDelta}</span>
                )}
              </div>
            ))}
            {travelLines.some(l => l.isError) && (
              <div className="windrose-measure-controls-travel-hint">
                {travelLines.find(l => l.isError)?.text}
              </div>
            )}
            {weatherNote != null && weatherNote !== '' && itinerary.length === 0 && travelLines.some(l => !l.isError) && (
              <div
                className="windrose-measure-controls-travel-weather"
                ref={tooltipRef('Weather along this route, included in the times above')}
              >
                <Icon icon="lucide-cloud-sun" size={11} />
                <span>{weatherNote}</span>
              </div>
            )}

            {itinerary.length > 0 && travelLines.some(l => !l.isError) && (
              <div className="windrose-measure-itinerary" aria-label="Itinerary">
                {itineraryModeName !== '' && travelLines.filter(l => !l.isError).length > 1 && (
                  <div className="windrose-measure-itinerary-caption">{itineraryModeName}</div>
                )}
                {itinerary.map((entry, i) => (
                  <div key={entry.day} className="windrose-measure-itinerary-day">
                    <span className="windrose-measure-itinerary-index">{`D${i + 1}`}</span>
                    <WeatherGlyph svg={entry.glyphSvg} />
                    <span className="windrose-measure-itinerary-label">{entry.label}</span>
                    <span className="windrose-measure-itinerary-distance">{entry.distance}</span>
                    {entry.weather != null && (
                      <span className="windrose-measure-itinerary-weather">{entry.weather}</span>
                    )}
                    {entry.hoursLost != null && (
                      <span className="windrose-measure-itinerary-lost">{`−${entry.hoursLost}`}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {departures.length > 0 && onDepartureChange != null && (
              <div className="windrose-measure-departures">
                <span className="windrose-measure-departures-title">Leave on</span>
                <div className="windrose-measure-departures-chips">
                  {departures.map(chip => (
                    <button
                      key={chip.day}
                      type="button"
                      className={`windrose-measure-departure${chip.best ? ' is-best' : ''}${chip.day === departureDay ? ' is-selected' : ''}`}
                      aria-pressed={chip.day === departureDay}
                      ref={tooltipRef(chip.best ? `${chip.label}: ${chip.time}, the fastest start` : `${chip.label}: ${chip.time}`)}
                      onClick={() => onDepartureChange(chip.day)}
                    >
                      <span className="windrose-measure-departure-day">{chip.label}</span>
                      <span className="windrose-measure-departure-time">{chip.time}</span>
                    </button>
                  ))}
                </div>
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
                      {allowanceOptions.map(option => (
                        <option key={option.id} value={option.id}>{option.name}</option>
                      ))}
                      <option value="">No day length</option>
                    </select>
                  </label>
                )}
                {onSetAsDefault != null && (
                  <button
                    type="button"
                    className="windrose-measure-controls-travel-toggle"
                    ref={tooltipRef('Use this travel selection as the default for new maps')}
                    aria-label="Set as default for new maps"
                    onClick={onSetAsDefault}
                  >
                    <Icon icon="lucide-star" size={12} />
                    <span>Set as default for new maps</span>
                  </button>
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
export type { TravelTimeLine, TravelModeOption, TravelAllowanceOption, ItineraryDay, DepartureChip };
