/**
 * PartyPinLayer.tsx
 *
 * Layer component for the party pin. Resolves the map's distance settings,
 * converts the pin's range from map units to cells, and renders the pin with
 * its range ring. The ring is visible whenever a pin exists, independent of
 * the active tool.
 */

import type { VNode } from 'preact';
import type { MapDistanceOverrides } from '../../drawing/distanceOperations';

import { getEffectiveDistanceSettings } from '../../drawing/distanceOperations';
import { rangeUnitsToCells } from '../../drawing/rangeOperations';
import { getPartyPin } from '../../objects/partyPinOperations';
import { getSettings } from '../../core/settingsAccessor';
import { PartyPinOverlay } from '../overlays/PartyPinOverlay';
import { useMapState } from '../../context/MapContext';

const PartyPinLayer = (): VNode | null => {
  const { mapData, geometry, canvasRef } = useMapState();

  const pin = getPartyPin(mapData?.partyPins);
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
    <PartyPinOverlay
      pin={pin}
      rangeInCells={rangeInCells}
      diagonalRule={distanceSettings.gridDiagonalRule}
      geometry={geometry}
      mapData={mapData}
      canvasRef={canvasRef}
    />
  );
};

export { PartyPinLayer };
