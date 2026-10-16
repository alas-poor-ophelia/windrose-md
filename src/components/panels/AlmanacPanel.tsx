/**
 * AlmanacPanel.tsx
 *
 * The weather instrument for the current map: pick a weather area, read the
 * view day's (or view hour's) weather, look a week ahead, and move the
 * store's VIEW TIME with a day scrubber, an hour slider and a time-lapse.
 * The map's weather overlay, Sky and compass follow the view time, so the
 * panel drives the whole map, not only itself. "Advance a day" moves the
 * world's calendar through the weather plugin (only when it allows it).
 *
 * Reads everything from the per-map weather store (useWeatherStore); hosts
 * offer it only while the store is available and the map has weather areas.
 * Glyph SVG from the weather plugin is rendered through svgGlyph.ts (parsed
 * as image/svg+xml, rejected when active, never innerHTML).
 */

import type { VNode } from 'preact';
import type { WeatherArea, WeatherStore } from '#types/contexts/weather.types';
import type { WadjetReport } from '#types/integrations/wadjet.types';
import type { GroundState } from '../../weather/groundState';

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Notice } from 'obsidian';
import { Icon } from '../shared/Icon';
import { CornerBrackets } from '../shared/CornerBrackets';
import { tooltipRef } from '../shared/obsidianTooltip';
import { useWeatherStore } from '../../context/WeatherContext';
import { mountGlyphSvg } from '../../weather/svgGlyph';

/** Day scrubber reach, in days from today */
const SCRUB_MIN_DAY = -3;
const SCRUB_MAX_DAY = 7;
const STRIP_DAYS = 7;
/** Time-lapse step (one hour per step) */
const PLAY_STEP_MS = 250;
const PLAY_STEP_REDUCED_MS = 1000;

interface AlmanacPanelProps {
  /** Selected weather area id (controlled); null/undefined = the default area */
  areaId?: string | null;
  onAreaChange?: (areaId: string) => void;
  /** False while the host hides the panel (rail folded, section collapsed): stops the time-lapse */
  active?: boolean;
}

// ===========================================
// Formatting
// ===========================================

type Units = WeatherStore['units'];

function formatTemp(celsius: number | undefined, units: Units): string {
  if (celsius == null || !Number.isFinite(celsius)) return '–';
  const value = units === 'imperial' ? celsius * 9 / 5 + 32 : celsius;
  const rounded = Math.round(value);
  // A true minus sign, matching the weather plugin's own wording
  return rounded < 0 ? `−${-rounded}°` : `${rounded}°`;
}

function formatAmount(mm: number, units: Units): string {
  if (!Number.isFinite(mm) || mm <= 0) return '';
  if (units === 'imperial') {
    const inches = mm / 25.4;
    return `${inches < 0.1 ? inches.toFixed(2) : inches.toFixed(1)} in`;
  }
  return `${mm < 10 ? mm.toFixed(1) : Math.round(mm)} mm`;
}

function formatDepth(cm: number, units: Units): string {
  return units === 'imperial' ? `${Math.round(cm / 2.54)} in` : `${Math.round(cm)} cm`;
}

function sentence(text: string): string {
  const spaced = text.replace(/-/g, ' ');
  return spaced.length > 0 ? spaced[0].toUpperCase() + spaced.slice(1) : spaced;
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function relativeDay(offset: number): string {
  if (offset === 0) return 'Today';
  return offset > 0 ? `+${offset}` : `−${-offset}`;
}

function relativeDayLong(offset: number): string {
  if (offset === 0) return 'Today';
  const n = Math.abs(offset);
  const days = n === 1 ? 'day' : 'days';
  return offset > 0 ? `In ${n} ${days}` : `${n} ${days} ago`;
}

function groundText(ground: GroundState | null, units: Units): string | null {
  if (ground == null) return null;
  const label = sentence(ground.label);
  if (ground.snowDepthCm >= 1) return `${label}, ${formatDepth(ground.snowDepthCm, units)}`;
  return label;
}

/** Lucide stand-in when the plugin has no glyph (0.3.x) or it was rejected */
function fallbackIcon(report: WadjetReport): string {
  switch (report.precipitation.type) {
    case 'snow': return 'lucide-cloud-snow';
    case 'sleet': return 'lucide-cloud-hail';
    case 'rain': return 'lucide-cloud-rain';
    case 'drizzle': return 'lucide-cloud-drizzle';
    default:
      if (report.cloudCover >= 0.75) return 'lucide-cloud';
      return report.cloudCover >= 0.3 ? 'lucide-cloud-sun' : 'lucide-sun';
  }
}

function prefersReducedMotion(doc: Document | null | undefined): boolean {
  const win = doc?.defaultView ?? null;
  return win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

// ===========================================
// Glyph
// ===========================================

/** The weather plugin's glyph, safely mounted; a lucide icon when it has none */
const WeatherGlyph = ({ store, report, size }: { store: WeatherStore; report: WadjetReport; size: number }): VNode => {
  const hostRef = useRef<HTMLSpanElement>(null);
  const svg = store.glyphSvg(report);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (host == null) return;
    const ok = mountGlyphSvg(host, svg);
    if (ok) {
      const node = host.firstElementChild;
      node?.setAttribute('width', String(size));
      node?.setAttribute('height', String(size));
    }
    setMounted(ok);
  }, [svg, size]);

  return (
    <span className="windrose-almanac-glyph" style={{ width: size, height: size }}>
      <span ref={hostRef} className="windrose-almanac-glyph-svg" />
      {!mounted && <Icon icon={fallbackIcon(report)} size={Math.round(size * 0.8)} />}
    </span>
  );
};

