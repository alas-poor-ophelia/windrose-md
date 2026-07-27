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
import type { MapData, PartyPin, PartyRangeStyle } from '#types/core/map.types';

import type { PartyRangeResults } from '../../objects/partyRangeQuery';

import { cellToScreen } from '../../drawing/cellToScreenConverter';
import { isValidRange, removePartyPin, updatePartyPin, PARTY_PIN_DEFAULTS } from '../../objects/partyPinOperations';
import { openNoteInNewTab } from '../../persistence/noteOperations';
import { useToolbarPosition } from '../../hooks/interactions/useToolbarPosition';
import { ColorPicker } from '../shared/ColorPicker';
import { CornerBrackets } from '../shared/CornerBrackets';
import { Icon } from '../shared/Icon';
import { InternalLink } from '../shared/InternalLink';
import { Z_INDEX } from '../../core/dmtConstants';

const CARD_WIDTH = 232;
const CARD_HEIGHT = 200;

interface PartyPinControlsProps {
  pin: PartyPin;
  partyPins: PartyPin[];
  /** Display unit for the range input (e.g. 'ft', 'mi') */
  distanceUnit: string;
  /** Markers currently within range, from the party range query */
  results: PartyRangeResults;
  geometry: IGeometry | null;
  mapData: MapData | null;
  canvasRef: RefObject<HTMLCanvasElement> | null;
  onPartyPinsChange: (partyPins: PartyPin[], suppressHistory?: boolean) => void;
  /** Navigate/flash a result's source marker on the map */
  onShowOnMap?: (position: Point) => void;
  /** Create the pin's party note in the given vault folder */
  onCreatePartyNote?: (folder: string) => Promise<void> | void;
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
  geometry,
  mapData,
  canvasRef,
  onPartyPinsChange,
  onShowOnMap,
  onCreatePartyNote,
  onRecalculate,
  onRemovePin
}: PartyPinControlsProps): VNode | null => {
  const [labelDraft, setLabelDraft] = useState(pin.label);
  const [rangeDraft, setRangeDraft] = useState(String(pin.range));
  const [rangeInvalid, setRangeInvalid] = useState(false);
  const [noteFolderDraft, setNoteFolderDraft] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const colorButtonRef = useRef<HTMLButtonElement | null>(null);

  // Re-seed drafts when the pin itself changes (placement, undo/redo)
  useEffect(() => {
    setLabelDraft(pin.label);
    setRangeDraft(String(pin.range));
    setRangeInvalid(false);
  }, [pin.id, pin.label, pin.range]);

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
    toolbarHeight: CARD_HEIGHT + Math.min(resultCount, 6) * 26 + 30
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
        top: `${toolbarPos.toolbarY}px`,
        width: `${CARD_WIDTH}px`,
        pointerEvents: 'auto',
        zIndex: Z_INDEX.TOOLBAR
      }}
    >
      <CornerBrackets classPrefix="windrose-selection-card-bracket" variant="minimal" filterId="party-pin-bracket" />

      <div className="windrose-selection-card-content">
        <div className="windrose-party-controls-header">
          <Icon icon="lucide-users" size={14} />
          <span>Party Pin</span>
          <button
            ref={colorButtonRef}
            className="windrose-party-controls-color"
            title="Pin Color"
            aria-label="Pin Color"
            onClick={() => setShowColorPicker(open => !open)}
          >
            <span className="windrose-party-controls-color-swatch" style={{ backgroundColor: pin.color }} />
          </button>
          <button
            className="windrose-party-controls-remove"
            title="Remove Party Pin"
            aria-label="Remove Party Pin"
            onClick={handleRemove}
          >
            <Icon icon="lucide-trash-2" size={14} />
          </button>
        </div>
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
            title="Pin Color"
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
            title="Circle ring"
            aria-label="Circle ring"
            onClick={() => setRangeStyle('circle')}
          >
            <Icon icon="lucide-circle-dashed" size={14} />
            <span>Circle</span>
          </button>
          <button
            className={pin.rangeStyle === 'cells' ? 'is-active' : ''}
            title="Highlight cells in range"
            aria-label="Highlight cells in range"
            onClick={() => setRangeStyle('cells')}
          >
            <Icon icon="lucide-layout-grid" size={14} />
            <span>Cells</span>
          </button>
        </div>

        <div className="windrose-party-controls-note">
          <div className="windrose-party-controls-note-header">
            <Icon icon="lucide-file-text" size={12} />
            <span>Party note</span>
            {pin.partyNote && (
              <>
                <label className="windrose-party-controls-note-toggle" title="Keep the note updated">
                  <input
                    type="checkbox"
                    checked={pin.partyNote.enabled}
                    onChange={(e) => setNoteEnabled((e.target as HTMLInputElement).checked)}
                  />
                  <span>Live</span>
                </label>
                <button
                  className="windrose-party-controls-note-open"
                  title={pin.partyNote.path}
                  aria-label="Open party note"
                  onClick={() => { void openNoteInNewTab(pin.partyNote?.path); }}
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
              title="Recalculate now"
              aria-label="Recalculate now"
              onClick={() => onRecalculate?.()}
            >
              <Icon icon="lucide-refresh-cw" size={12} />
            </button>
          </div>

          {results.linked.length === 0 && results.unlinked.length === 0 && (
            <div className="windrose-party-controls-nearby-empty">Nothing in range</div>
          )}

          {results.linked.length > 0 && (
            <div className="windrose-party-controls-nearby-list">
              {results.linked.map(result => (
                <div
                  key={result.notePath}
                  className="windrose-party-controls-nearby-row"
                  title={result.notePath}
                >
                  <InternalLink link={result.notePath.replace(/\.md$/, '')}>
                    {result.displayName}
                  </InternalLink>
                  <span className="windrose-party-controls-nearby-distance">{result.distanceLabel}</span>
                  {onShowOnMap && (
                    <button
                      className="windrose-party-controls-locate"
                      title="Show on map"
                      aria-label={`Show ${result.displayName} on map`}
                      onClick={() => onShowOnMap(result.position)}
                    >
                      <Icon icon="lucide-crosshair" size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {results.unlinked.length > 0 && (
            <>
              <div className="windrose-party-controls-nearby-subheader">Unlinked</div>
              <div className="windrose-party-controls-nearby-list">
                {results.unlinked.map(result => (
                  <div key={result.objectId} className="windrose-party-controls-nearby-row is-static">
                    <span>{result.label}</span>
                    <span className="windrose-party-controls-nearby-distance">{result.distanceLabel}</span>
                    {onShowOnMap && (
                      <button
                        className="windrose-party-controls-locate"
                        title="Show on map"
                        aria-label={`Show ${result.label} on map`}
                        onClick={() => onShowOnMap(result.position)}
                      >
                        <Icon icon="lucide-crosshair" size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export { PartyPinControls };
