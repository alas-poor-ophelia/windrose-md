/**
 * PartyPinControls.tsx
 *
 * Floating controls card for the party pin, shown while the party pin tool
 * is active. Anchors near the pin via usePartyPinCardPosition (flip
 * above/below, edge clamping, gesture-hide) and the selection-card visual
 * language. The collapsible sections (filters & related, beacon note,
 * nearby results) live in PartyPinControlsSections.
 *
 * Range input validates at commit time: zero, negative, or non-numeric
 * values are rejected with visible feedback and never reach map data.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import type { RefObject, VNode } from 'preact';
import type { IGeometry, Point } from '#types/core/geometry.types';
import type { MapData, PartyPin, PartyRangeStyle } from '#types/core/map.types';
import type { ViewController } from '#types/hooks/viewController.types';

import type { PartyRangeResults } from '../../objects/partyRangeQuery';

import {
  isValidRange,
  removePartyPin,
  updatePartyPin,
  resolvePinIconGlyph,
  PARTY_PIN_DEFAULTS
} from '../../objects/partyPinOperations';
import { usePartyPinCardPosition, CARD_WIDTH } from '../../hooks/interactions/usePartyPinCardPosition';
import { ColorPicker } from '../shared/ColorPicker';
import { IconPickerPopup } from '../shared/IconPickerPopup';
import { CornerBrackets } from '../shared/CornerBrackets';
import { Icon } from '../shared/Icon';
import { Z_INDEX } from '../../core/dmtConstants';
import { tooltipRef } from '../shared/obsidianTooltip';
import {
  PartyPinControlsFilters,
  PartyPinControlsNote,
  PartyPinControlsNearby,
  commitOnEnter
} from './PartyPinControlsSections';

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
  const [showColorPicker, setShowColorPicker] = useState(false);
  const colorButtonRef = useRef<HTMLButtonElement | null>(null);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const iconButtonRef = useRef<HTMLButtonElement | null>(null);

  // Re-seed drafts when the pin itself changes (placement, undo/redo)
  useEffect(() => {
    setLabelDraft(pin.label);
    setRangeDraft(String(pin.range));
    setRangeInvalid(false);
  }, [pin.id, pin.label, pin.range]);

  const resultCount = results.linked.length + results.unlinked.length;
  const { toolbarPos, isViewGesturing } = usePartyPinCardPosition({
    pin, geometry, mapData, canvasRef, viewController, resultCount
  });
  if (!toolbarPos) return null;

  const updatePin = (updates: Partial<PartyPin>): void => {
    onPartyPinsChange(updatePartyPin(partyPins, pin.id, updates));
  };

  const commitLabel = (): void => {
    if (labelDraft === pin.label) return;
    updatePin({ label: labelDraft });
  };

  const commitRange = (): void => {
    const parsed = Number(rangeDraft);
    if (!isValidRange(parsed)) {
      setRangeInvalid(true);
      return;
    }
    setRangeInvalid(false);
    if (parsed === pin.range) return;
    updatePin({ range: parsed });
  };

  const setRangeStyle = (rangeStyle: PartyRangeStyle): void => {
    if (rangeStyle === pin.rangeStyle) return;
    updatePin({ rangeStyle });
  };

  const handleRemove = (): void => {
    if (onRemovePin) {
      onRemovePin();
      return;
    }
    onPartyPinsChange(removePartyPin(partyPins, pin.id));
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
              updatePin({ icon });
              setShowIconPicker(false);
            }}
            onClear={() => {
              updatePin({ icon: '' });
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
              updatePin({ color });
            }}
            onClose={() => setShowColorPicker(false)}
            onReset={() => {
              updatePin({ color: PARTY_PIN_DEFAULTS.color });
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

        <PartyPinControlsFilters pin={pin} layers={mapData?.layers} updatePin={updatePin} />

        <PartyPinControlsNote
          pin={pin}
          updatePin={updatePin}
          onOpenPartyNote={onOpenPartyNote}
          onCreatePartyNote={onCreatePartyNote}
        />

        <PartyPinControlsNearby
          results={results}
          travelLabelFor={travelLabelFor}
          travelHint={travelHint}
          onShowOnMap={onShowOnMap}
          onRecalculate={onRecalculate}
        />
      </div>
    </div>
  );
};

export { PartyPinControls };
