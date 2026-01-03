# Smoke Test Map (Hex)

This map is used for automated E2E testing of Windrose hex maps. Do not delete.

```datacorejsx
window.__dmtBasePath = "Projects/dungeon-map-tracker";

const { DungeonMapTracker } = await dc.require("Projects/dungeon-map-tracker/DungeonMapTracker.jsx");

const mapId = "smoke-test-hex-001";
const mapName = "Smoke Test Hex Map";
const mapType = "hex";

return <DungeonMapTracker mapId={mapId} mapName={mapName} mapType={mapType} />;
```
