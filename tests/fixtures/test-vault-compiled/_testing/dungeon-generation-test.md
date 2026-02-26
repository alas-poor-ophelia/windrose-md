# Dungeon Generation Test

This file is used for E2E testing of dungeon generation. Content will be inserted here during tests.

```datacorejsx

const { View: DungeonMapTracker } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md.md"), "DungeonMapTracker"));

const mapId = "map-1772005288290-7egoqy3gd";
const mapName = "";
const mapType = "grid";

return <DungeonMapTracker mapId={mapId} mapName={mapName} mapType={mapType} />;
```
