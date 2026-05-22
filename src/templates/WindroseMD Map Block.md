<%*
// Prompt for map name
const mapName = await tp.system.prompt("Enter a name for this map:");
// Prompt for map type
const mapType = await tp.system.suggester(["Grid", "Hex"], ["grid", "hex"], false, "Select map type:");
// Generate a unique ID for this map callout
const mapId = 'map-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
_%>
```datacorejsx

const { View: DungeonMapTracker } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md.md"), "DungeonMapTracker"));

const mapId = "<% mapId %>";
const mapName = "<% mapName %>";
const mapType = "<% mapType %>";
 
return <DungeonMapTracker mapId={mapId} mapName={mapName} mapType={mapType} />;
```