# Smoke Test Map (Compiled)

This map tests the COMPILED Windrose artifact. Do not delete.

```datacorejsx
window.__dmtBasePath = "_compiled";

const { View: DungeonMapTracker } = await dc.require(
  dc.headerLink(dc.resolvePath("_compiled/compiled-windrose-md"), "DungeonMapTracker")
);

const mapId = "smoke-test-map-001";
const mapName = "Smoke Test Map";
const mapType = "grid";

return <DungeonMapTracker mapId={mapId} mapName={mapName} mapType={mapType} />;
```
