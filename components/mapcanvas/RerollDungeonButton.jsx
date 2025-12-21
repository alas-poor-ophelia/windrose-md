/**
 * RerollDungeonButton.jsx
 * 
 * Button component for re-rolling generated dungeons.
 * Uses MapContext to access mapData and cell operations.
 * Only renders if the map has generationSettings.
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapState, useMapOperations } = await requireModuleByName("MapContext.jsx");
const { generateDungeon } = await requireModuleByName("dungeonGenerator.js");
const { ModalPortal } = await requireModuleByName("ModalPortal.jsx");

const RerollDungeonButton = () => {
  const { mapData } = useMapState();
  const { onCellsChange, onObjectsChange } = useMapOperations();
  
  const [showConfirm, setShowConfirm] = dc.useState(false);
  
  // Don't render if no generation settings
  if (!mapData?.generationSettings?.preset) {
    return null;
  }
  
  const settings = mapData.generationSettings;
  
  const handleClick = () => {
    setShowConfirm(true);
  };
  
  const handleConfirm = () => {
    const result = generateDungeon(settings.preset, undefined, settings.configOverrides || {});
    // Replace cells and objects on active layer with new generated content
    // suppressHistory = false so this can be undone
    onCellsChange(result.cells, false);
    onObjectsChange(result.objects, false);
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
              <p>This will replace all cells and objects on the current layer with a new randomly generated dungeon.</p>
              <p className="dmt-reroll-warning">This action cannot be undone.</p>
              <div className="dmt-reroll-confirm-buttons">
                <button className="dmt-btn dmt-btn-secondary" onClick={handleCancel}>
                  Cancel
                </button>
                <button className="dmt-btn dmt-btn-primary" onClick={handleConfirm}>
                  Re-roll
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
};

return { RerollDungeonButton };