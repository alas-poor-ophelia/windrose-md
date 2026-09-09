/**
 * PartyPinLayer.tsx
 *
 * Layer component for the map's beacons. Registers the placement/drag tool
 * handlers, resolves the map's distance and travel settings once, tracks
 * which beacon is selected, and renders one PartyPinInstance per pin — each
 * of which computes its own range and travel independently. Range rings are
 * visible whenever a pin exists, independent of the active tool.
 */

import type { VNode } from 'preact';
import type { PartyPin } from '#types/core/map.types';
import type { Point } from '#types/core/geometry.types';
import type { ToolId } from '#types/tools/tool.types';

import { TFile } from 'obsidian';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getEffectiveDistanceSettings } from '../../drawing/distanceOperations';
import { getPartyPinById } from '../../objects/partyPinOperations';
import type { NoteMetadataAccessor } from '../../objects/partyRangeQuery';
import { extractCacheTags } from '../../objects/partyRelatedNotes';
import type { PartyNoteContext } from '../../persistence/partyNoteOperations';
import { getEnabledTravelPacks } from '../../travel/travelPackOperations';
import {
  findTravelMismatch,
  formatTravelTimesLabel,
  resolveSelectedAllowance,
  resolveSelectedModes,
} from '../../travel/travelTimeOperations';
import { getSettings } from '../../core/settingsAccessor';
import { PartyPinInstance } from './PartyPinInstance';
import { useApp } from '../../context/AppContext';
import { useMapState } from '../../context/MapContext';
import { useLayerHandlers } from '../../hooks/canvas/useLayerHandlers';
import { usePartyPinInteraction } from '../../hooks/interactions/usePartyPinInteraction';

/** Props for PartyPinLayer component */
export interface PartyPinLayerProps {
  /** Current active tool (controls card shows while the pin tool is active) */
  currentTool: ToolId;
  /** Change handler for the map's party pins (history-aware) */
  onPartyPinsChange: (partyPins: PartyPin[], suppressHistory?: boolean) => void;
}

const FLASH_DURATION_MS = 1800;

const PartyPinLayer = ({ currentTool, onPartyPinsChange }: PartyPinLayerProps): VNode | null => {
  const app = useApp();
  const { mapData, geometry, mapId, notePath, distanceOverrides } = useMapState();

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

  // The beacon the last gesture targeted — its card is the one on screen.
  // `viaSelect` marks a selection made with the select tool, which shows the
  // card without switching to the beacon tool; it clears on any select miss.
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [selectedViaSelect, setSelectedViaSelect] = useState(false);
  useEffect(() => {
    if (currentTool !== 'select') setSelectedViaSelect(false);
  }, [currentTool]);

  const handleActivePinChange = useCallback((pinId: string | null, viaSelect: boolean): void => {
    setSelectedPinId(pinId);
    setSelectedViaSelect(viaSelect && pinId != null);
  }, []);

  const { handlePartyPinPointerDown, handlePartyPinSelectPointerDown, handlePartyPinMove, stopPartyPinDrag, isPartyPinDragging } =
    usePartyPinInteraction(mapData?.partyPins, onPartyPinsChange, handleActivePinChange);

  useLayerHandlers('partyPin', { handlePartyPinPointerDown, handlePartyPinSelectPointerDown, handlePartyPinMove, stopPartyPinDrag, isPartyPinDragging });

  const pins = mapData?.partyPins ?? [];
  const selectedPin = getPartyPinById(pins, selectedPinId);
  // With a single beacon the tool needs no click to reveal its card; with
  // several, the card belongs to the beacon last placed or clicked.
  const activePin = selectedPin ?? (pins.length === 1 ? pins[0] : null);
  const controlsPinId = currentTool === 'partyPin'
    ? activePin?.id ?? null
    : (currentTool === 'select' && selectedViaSelect ? selectedPin?.id ?? null : null);

  // Tags/frontmatter for filter checks, straight from Obsidian's in-memory
  // metadata cache — no file reads per query
  const noteMetadataAccessor = useCallback<NoteMetadataAccessor>((targetPath: string) => {
    const file = app.vault.getAbstractFileByPath(targetPath);
    if (!(file instanceof TFile)) return null;
    const cache = app.metadataCache.getFileCache(file);
    if (cache == null) return null;
    return { tags: extractCacheTags(cache), frontmatter: cache.frontmatter ?? {} };
  }, [app]);

  // Travel packs come from plugin settings; re-read when settings change
  const [settingsVersion, setSettingsVersion] = useState(0);
  useEffect(() => {
    const handler = (): void => setSettingsVersion(v => v + 1);
    window.addEventListener('windrose-settings-changed', handler);
    return () => window.removeEventListener('windrose-settings-changed', handler);
  }, []);

  // Resolved once for the whole layer: a stable object keeps every beacon's
  // range query memoized across unrelated map edits
  const mapType = mapData?.mapType;
  const distanceSettings = useMemo(
    () => getEffectiveDistanceSettings(mapType ?? 'grid', getSettings(), distanceOverrides ?? null),
    [mapType, distanceOverrides, settingsVersion]
  );

  const enabledPacks = useMemo(
    () => getEnabledTravelPacks(getSettings().travelPacks),
    [settingsVersion]
  );
  const selectedTravelModes = useMemo(
    () => resolveSelectedModes(enabledPacks, mapData?.travelSettings?.modeIds ?? []),
    [enabledPacks, mapData?.travelSettings]
  );
  const travelAllowance = useMemo(
    () => resolveSelectedAllowance(enabledPacks, mapData?.travelSettings?.allowanceId),
    [enabledPacks, mapData?.travelSettings]
  );

  /** Compact "mode time · mode time" label for a result's distance, or null */
  const travelLabelFor = useCallback((distanceInCells: number): string | null => {
    if (selectedTravelModes.length === 0) return null;
    return formatTravelTimesLabel(
      distanceInCells * distanceSettings.distancePerCell,
      distanceSettings.distanceUnit,
      selectedTravelModes,
      travelAllowance
    );
  }, [selectedTravelModes, travelAllowance, distanceSettings]);

  /** One explicit unit-guidance line when a selected mode cannot compute */
  const travelHint = useMemo((): string | null => {
    if (selectedTravelModes.length === 0) return null;
    return findTravelMismatch(distanceSettings.distanceUnit, selectedTravelModes);
  }, [selectedTravelModes, distanceSettings]);

  const mapName = mapData?.name ?? '';
  const noteContext = useMemo<PartyNoteContext>(
    () => ({ mapId: mapId ?? '', mapName, mapNotePath: notePath ?? '', distanceUnit: distanceSettings.distanceUnit }),
    [mapId, mapName, notePath, distanceSettings]
  );

  if (pins.length === 0 || !mapData || !geometry) {
    return null;
  }

  return (
    <>
      {pins.map(pin => (
        <PartyPinInstance
          key={pin.id}
          pin={pin}
          showControls={pin.id === controlsPinId}
          distanceSettings={distanceSettings}
          noteMetadata={noteMetadataAccessor}
          noteContext={noteContext}
          hasTravelModes={selectedTravelModes.length > 0}
          travelLabelFor={travelLabelFor}
          travelHint={travelHint}
          flashMarker={pin.id === controlsPinId ? flashMarker : null}
          onShowOnMap={handleShowOnMap}
          onPartyPinsChange={onPartyPinsChange}
        />
      ))}
    </>
  );
};

export { PartyPinLayer };