// ===========================================
// Panel
// ===========================================

function defaultArea(areas: WeatherArea[]): WeatherArea | null {
  return areas.find(area => area.kind === 'map') ?? areas[0] ?? null;
}

const AlmanacPanel = ({ areaId, onAreaChange, active = true }: AlmanacPanelProps): VNode => {
  const store = useWeatherStore();
  const { areas, units, today, viewTime } = store;

  // Area: controlled by the host when it passes onAreaChange, else local
  const [localAreaId, setLocalAreaId] = useState<string | null>(null);
  const wantedId = onAreaChange != null ? areaId ?? null : localAreaId;
  const area = areas.find(a => a.id === wantedId) ?? defaultArea(areas);
  const selectArea = useCallback((id: string) => {
    if (onAreaChange != null) onAreaChange(id);
    else setLocalAreaId(id);
  }, [onAreaChange]);

  const viewDay = store.viewDay;
  const zoneId = area?.zoneId ?? null;

  // The store object changes identity with every version bump, so it is the dependency
  const daily = useMemo(
    () => (zoneId != null && viewDay != null ? store.report(zoneId, viewDay) : null),
    [store, zoneId, viewDay]
  );
  const hourly = useMemo(
    () => (zoneId != null && viewDay != null && viewTime.hour != null ? store.report(zoneId, viewDay, viewTime.hour) : null),
    [store, zoneId, viewDay, viewTime.hour]
  );
  const shown = hourly ?? daily;
  const classification = useMemo(() => (shown != null ? store.classify(shown) : null), [store, shown]);
  const ground = useMemo(
    () => (zoneId != null && viewDay != null ? store.ground(zoneId, viewDay) : null),
    [store, zoneId, viewDay]
  );
  const week = useMemo(
    () => (zoneId != null && viewDay != null ? store.range(zoneId, viewDay, viewDay + STRIP_DAYS - 1) : []),
    [store, zoneId, viewDay]
  );

  // ---- Time-lapse ----
  const [playing, setPlaying] = useState(false);
  const storeRef = useRef(store);
  storeRef.current = store;
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) setPlaying(false);
  }, [active]);

  useEffect(() => {
    if (!playing) return undefined;
    const doc = rootRef.current?.ownerDocument ?? activeDocument;
    const win = doc.defaultView ?? activeWindow;
    const stepMs = prefersReducedMotion(doc) ? PLAY_STEP_REDUCED_MS : PLAY_STEP_MS;
    const timer = win.setInterval(() => {
      const current = storeRef.current.viewTime;
      const hour = current.hour == null ? 0 : current.hour + 1;
      if (hour < 24) {
        storeRef.current.setViewTime({ hour });
        return;
      }
      if (current.dayOffset >= SCRUB_MAX_DAY) {
        setPlaying(false);
        return;
      }
      storeRef.current.setViewTime({ dayOffset: current.dayOffset + 1, hour: 0 });
    }, stepMs);
    return () => win.clearInterval(timer);
  }, [playing]);

  const togglePlay = useCallback(() => {
    setPlaying(prev => {
      if (!prev) {
        const current = storeRef.current.viewTime;
        // At the very end, start again from today's dawn
        if (current.dayOffset >= SCRUB_MAX_DAY && current.hour === 23) storeRef.current.setViewTime({ dayOffset: 0, hour: 0 });
        else if (current.hour == null) storeRef.current.setViewTime({ hour: 0 });
      }
      return !prev;
    });
  }, []);

  const resetToday = useCallback(() => {
    setPlaying(false);
    store.setViewTime({ dayOffset: 0, hour: null });
  }, [store]);

  const advanceDay = useCallback(() => {
    void store.advance(1).then(ok => {
      if (!ok) new Notice('The calendar did not move. Its owner may not allow other plugins to change the date.');
    });
  }, [store]);

  const onDayInput = useCallback((e: Event) => {
    const value = Number((e.currentTarget as HTMLInputElement).value);
    if (Number.isInteger(value)) store.setViewTime({ dayOffset: value });
  }, [store]);

  const onHourInput = useCallback((e: Event) => {
    const value = Number((e.currentTarget as HTMLInputElement).value);
    if (Number.isInteger(value)) store.setViewTime({ hour: value });
  }, [store]);

  const toggleAllDay = useCallback(() => {
    setPlaying(false);
    store.setViewTime({ hour: viewTime.hour == null ? 12 : null });
  }, [store, viewTime.hour]);

  // ---- Empty states ----
  if (!store.available || area == null) {
    return (
      <div className="windrose-almanac windrose-almanac-empty">
        <Icon icon="lucide-cloud-off" size={16} />
        <span>No weather for this map. Bind a region or the whole map to a weather zone.</span>
      </div>
    );
  }

  const dayLabel = viewDay != null ? store.formatDay(viewDay) : 'No current day';
  const offset = viewTime.dayOffset;
  const scrubMin = Math.min(SCRUB_MIN_DAY, offset);
  const scrubMax = Math.max(SCRUB_MAX_DAY, offset);
  const hourValue = viewTime.hour ?? 12;
  const allDay = viewTime.hour == null;
  const temps = shown?.temperature;
  const current = hourly?.temperature.current ?? hourly?.temperature.mean;
  const groundLine = groundText(ground, units);
  const maxAmount = Math.max(1, ...week.map(r => r.precipitation.amountMm));

  return (
    <div ref={rootRef} className="windrose-almanac" role="group" aria-label="Almanac">
      <CornerBrackets classPrefix="windrose-almanac-bracket" variant="minimal" filterId="almanac-bracket" />

      {/* Area */}
      <div className="windrose-almanac-area">
        <Icon icon="lucide-map-pin" size={12} />
        {areas.length > 1 ? (
          <select
            className="dropdown windrose-almanac-area-select"
            value={area.id}
            aria-label="Weather area"
            onChange={(e) => selectArea(e.currentTarget.value)}
          >
            {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        ) : (
          <span className="windrose-almanac-area-name">{area.name}</span>
        )}
      </div>

      {/* Hero: the view day / hour */}
      <div className="windrose-almanac-hero">
        <div className="windrose-almanac-when">
          <span className="windrose-almanac-day">{dayLabel}</span>
          <span className="windrose-almanac-when-sub">
            {relativeDayLong(offset)} · {allDay ? 'All day' : formatHour(viewTime.hour ?? 0)}
          </span>
        </div>
        {shown != null ? (
          <div className="windrose-almanac-hero-body">
            <WeatherGlyph store={store} report={shown} size={56} />
            <div className="windrose-almanac-temps">
              <span className="windrose-almanac-temp-now">{formatTemp(hourly != null ? current : temps?.mean, units)}</span>
              <span className="windrose-almanac-temp-range">
                <span className="is-high">High {formatTemp(temps?.high, units)}</span>
                <span className="is-low">Low {formatTemp(temps?.low, units)}</span>
              </span>
            </div>
          </div>
        ) : (
          <div className="windrose-almanac-missing">No report for this zone.</div>
        )}
        {shown != null && <div className="windrose-almanac-describe">{store.describe(shown)}</div>}
      </div>

      {/* Readings */}
      {shown != null && classification != null && (
        <dl className="windrose-almanac-facts">
          <div>
            <dt><Icon icon="lucide-thermometer" size={12} />Feels like</dt>
            <dd>{formatTemp(classification.feelsLike.current ?? classification.feelsLike.mean, units)}</dd>
          </div>
          <div>
            <dt><Icon icon="lucide-wind" size={12} />Wind</dt>
            <dd>
              <span className="windrose-almanac-beaufort" aria-label={`Force ${classification.beaufort}`}>{classification.beaufort}</span>
              {classification.beaufortLabel}{classification.beaufort > 0 ? ` from ${classification.compass}` : ''}
            </dd>
          </div>
          <div>
            <dt><Icon icon="lucide-eye" size={12} />Visibility</dt>
            <dd>{sentence(classification.visibility)}</dd>
          </div>
          {groundLine != null && (
            <div>
              <dt><Icon icon="lucide-mountain-snow" size={12} />Ground</dt>
              <dd>{groundLine}</dd>
            </div>
          )}
        </dl>
      )}

      {/* Week strip */}
      {week.length > 0 && today != null && (
        <div className="windrose-almanac-week" role="group" aria-label="Seven days">
          {week.map(report => {
            const dayOffset = report.dayOrdinal - today;
            const selected = report.dayOrdinal === viewDay;
            const amount = formatAmount(report.precipitation.amountMm, units);
            return (
              <button
                key={report.dayOrdinal}
                className={`windrose-almanac-week-day${selected ? ' is-selected' : ''}${dayOffset === 0 ? ' is-today' : ''}`}
                aria-pressed={selected}
                aria-label={`${store.formatDay(report.dayOrdinal)}: ${store.describe(report)}`}
                ref={tooltipRef(`${store.formatDay(report.dayOrdinal)}\n${store.describe(report)}`)}
                onClick={() => store.setViewTime({ dayOffset })}
              >
                <span className="windrose-almanac-week-label">{relativeDay(dayOffset)}</span>
                <WeatherGlyph store={store} report={report} size={22} />
                <span className="windrose-almanac-week-high">{formatTemp(report.temperature.high, units)}</span>
                <span className="windrose-almanac-week-low">{formatTemp(report.temperature.low, units)}</span>
                <span className="windrose-almanac-week-precip" aria-hidden="true">
                  <span style={{ height: `${Math.round(Math.min(1, report.precipitation.amountMm / maxAmount) * 100)}%` }} />
                </span>
                <span className="windrose-almanac-week-amount">{amount !== '' ? amount : ' '}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Time controls */}
      <div className="windrose-almanac-time">
        <label className="windrose-almanac-slider">
          <span className="windrose-almanac-slider-label">Day</span>
          <input
            type="range"
            min={scrubMin}
            max={scrubMax}
            step={1}
            value={offset}
            aria-valuetext={relativeDayLong(offset)}
            onInput={onDayInput}
          />
          <span className="windrose-almanac-slider-value">{relativeDay(offset)}</span>
        </label>
        <label className={`windrose-almanac-slider${allDay ? ' is-all-day' : ''}`}>
          <span className="windrose-almanac-slider-label">Hour</span>
          <input
            type="range"
            min={0}
            max={23}
            step={1}
            value={hourValue}
            aria-valuetext={allDay ? 'All day' : formatHour(hourValue)}
            onInput={onHourInput}
          />
          <span className="windrose-almanac-slider-value">{allDay ? 'All' : formatHour(hourValue)}</span>
        </label>

        <div className="windrose-almanac-actions">
          <button
            className={`windrose-almanac-btn${playing ? ' is-on' : ''}`}
            onClick={togglePlay}
            aria-pressed={playing}
            ref={tooltipRef(playing ? 'Stop the time-lapse' : 'Play the hours as a time-lapse')}
          >
            <Icon icon={playing ? 'lucide-square' : 'lucide-play'} size={13} />
            <span>{playing ? 'Stop' : 'Play'}</span>
          </button>
          <button
            className={`windrose-almanac-btn${allDay ? ' is-on' : ''}`}
            onClick={toggleAllDay}
            aria-pressed={allDay}
            ref={tooltipRef(allDay ? 'Show one hour' : 'Show the whole day')}
          >
            <Icon icon="lucide-sun-moon" size={13} />
            <span>All day</span>
          </button>
          <button
            className="windrose-almanac-btn"
            onClick={resetToday}
            disabled={offset === 0 && allDay}
            ref={tooltipRef('Back to today, all day')}
          >
            <Icon icon="lucide-calendar-check" size={13} />
            <span>Today</span>
          </button>
        </div>
        {store.canAdvance && (
          <button
            className="windrose-almanac-btn windrose-almanac-advance"
            onClick={advanceDay}
            ref={tooltipRef("Move the world's calendar forward one day")}
          >
            <Icon icon="lucide-calendar-plus" size={13} />
            <span>Advance a day</span>
          </button>
        )}
      </div>
    </div>
  );
};

export { AlmanacPanel };
export type { AlmanacPanelProps };
