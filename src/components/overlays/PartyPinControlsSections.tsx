/**
 * PartyPinControlsSections.tsx
 *
 * The beacon controls card's collapsible sections, extracted from
 * PartyPinControls: filters & related (layer scope, tag/prop filters,
 * related mode), the beacon note block, and the nearby-results list.
 * Each section owns its own draft state; committed changes flow up
 * through a single `updatePin` callback so sections never touch the
 * pins array directly. Markup is verbatim from the original card —
 * E2E selects on these class names.
 */

import { useEffect, useState } from 'preact/hooks';
import type { VNode } from 'preact';
import type { Point } from '#types/core/geometry.types';
import type { MapData, PartyPin, PartyRelatedMode } from '#types/core/map.types';

import type { PartyRangeResults } from '../../objects/partyRangeQuery';

import {
  parseTagFilters,
  formatTagFilters,
  parsePropertyFilters,
  formatPropertyFilters
} from '../../objects/partyPinOperations';
import { openNoteInNewTab } from '../../persistence/noteOperations';
import { Icon } from '../shared/Icon';
import { InternalLink } from '../shared/InternalLink';
import { tooltipRef } from '../shared/obsidianTooltip';

/** Commit a draft on Enter, then blur the field */
const commitOnEnter = (e: KeyboardEvent, commit: () => void): void => {
  if (e.key === 'Enter') {
    commit();
    (e.target as HTMLElement).blur();
  }
};

/** Apply a partial update to the card's pin */
type UpdatePin = (updates: Partial<PartyPin>) => void;

// ===========================================
// Filters & related
// ===========================================

interface PartyPinControlsFiltersProps {
  pin: PartyPin;
  layers: MapData['layers'] | undefined;
  updatePin: UpdatePin;
}

const PartyPinControlsFilters = ({ pin, layers, updatePin }: PartyPinControlsFiltersProps): VNode => {
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [tagsDraft, setTagsDraft] = useState(formatTagFilters(pin.filters?.tags));
  const [propsDraft, setPropsDraft] = useState(formatPropertyFilters(pin.filters?.properties));

  // Re-seed drafts when the pin itself changes (placement, undo/redo)
  useEffect(() => {
    setTagsDraft(formatTagFilters(pin.filters?.tags));
    setPropsDraft(formatPropertyFilters(pin.filters?.properties));
  }, [pin.id, pin.filters]);

  const commitTagFilters = (): void => {
    const tags = parseTagFilters(tagsDraft);
    updatePin({ filters: { ...pin.filters, tags: tags.length > 0 ? tags : undefined } });
  };

  const commitPropertyFilters = (): void => {
    const properties = parsePropertyFilters(propsDraft);
    updatePin({ filters: { ...pin.filters, properties: Object.keys(properties).length > 0 ? properties : undefined } });
  };

  const setScopeMode = (mode: 'all' | 'selected'): void => {
    updatePin({ layerScope: { mode, layerIds: pin.layerScope?.layerIds ?? [] } });
  };

  const toggleScopedLayer = (layerId: string, included: boolean): void => {
    const current = pin.layerScope?.layerIds ?? [];
    const layerIds = included ? [...current, layerId] : current.filter(id => id !== layerId);
    updatePin({ layerScope: { mode: 'selected', layerIds } });
  };

  const setRelatedMode = (relatedMode: PartyRelatedMode): void => {
    updatePin({ relatedMode });
  };

  return (
    <div className="windrose-party-controls-filters">
      <button
        className={`windrose-party-controls-filters-toggle ${filtersExpanded ? 'expanded' : ''}`}
        onClick={() => setFiltersExpanded(open => !open)}
      >
        <Icon icon="lucide-filter" size={12} />
        <span>Filters &amp; related</span>
        <Icon icon={filtersExpanded ? 'lucide-chevron-up' : 'lucide-chevron-down'} size={12} />
      </button>

      {filtersExpanded && (
        <>
          <label className="windrose-party-controls-field">
            <span>Layers</span>
            <select
              value={pin.layerScope?.mode ?? 'all'}
              onChange={(e) => setScopeMode((e.target as HTMLSelectElement).value as 'all' | 'selected')}
            >
              <option value="all">All layers</option>
              <option value="selected">Selected layers</option>
            </select>
          </label>
          {pin.layerScope?.mode === 'selected' && (
            <div className="windrose-party-controls-layer-list">
              {(layers ?? []).map(layer => (
                <label key={layer.id} className="windrose-party-controls-layer-item">
                  <input
                    type="checkbox"
                    checked={(pin.layerScope?.layerIds ?? []).includes(layer.id)}
                    onChange={(e) => toggleScopedLayer(layer.id, (e.target as HTMLInputElement).checked)}
                  />
                  <span>{layer.name}</span>
                </label>
              ))}
            </div>
          )}

          <label className="windrose-party-controls-field">
            <span>Tags</span>
            <input
              type="text"
              placeholder="settlement, visited"
              value={tagsDraft}
              onInput={(e) => setTagsDraft((e.target as HTMLInputElement).value)}
              onBlur={commitTagFilters}
              onKeyDown={(e) => commitOnEnter(e, commitTagFilters)}
            />
          </label>

          <label className="windrose-party-controls-field">
            <span>Props</span>
            <input
              type="text"
              placeholder="status: active, rumored"
              value={propsDraft}
              onInput={(e) => setPropsDraft((e.target as HTMLInputElement).value)}
              onBlur={commitPropertyFilters}
              onKeyDown={(e) => commitOnEnter(e, commitPropertyFilters)}
            />
          </label>

          <label className="windrose-party-controls-field">
            <span>Related</span>
            <select
              value={pin.relatedMode ?? 'off'}
              onChange={(e) => setRelatedMode((e.target as HTMLSelectElement).value as PartyRelatedMode)}
            >
              <option value="off">Off</option>
              <option value="tags">By tags</option>
              <option value="backlinks">By backlinks</option>
            </select>
          </label>
        </>
      )}
    </div>
  );
};

