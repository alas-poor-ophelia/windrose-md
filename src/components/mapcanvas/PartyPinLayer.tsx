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
import type { ToolId } from '#types/tools/tool.types';
import type { MapDistanceOverrides } from '../../drawing/distanceOperations';
import type { PartyRangeResults } from '../../objects/partyRangeQuery';

import { useMemo } from 'preact/hooks';
import { getEffectiveDistanceSettings } from '../../drawing/distanceOperations';
import { rangeUnitsToCells } from '../../drawing/rangeOperations';
import { getPartyPin } from '../../objects/partyPinOperations';
import { queryPartyRange } from '../../objects/partyRangeQuery';
import { getSettings } from '../../core/settingsAccessor';
import { PartyPinOverlay } from '../overlays/PartyPinOverlay';
import { PartyPinControls } from '../overlays/PartyPinControls';
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

const PartyPinLayer = ({ currentTool, onPartyPinsChange }: PartyPinLayerProps): VNode | null => {
  const { mapData, geometry, canvasRef } = useMapState();

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
        />
      )}
    </>
  );
};

export { PartyPinLayer };
