/**
 * PartyPinLayer.tsx
 *
 * Layer component for the party pin. Registers the placement/drag tool
 * handlers, resolves the map's distance settings, converts the pin's range
 * from map units to cells, and renders the pin with its range ring. The
 * ring is visible whenever a pin exists, independent of the active tool.
 */

import type { VNode } from 'preact';
import type { PartyPin } from '#types/core/map.types';
import type { Point } from '#types/core/geometry.types';
import type { ToolId } from '#types/tools/tool.types';
import type { MapDistanceOverrides } from '../../drawing/distanceOperations';
import type { PartyRangeResults } from '../../objects/partyRangeQuery';

import { Notice } from 'obsidian';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getEffectiveDistanceSettings } from '../../drawing/distanceOperations';
import { rangeUnitsToCells } from '../../drawing/rangeOperations';
import { getPartyPin, removePartyPin, upsertPartyPin } from '../../objects/partyPinOperations';
import { queryPartyRange } from '../../objects/partyRangeQuery';
import {
  buildPartyNoteContent,
  buildPartyNotePath,
  deletePartyNote,
  upsertPartyNote
} from '../../persistence/partyNoteOperations';
import { getSettings } from '../../core/settingsAccessor';
import { ConfirmModal } from '../../settings/modals/ConfirmModal';
import { PartyPinOverlay } from '../overlays/PartyPinOverlay';
import { PartyPinControls } from '../overlays/PartyPinControls';
import { useApp } from '../../context/AppContext';
import { useMapState } from '../../context/MapContext';
import { useLayerHandlers } from '../../hooks/canvas/useLayerHandlers';
import { usePartyPinInteraction } from '../../hooks/interactions/usePartyPinInteraction';

const EMPTY_RESULTS: PartyRangeResults = { linked: [], unlinked: [] };

/** Props for PartyPinLayer component */
export interface PartyPinLayerProps {
  /** Current active tool (controls card shows while the pin tool is active) */
  currentTool: ToolId;
  /** Change handler for the map's party pins (history-aware) */
  onPartyPinsChange: (partyPins: PartyPin[], suppressHistory?: boolean) => void;
}

const FLASH_DURATION_MS = 1800;
/** Note writes coalesce bursts of edits into one file operation */
const PARTY_NOTE_SAVE_DELAY_MS = 2000;

