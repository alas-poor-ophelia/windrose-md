n# Smoke Test Map

This map is used for automated E2E testing of Windrose. Do not delete.

```datacorejsx
window.__dmtBasePath = "Projects/dungeon-map-tracker";

const { DungeonMapTracker } = await dc.require("Projects/dungeon-map-tracker/DungeonMapTracker.jsx");

const mapId = "smoke-test-map-001";
const mapName = "Smoke Test Map";
const mapType = "grid";

return <DungeonMapTracker mapId={mapId} mapName={mapName} mapType={mapType} />;
```