// ===========================================
// Beacon note
// ===========================================

interface PartyPinControlsNoteProps {
  pin: PartyPin;
  updatePin: UpdatePin;
  /** Open the pin's party note (flushes any pending note write first) */
  onOpenPartyNote?: () => void;
  /** Create the pin's party note in the given vault folder */
  onCreatePartyNote?: (folder: string) => Promise<void> | void;
}

const PartyPinControlsNote = ({ pin, updatePin, onOpenPartyNote, onCreatePartyNote }: PartyPinControlsNoteProps): VNode => {
  const [noteFolderDraft, setNoteFolderDraft] = useState('');

  const setNoteEnabled = (enabled: boolean): void => {
    if (!pin.partyNote) return;
    updatePin({ partyNote: { ...pin.partyNote, enabled } });
  };

  return (
    <div className="windrose-party-controls-note">
      <div className="windrose-party-controls-note-header">
        <Icon icon="lucide-file-text" size={12} />
        <span>Beacon note</span>
        {pin.partyNote && (
          <>
            <label className="windrose-party-controls-note-toggle" ref={tooltipRef('Keep the note updated')}>
              <input
                type="checkbox"
                checked={pin.partyNote.enabled}
                onChange={(e) => setNoteEnabled((e.target as HTMLInputElement).checked)}
              />
              <span>Live</span>
            </label>
            <button
              className="windrose-party-controls-note-open"
              ref={tooltipRef(pin.partyNote.path)}
              aria-label="Open beacon note"
              onClick={() => {
                if (onOpenPartyNote) onOpenPartyNote();
                else void openNoteInNewTab(pin.partyNote?.path);
              }}
            >
              <Icon icon="lucide-external-link" size={12} />
            </button>
          </>
        )}
      </div>
      {!pin.partyNote && (
        <div className="windrose-party-controls-note-create">
          <input
            type="text"
            placeholder="Folder (optional)"
            value={noteFolderDraft}
            onInput={(e) => setNoteFolderDraft((e.target as HTMLInputElement).value)}
          />
          <button onClick={() => { void onCreatePartyNote?.(noteFolderDraft); }}>Create</button>
        </div>
      )}
    </div>
  );
};

