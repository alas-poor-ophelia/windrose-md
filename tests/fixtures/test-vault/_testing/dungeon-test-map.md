# Dungeon Test Map

This map is used for automated E2E testing of dungeon generation reroll functionality. Do not delete.

```datacorejsx
window.__dmtBasePath = "Projects/dungeon-map-tracker";

const { DungeonMapTracker } = await dc.require("Projects/dungeon-map-tracker/DungeonMapTracker.tsx");

const mapId = "dungeon-test-map-001";
const mapName = "Dungeon Test Map";
const mapType = "grid";

return <DungeonMapTracker mapId={mapId} mapName={mapName} mapType={mapType} />;
```
