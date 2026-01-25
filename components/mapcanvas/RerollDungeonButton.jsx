/**
 * RerollDungeonButton.jsx
 *
 * Button component for re-rolling generated dungeons.
 * Uses MapContext to access mapData and cell operations.
 * Only renders if the map has generationSettings.
 */

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapState, useMapOperations } = await requireModuleByName("MapContext.tsx");
const { generateDungeon } = await requireModuleByName("dungeonGenerator.js");
const { stockDungeon } = await requireModuleByName("objectPlacer.js");
const { ModalPortal } = await requireModuleByName("ModalPortal.tsx");

// Structural object types that should be preserved during objects-only reroll
const STRUCTURAL_TYPES = new Set([
  'door-horizontal', 'door-vertical', 'secret-door',
  'stairs-up', 'stairs-down'
]);

const RerollDungeonButton = () => {
  const { mapData, currentLayer } = useMapState();
  const { onCellsChange, onObjectsChange, onEdgesChange } = useMapOperations();

  const [showConfirm, setShowConfirm] = dc.useState(false);

  // Don't render if no generation settings
  if (!mapData?.generationSettings?.preset) {
    return null;
  }

  const settings = mapData.generationSettings;
  const hasStockingMetadata = Boolean(settings.stockingMetadata?.rooms);

  const handleClick = () => {
    setShowConfirm(true);
  };

  const handleRerollAll = () => {
    const result = generateDungeon(settings.preset, undefined, settings.configOverrides || {});
    const stockResult = stockDungeon(
      result.metadata.rooms,
      result.metadata.corridorResult,
      result.metadata.doorPositions,
      result.metadata.style || 'classic',
      {
        objectDensity: settings.configOverrides?.objectDensity ?? 1.0,
        monsterWeight: settings.configOverrides?.monsterWeight,
        emptyWeight: settings.configOverrides?.emptyWeight,
        featureWeight: settings.configOverrides?.featureWeight,
        trapWeight: settings.configOverrides?.trapWeight,
        useTemplates: settings.configOverrides?.useTemplates
      },
      {
        entryRoomId: result.metadata.entryRoomId,
        exitRoomId: result.metadata.exitRoomId,
        waterRoomIds: result.metadata.waterRoomIds
      }
    );
    const allObjects = [...result.objects, ...stockResult.objects];

    // suppressHistory = false so this can be undone
    onCellsChange(result.cells, false);
    onObjectsChange(allObjects, false);
    onEdgesChange(result.edges || [], false);
    setShowConfirm(false);
  };

  const handleRerollObjectsOnly = () => {
    const meta = settings.stockingMetadata;
    if (!meta?.rooms) {
      setShowConfirm(false);
      return;
    }

    // Get current objects and filter to keep only structural ones
    const layer = mapData.layers?.[currentLayer];
    const currentObjects = layer?.objects || [];
    const structuralObjects = currentObjects.filter(obj => STRUCTURAL_TYPES.has(obj.type));

    // Generate new stocking objects using saved metadata
    const stockResult = stockDungeon(
      meta.rooms,
      meta.corridorResult,
      meta.doorPositions,
      meta.style || 'classic',
      {
        objectDensity: settings.configOverrides?.objectDensity ?? 1.0,
        monsterWeight: settings.configOverrides?.monsterWeight,
        emptyWeight: settings.configOverrides?.emptyWeight,
        featureWeight: settings.configOverrides?.featureWeight,
        trapWeight: settings.configOverrides?.trapWeight,
        useTemplates: settings.configOverrides?.useTemplates
      },
      {
        entryRoomId: meta.entryRoomId,
        exitRoomId: meta.exitRoomId,
        waterRoomIds: meta.waterRoomIds
      }
    );

    const allObjects = [...structuralObjects, ...stockResult.objects];
    onObjectsChange(allObjects, false);
    setShowConfirm(false);
  };

  const handleCancel = () => {
    setShowConfirm(false);
  };

  const styleName = settings.configOverrides?.style || 'classic';

  return (
    <>
      <button
        className="dmt-tool-btn dmt-reroll-btn interactive-child"
        onClick={handleClick}
        title={`Re-roll dungeon (${styleName} ${settings.preset})`}
      >
        <dc.Icon icon="lucide-dices" />
      </button>

      {showConfirm && (
        <ModalPortal>
          <div className="dmt-reroll-confirm-overlay" onClick={handleCancel}>
            <div className="dmt-reroll-confirm-dialog" onClick={e => e.stopPropagation()}>
              <h3>Re-roll Dungeon?</h3>
              {hasStockingMetadata ? (
                <>
                  <p>Choose what to regenerate:</p>
                  <p className="dmt-reroll-warning">This action cannot be undone.</p>
                  <div className="dmt-reroll-confirm-buttons dmt-reroll-three-buttons">
                    <button className="dmt-btn dmt-btn-secondary" onClick={handleCancel}>
                      Cancel
                    </button>
                    <button className="dmt-btn dmt-btn-tertiary" onClick={handleRerollObjectsOnly} title="Keep the map layout, only regenerate monsters, features, and traps">
                      Objects Only
                    </button>
                    <button className="dmt-btn dmt-btn-primary" onClick={handleRerollAll}>
                      Entire Dungeon
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p>This will replace all cells and objects on the current layer with a new randomly generated dungeon.</p>
                  <p className="dmt-reroll-warning">This action cannot be undone.</p>
                  <div className="dmt-reroll-confirm-buttons">
                    <button className="dmt-btn dmt-btn-secondary" onClick={handleCancel}>
                      Cancel
                    </button>
                    <button className="dmt-btn dmt-btn-primary" onClick={handleRerollAll}>
                      Re-roll
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
};

return { RerollDungeonButton };