// ===========================================
// Nearby results
// ===========================================

interface PartyPinControlsNearbyProps {
  results: PartyRangeResults;
  /** Compact per-mode travel label for a result distance (PP-35); null = none */
  travelLabelFor?: (distanceInCells: number) => string | null;
  /** One explicit unit-guidance line when a selected travel mode cannot compute */
  travelHint?: string | null;
  /** Navigate/flash a result's source marker on the map */
  onShowOnMap?: (position: Point) => void;
  /** Force an immediate recalculation/note flush */
  onRecalculate?: () => void;
}

const PartyPinControlsNearby = ({ results, travelLabelFor, travelHint, onShowOnMap, onRecalculate }: PartyPinControlsNearbyProps): VNode => (
  <div className="windrose-party-controls-nearby">
    <div className="windrose-party-controls-nearby-header">
      <Icon icon="lucide-locate" size={12} />
      <span>Nearby</span>
      {results.linked.length + results.unlinked.length > 0 && (
        <span className="windrose-party-controls-nearby-count">
          {results.linked.length + results.unlinked.length}
        </span>
      )}
      <button
        className="windrose-party-controls-locate"
        ref={tooltipRef('Recalculate now')}
        aria-label="Recalculate now"
        onClick={() => onRecalculate?.()}
      >
        <Icon icon="lucide-refresh-cw" size={12} />
      </button>
    </div>

    {travelHint != null && (
      <div className="windrose-party-controls-travel-hint">
        <Icon icon="lucide-alert-triangle" size={11} />
        <span>{travelHint}</span>
      </div>
    )}

    {results.linked.length === 0 && results.unlinked.length === 0 && (
      <div className="windrose-party-controls-nearby-empty">Nothing in range</div>
    )}

    {results.linked.length > 0 && (
      <div className="windrose-party-controls-nearby-list">
        {results.linked.map(result => {
          const travel = travelLabelFor?.(result.distanceInCells) ?? null;
          return (
            <div
              key={result.notePath}
              className="windrose-party-controls-nearby-item"
              ref={tooltipRef(result.notePath)}
            >
              <div className="windrose-party-controls-nearby-row">
                <InternalLink link={result.notePath.replace(/\.md$/, '')}>
                  {result.displayName}
                </InternalLink>
                <span className="windrose-party-controls-nearby-distance">{result.distanceLabel}</span>
                {onShowOnMap && (
                  <button
                    className="windrose-party-controls-locate"
                    ref={tooltipRef('Show on map')}
                    aria-label={`Show ${result.displayName} on map`}
                    onClick={() => onShowOnMap(result.position)}
                  >
                    <Icon icon="lucide-crosshair" size={12} />
                  </button>
                )}
              </div>
              {travel != null && (
                <div className="windrose-party-controls-nearby-travel">{travel}</div>
              )}
            </div>
          );
        })}
      </div>
    )}

    {results.unlinked.length > 0 && (
      <>
        <div className="windrose-party-controls-nearby-subheader">Unlinked</div>
        <div className="windrose-party-controls-nearby-list">
          {results.unlinked.map(result => {
            const travel = travelLabelFor?.(result.distanceInCells) ?? null;
            return (
              <div key={result.objectId} className="windrose-party-controls-nearby-item">
                <div className="windrose-party-controls-nearby-row is-static">
                  <span>{result.label}</span>
                  <span className="windrose-party-controls-nearby-distance">{result.distanceLabel}</span>
                  {onShowOnMap && (
                    <button
                      className="windrose-party-controls-locate"
                      ref={tooltipRef('Show on map')}
                      aria-label={`Show ${result.label} on map`}
                      onClick={() => onShowOnMap(result.position)}
                    >
                      <Icon icon="lucide-crosshair" size={12} />
                    </button>
                  )}
                </div>
                {travel != null && (
                  <div className="windrose-party-controls-nearby-travel">{travel}</div>
                )}
              </div>
            );
          })}
        </div>
      </>
    )}
  </div>
);

export { PartyPinControlsFilters, PartyPinControlsNote, PartyPinControlsNearby, commitOnEnter };
export type { UpdatePin };
