# Smoke Test Hex Map (Compiled)

This map tests the COMPILED Windrose artifact with hex grids. Do not delete.

```datacorejsx
window.__dmtBasePath = "_compiled";

const { View: DungeonMapTracker } = await dc.require(
  dc.headerLink(dc.resolvePath("_compiled/compiled-windrose-md"), "DungeonMapTracker")
);

const mapId = "smoke-test-hex-001";
const mapName = "Smoke Test Hex Map";
const mapType = "hex";

return <DungeonMapTracker mapId={mapId} mapName={mapName} mapType={mapType} />;
```
