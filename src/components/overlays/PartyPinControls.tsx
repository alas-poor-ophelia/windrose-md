/**
 * PartyPinControls.tsx
 *
 * Floating controls card for the party pin, shown while the party pin tool
 * is active. Anchors near the pin using the shared toolbar positioning
 * (flip above/below, edge clamping) and the selection-card visual language.
 *
 * Range input validates at commit time: zero, negative, or non-numeric
 * values are rejected with visible feedback and never reach map data.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import type { RefObject, VNode } from 'preact';
import type { IGeometry, Point } from '#types/core/geometry.types';
import type { MapData, PartyPin, PartyRangeStyle, PartyRelatedMode } from '#types/core/map.types';
import type { ViewController } from '#types/hooks/viewController.types';

import type { PartyRangeResults } from '../../objects/partyRangeQuery';

import { cellToScreen } from '../../drawing/cellToScreenConverter';
import {
  isValidRange,
  removePartyPin,
  updatePartyPin,
  resolvePinIconGlyph,
  parseTagFilters,
  formatTagFilters,
  parsePropertyFilters,
  formatPropertyFilters,
  PARTY_PIN_DEFAULTS
} from '../../objects/partyPinOperations';
import { openNoteInNewTab } from '../../persistence/noteOperations';
import { useToolbarPosition } from '../../hooks/interactions/useToolbarPosition';
import { ColorPicker } from '../shared/ColorPicker';
import { IconPickerPopup } from '../shared/IconPickerPopup';
import { CornerBrackets } from '../shared/CornerBrackets';
import { Icon } from '../shared/Icon';
import { InternalLink } from '../shared/InternalLink';
import { Z_INDEX } from '../../core/dmtConstants';
import { tooltipRef } from '../shared/obsidianTooltip';

const CARD_WIDTH = 232;
const CARD_HEIGHT = 200;

interface PartyPinControlsProps {
  pin: PartyPin;
  partyPins: PartyPin[];
  /** Display unit for the range input (e.g. 'ft', 'mi') */
  distanceUnit: string;
  /** Markers currently within range, from the party range query */
  results: PartyRangeResults;
  /** Compact per-mode travel label for a result distance (PP-35); null = none */
  travelLabelFor?: (distanceInCells: number) => string | null;
  /** One explicit unit-guidance line when a selected travel mode cannot compute */
  travelHint?: string | null;
  geometry: IGeometry | null;
  mapData: MapData | null;
  canvasRef: RefObject<HTMLCanvasElement> | null;
  /** Live pan/zoom controller — the card hides mid-gesture and reanchors on commit */
  viewController?: ViewController;
  onPartyPinsChange: (partyPins: PartyPin[], suppressHistory?: boolean) => void;
  /** Navigate/flash a result's source marker on the map */
  onShowOnMap?: (position: Point) => void;
  /** Create the pin's party note in the given vault folder */
  onCreatePartyNote?: (folder: string) => Promise<void> | void;
  /** Open the pin's party note (flushes any pending note write first) */
  onOpenPartyNote?: () => void;
  /** Force an immediate recalculation/note flush */
  onRecalculate?: () => void;
  /** Remove the pin (offers party-note deletion when one exists) */
  onRemovePin?: () => void;
}

