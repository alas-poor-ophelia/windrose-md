# Dungeon Test Map (Compiled)

This map is used for automated E2E testing of dungeon generation reroll functionality. Do not delete.

```datacorejsx
window.__dmtBasePath = "_compiled";

const { View: DungeonMapTracker } = await dc.require(
  dc.headerLink(dc.resolvePath("_compiled/compiled-windrose-md"), "DungeonMapTracker")
);

const mapId = "dungeon-test-map-001";
const mapName = "Dungeon Test Map";
const mapType = "grid";

return <DungeonMapTracker mapId={mapId} mapName={mapName} mapType={mapType} />;
```