const PartyPinLayer = ({ currentTool, onPartyPinsChange }: PartyPinLayerProps): VNode | null => {
  const app = useApp();
  const { mapData, geometry, canvasRef, mapId, notePath } = useMapState();

  // Transient highlight for "show on map" — cleared after the pulse finishes
  const [flashMarker, setFlashMarker] = useState<Point | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (flashTimerRef.current != null) window.clearTimeout(flashTimerRef.current);
  }, []);

  const zoom = mapData?.viewState?.zoom;
  const handleShowOnMap = useCallback((position: Point): void => {
    window.dispatchEvent(new CustomEvent('windrose-navigate-to', {
      detail: { mapId, x: position.x, y: position.y, zoom }
    }));
    setFlashMarker({ ...position });
    if (flashTimerRef.current != null) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setFlashMarker(null), FLASH_DURATION_MS);
  }, [mapId, zoom]);

  const { handlePartyPinPointerDown, handlePartyPinMove, stopPartyPinDrag } =
    usePartyPinInteraction(mapData?.partyPins, onPartyPinsChange);

  useLayerHandlers('partyPin', { handlePartyPinPointerDown, handlePartyPinMove, stopPartyPinDrag });

  const pin = getPartyPin(mapData?.partyPins);

  const results = useMemo((): PartyRangeResults => {
    if (!pin || !mapData || !geometry) return EMPTY_RESULTS;
    const distanceSettings = getEffectiveDistanceSettings(
      mapData.mapType,
      getSettings(),
      (mapData.settings?.distanceSettings ?? null) as MapDistanceOverrides | null
    );
    return queryPartyRange(mapData, geometry, pin, {
      rangeInCells: rangeUnitsToCells(pin.range, distanceSettings.distancePerCell),
      distancePerCell: distanceSettings.distancePerCell,
      distanceUnit: distanceSettings.distanceUnit,
      diagonalRule: distanceSettings.gridDiagonalRule,
      displayFormat: distanceSettings.displayFormat
    });
  }, [pin, mapData, geometry]);

  const inRangeMarkers = useMemo(
    () => [...results.linked, ...results.unlinked].map(r => r.position),
    [results]
  );

  const mapName = mapData?.name ?? '';
  const noteContext = useMemo(
    () => ({ mapId: mapId ?? '', mapName, mapNotePath: notePath ?? '' }),
    [mapId, mapName, notePath]
  );

  // Note content doubles as the change signal: the debounced write below
  // only re-arms when the rendered content actually differs
  const noteContent = useMemo(() => {
    if (pin?.partyNote?.enabled !== true) return null;
    return buildPartyNoteContent(pin, results, noteContext);
  }, [pin, results, noteContext]);

  useEffect(() => {
    if (noteContent == null || pin?.partyNote == null) return undefined;
    const pinForWrite = pin;
    const timer = window.setTimeout(() => {
      void upsertPartyNote(app, pinForWrite, noteContent);
    }, PARTY_NOTE_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [noteContent, pin, app]);

  const handleCreatePartyNote = useCallback(async (folder: string): Promise<void> => {
    const currentPin = getPartyPin(mapData?.partyPins);
    if (!currentPin || !mapData) return;
    const path = buildPartyNotePath(folder, currentPin.label);
    const updatedPin: PartyPin = { ...currentPin, partyNote: { enabled: true, path } };
    const outcome = await upsertPartyNote(app, updatedPin, buildPartyNoteContent(updatedPin, results, noteContext));
    if (outcome === 'blocked') {
      new Notice(`A note already exists at ${path} — choose another folder or rename the pin.`);
      return;
    }
    onPartyPinsChange(upsertPartyPin(mapData.partyPins ?? [], updatedPin));
  }, [mapData, results, noteContext, app, onPartyPinsChange]);

  const handleRecalculate = useCallback((): void => {
    const currentPin = getPartyPin(mapData?.partyPins);
    if (currentPin?.partyNote?.enabled !== true || !mapData || !geometry) return;
    void upsertPartyNote(app, currentPin, buildPartyNoteContent(currentPin, results, noteContext))
      .then(outcome => {
        if (outcome === 'blocked') new Notice('Party note is blocked by an unrelated file at its path.');
      });
  }, [mapData, geometry, results, noteContext, app]);

  const handleRemovePin = useCallback(async (): Promise<void> => {
    const currentPin = getPartyPin(mapData?.partyPins);
    if (!currentPin || !mapData) return;
    if (currentPin.partyNote?.path != null && currentPin.partyNote.path !== '') {
      const alsoDeleteNote = await new ConfirmModal(app, {
        message: `Also delete the party note at "${currentPin.partyNote.path}"?\nThe pin is removed either way.`,
        confirmText: 'Delete note',
        cancelText: 'Keep note',
        isDestructive: true
      }).openAndGetValue();
      if (alsoDeleteNote) {
        const outcome = await deletePartyNote(app, currentPin);
        if (outcome === 'not-owned') {
          new Notice('The file at the note path was not generated by this pin — leaving it untouched.');
        }
      }
    }
    onPartyPinsChange(removePartyPin(mapData.partyPins ?? [], currentPin.id));
  }, [mapData, app, onPartyPinsChange]);

  if (!pin || !mapData || !geometry) {
    return null;
  }

  const distanceSettings = getEffectiveDistanceSettings(
    mapData.mapType,
    getSettings(),
    (mapData.settings?.distanceSettings ?? null) as MapDistanceOverrides | null
  );
  const rangeInCells = rangeUnitsToCells(pin.range, distanceSettings.distancePerCell);

  return (
    <>
      <PartyPinOverlay
        pin={pin}
        rangeInCells={rangeInCells}
        diagonalRule={distanceSettings.gridDiagonalRule}
        inRangeMarkers={inRangeMarkers}
        flashMarker={flashMarker}
        geometry={geometry}
        mapData={mapData}
        canvasRef={canvasRef}
      />
      {currentTool === 'partyPin' && (
        <PartyPinControls
          pin={pin}
          partyPins={mapData.partyPins ?? []}
          distanceUnit={distanceSettings.distanceUnit}
          results={results}
          geometry={geometry}
          mapData={mapData}
          canvasRef={canvasRef}
          onPartyPinsChange={onPartyPinsChange}
          onShowOnMap={handleShowOnMap}
          onCreatePartyNote={handleCreatePartyNote}
          onRecalculate={handleRecalculate}
          onRemovePin={() => { void handleRemovePin(); }}
        />
      )}
    </>
  );
};

export { PartyPinLayer };