const PartyPinControls = ({
  pin,
  partyPins,
  distanceUnit,
  results,
  travelLabelFor,
  travelHint,
  geometry,
  mapData,
  canvasRef,
  viewController,
  onPartyPinsChange,
  onShowOnMap,
  onCreatePartyNote,
  onOpenPartyNote,
  onRecalculate,
  onRemovePin
}: PartyPinControlsProps): VNode | null => {
  const [labelDraft, setLabelDraft] = useState(pin.label);
  const [rangeDraft, setRangeDraft] = useState(String(pin.range));
  const [rangeInvalid, setRangeInvalid] = useState(false);
  const [noteFolderDraft, setNoteFolderDraft] = useState('');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [tagsDraft, setTagsDraft] = useState(formatTagFilters(pin.filters?.tags));
  const [propsDraft, setPropsDraft] = useState(formatPropertyFilters(pin.filters?.properties));
  const [showColorPicker, setShowColorPicker] = useState(false);
  const colorButtonRef = useRef<HTMLButtonElement | null>(null);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const iconButtonRef = useRef<HTMLButtonElement | null>(null);

  // Re-seed drafts when the pin itself changes (placement, undo/redo)
  useEffect(() => {
    setLabelDraft(pin.label);
    setRangeDraft(String(pin.range));
    setRangeInvalid(false);
    setTagsDraft(formatTagFilters(pin.filters?.tags));
    setPropsDraft(formatPropertyFilters(pin.filters?.properties));
  }, [pin.id, pin.label, pin.range, pin.filters]);

  // Hide mid pan/zoom gesture (the card anchors to committed coordinates, so
  // tracking the gesture would lag); it reanchors on commit
  const [isViewGesturing, setIsViewGesturing] = useState(false);
  useEffect(() => {
    if (!viewController) return undefined;
    return viewController.subscribeLive(() => {
      setIsViewGesturing(viewController.isGesturing());
    });
  }, [viewController]);

  // Resolve anchor geometry up front so the positioning hook runs
  // unconditionally (bounds stay null until everything is available)
  let container: HTMLElement | null = null;
  let bounds: { screenX: number; screenY: number; width: number; height: number } | null = null;

  const canvas = canvasRef?.current ?? null;
  if (geometry && mapData?.viewState && canvas) {
    const { width: canvasWidth, height: canvasHeight } = canvas;
    const canvasRect = canvas.getBoundingClientRect();
    const displayScale = canvasRect.width / canvasWidth;

    container = canvas.parentElement;
    let traversalCount = 0;
    while (container?.classList && !container.classList.contains('windrose-canvas-container')) {
      container = container.parentElement;
      traversalCount++;
      if (traversalCount > 10) break;
    }

    if (container) {
      const containerRect = container.getBoundingClientRect();
      const pinScreen = cellToScreen(
        pin.position.x, pin.position.y,
        geometry as Parameters<typeof cellToScreen>[2],
        mapData as Parameters<typeof cellToScreen>[3],
        canvasWidth, canvasHeight
      );
      const cellScreenSize = geometry.getScaledCellSize(mapData.viewState.zoom) * displayScale;
      bounds = {
        screenX: pinScreen.x * displayScale + (canvasRect.left - containerRect.left),
        screenY: pinScreen.y * displayScale + (canvasRect.top - containerRect.top),
        width: cellScreenSize,
        height: cellScreenSize * 2
      };
    }
  }

  const resultCount = results.linked.length + results.unlinked.length;
  const toolbarPos = useToolbarPosition({
    bounds,
    containerRef: { current: container },
    toolbarWidth: CARD_WIDTH,
    toolbarHeight: CARD_HEIGHT + Math.min(resultCount, 6) * 26 + 30,
    avoidAnchorOverlap: true
  });
  if (!toolbarPos) return null;

  const commitLabel = (): void => {
    if (labelDraft === pin.label) return;
    onPartyPinsChange(updatePartyPin(partyPins, pin.id, { label: labelDraft }));
  };

  const commitRange = (): void => {
    const parsed = Number(rangeDraft);
    if (!isValidRange(parsed)) {
      setRangeInvalid(true);
      return;
    }
    setRangeInvalid(false);
    if (parsed === pin.range) return;
    onPartyPinsChange(updatePartyPin(partyPins, pin.id, { range: parsed }));
  };

  const setRangeStyle = (rangeStyle: PartyRangeStyle): void => {
    if (rangeStyle === pin.rangeStyle) return;
    onPartyPinsChange(updatePartyPin(partyPins, pin.id, { rangeStyle }));
  };

  const handleRemove = (): void => {
    if (onRemovePin) {
      onRemovePin();
      return;
    }
    onPartyPinsChange(removePartyPin(partyPins, pin.id));
  };

  const setNoteEnabled = (enabled: boolean): void => {
    if (!pin.partyNote) return;
    onPartyPinsChange(updatePartyPin(partyPins, pin.id, { partyNote: { ...pin.partyNote, enabled } }));
  };

  const commitTagFilters = (): void => {
    const tags = parseTagFilters(tagsDraft);
    onPartyPinsChange(updatePartyPin(partyPins, pin.id, {
      filters: { ...pin.filters, tags: tags.length > 0 ? tags : undefined }
    }));
  };

  const commitPropertyFilters = (): void => {
    const properties = parsePropertyFilters(propsDraft);
    onPartyPinsChange(updatePartyPin(partyPins, pin.id, {
      filters: { ...pin.filters, properties: Object.keys(properties).length > 0 ? properties : undefined }
    }));
  };

  const setScopeMode = (mode: 'all' | 'selected'): void => {
    onPartyPinsChange(updatePartyPin(partyPins, pin.id, {
      layerScope: { mode, layerIds: pin.layerScope?.layerIds ?? [] }
    }));
  };

  const toggleScopedLayer = (layerId: string, included: boolean): void => {
    const current = pin.layerScope?.layerIds ?? [];
    const layerIds = included ? [...current, layerId] : current.filter(id => id !== layerId);
    onPartyPinsChange(updatePartyPin(partyPins, pin.id, {
      layerScope: { mode: 'selected', layerIds }
    }));
  };

  const setRelatedMode = (relatedMode: PartyRelatedMode): void => {
    onPartyPinsChange(updatePartyPin(partyPins, pin.id, { relatedMode }));
  };

  const commitOnEnter = (e: KeyboardEvent, commit: () => void): void => {
    if (e.key === 'Enter') {
      commit();
      (e.target as HTMLElement).blur();
    }
  };

  return (
    <div
      className="windrose-selection-card windrose-party-controls"
      style={{
        position: 'absolute',
        left: `${toolbarPos.toolbarX}px`,
        // Bottom-anchored above the pin when set: the card grows upward and
        // clips at the container top — it can never bleed down over the pin
        ...(toolbarPos.anchorBottom != null
          ? { bottom: `${toolbarPos.anchorBottom}px` }
          : { top: `${toolbarPos.toolbarY}px` }),
        width: `${CARD_WIDTH}px`,
        pointerEvents: 'auto',
        zIndex: Z_INDEX.TOOLBAR,
        visibility: isViewGesturing ? 'hidden' : 'visible'
      }}
    >
      <CornerBrackets classPrefix="windrose-selection-card-bracket" variant="minimal" filterId="party-pin-bracket" />

      <div className="windrose-selection-card-content">
        <div className="windrose-party-controls-header">
          <Icon icon="lucide-users" size={14} />
          <span>Beacon</span>
          <button
            ref={(el) => { if (el != null) iconButtonRef.current = el; tooltipRef('Beacon Icon')(el); }}
            className="windrose-party-controls-icon"
            aria-label="Beacon Icon"
            onClick={() => setShowIconPicker(open => !open)}
          >
            {(() => {
              const glyph = resolvePinIconGlyph(pin.icon);
              return glyph != null
                ? <span className={`windrose-party-controls-icon-glyph${glyph.isRaIcon ? ' is-ra' : ''}`}>{glyph.glyph}</span>
                : <Icon icon="lucide-shapes" size={14} />;
            })()}
          </button>
          <button
            ref={(el) => { if (el != null) colorButtonRef.current = el; tooltipRef('Beacon Color')(el); }}
            className="windrose-party-controls-color"
            aria-label="Beacon Color"
            onClick={() => setShowColorPicker(open => !open)}
          >
            <span className="windrose-party-controls-color-swatch" style={{ backgroundColor: pin.color }} />
          </button>
          <button
            className="windrose-party-controls-remove"
            ref={tooltipRef('Remove Beacon')}
            aria-label="Remove Beacon"
            onClick={handleRemove}
          >
            <Icon icon="lucide-trash-2" size={14} />
          </button>
        </div>
        {showIconPicker && (
          <IconPickerPopup
            isOpen={showIconPicker}
            selectedIcon={pin.icon ?? null}
            onIconSelect={(icon: string) => {
              onPartyPinsChange(updatePartyPin(partyPins, pin.id, { icon }));
              setShowIconPicker(false);
            }}
            onClear={() => {
              onPartyPinsChange(updatePartyPin(partyPins, pin.id, { icon: '' }));
              setShowIconPicker(false);
            }}
            onClose={() => setShowIconPicker(false)}
            title="Beacon Icon"
            position="above"
            portalled
            anchorRef={iconButtonRef}
          />
        )}
        {showColorPicker && (
          <ColorPicker
            isOpen={showColorPicker}
            selectedColor={pin.color}
            onColorSelect={(color: string) => {
              onPartyPinsChange(updatePartyPin(partyPins, pin.id, { color }));
            }}
            onClose={() => setShowColorPicker(false)}
            onReset={() => {
              onPartyPinsChange(updatePartyPin(partyPins, pin.id, { color: PARTY_PIN_DEFAULTS.color }));
            }}
            title="Beacon Color"
            position="above"
            portalled
            anchorRef={colorButtonRef}
          />
        )}

        <label className="windrose-party-controls-field">
          <span>Label</span>
          <input
            type="text"
            value={labelDraft}
            onInput={(e) => setLabelDraft((e.target as HTMLInputElement).value)}
            onBlur={commitLabel}
            onKeyDown={(e) => commitOnEnter(e, commitLabel)}
          />
        </label>

        <label className={`windrose-party-controls-field ${rangeInvalid ? 'is-invalid' : ''}`}>
          <span>Range</span>
          <div className="windrose-party-controls-range">
            <input
              type="number"
              min="0"
              step="any"
              value={rangeDraft}
              onInput={(e) => {
                setRangeDraft((e.target as HTMLInputElement).value);
                setRangeInvalid(false);
              }}
              onBlur={commitRange}
              onKeyDown={(e) => commitOnEnter(e, commitRange)}
            />
            <span className="windrose-party-controls-unit">{distanceUnit}</span>
          </div>
        </label>
        {rangeInvalid && (
          <div className="windrose-party-controls-error">Range must be a number greater than zero</div>
        )}

        <div className="windrose-party-controls-styles">
          <button
            className={pin.rangeStyle === 'circle' ? 'is-active' : ''}
            ref={tooltipRef('Circle ring')}
            aria-label="Circle ring"
            onClick={() => setRangeStyle('circle')}
          >
            <Icon icon="lucide-circle-dashed" size={14} />
            <span>Circle</span>
          </button>
          <button
            className={pin.rangeStyle === 'cells' ? 'is-active' : ''}
            ref={tooltipRef('Highlight cells in range')}
            aria-label="Highlight cells in range"
            onClick={() => setRangeStyle('cells')}
          >
            <Icon icon="lucide-layout-grid" size={14} />
            <span>Cells</span>
          </button>
        </div>

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
                  {(mapData?.layers ?? []).map(layer => (
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
      </div>
    </div>
  );
};

export { PartyPinControls };
