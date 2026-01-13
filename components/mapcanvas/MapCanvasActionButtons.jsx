// components/MapCanvasActionButtons.jsx - All floating action buttons and modals
const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { TextLabelEditor } = await requireModuleByName("TextLabelEditor.jsx");
const { TextInputModal } = await requireModuleByName("TextInputModal.tsx");
const { NoteLinkModal } = await requireModuleByName("NoteLinkModal.jsx");
const { ColorPicker } = await requireModuleByName("ColorPicker.tsx");
const { openNoteInNewTab } = await requireModuleByName("noteOperations.ts");

// Sub-component: Text Label Control Buttons
const TextLabelControls = ({ 
  selectedItem, 
  mapData,
  calculateEditButtonPosition,
  calculateRotateButtonPosition,
  handleEditClick,
  handleRotateClick
}) => {
  if (selectedItem?.type !== 'text' || !mapData) return null;
  
  return (
    <>
      <div
        className="dmt-edit-button"
        onClick={handleEditClick}
        style={{
          position: 'absolute',
          left: calculateEditButtonPosition().x,
          top: calculateEditButtonPosition().y,
          pointerEvents: 'auto'
        }}
        title="Edit Text Label"
      >
        <dc.Icon icon="lucide-pencil" />
      </div>
      
      <div
        className="dmt-rotate-button"
        onClick={handleRotateClick}
        style={{
          position: 'absolute',
          left: calculateRotateButtonPosition().x,
          top: calculateRotateButtonPosition().y,
          pointerEvents: 'auto'
        }}
        title="Rotate 45° (or press R)"
      >
        <dc.Icon icon="lucide-rotate-cw" />
      </div>
    </>
  );
};

// Sub-component: Object Control Buttons
const ObjectControls = ({
  selectedItem,
  mapData,
  isResizeMode,
  showObjectColorPicker,
  objectColorBtnRef,
  pendingObjectCustomColorRef,
  customColors,
  calculateLabelButtonPosition,
  calculateLinkNoteButtonPosition,
  calculateResizeButtonPosition,
  calculateObjectColorButtonPosition,
  handleNoteButtonClick,
  handleResizeButtonClick,
  handleEditNoteLink,
  handleObjectColorButtonClick,
  handleObjectColorPickerClose,
  handleObjectColorSelect,
  handleObjectColorResetWrapper,
  onAddCustomColor,
  onDeleteCustomColor
}) => {
  if (selectedItem?.type !== 'object' || !mapData) return null;
  
  return (
    <>
      {/* Visible note link display for selected object with linkedNote */}
      {selectedItem.data?.linkedNote && typeof selectedItem.data.linkedNote === 'string' && (
        <div 
          className="dmt-selected-object-note"
          style={{
            position: 'absolute',
            left: `${calculateLabelButtonPosition().x - calculateResizeButtonPosition().x}px`,
            top: `${calculateResizeButtonPosition().y - 35}px`,
            pointerEvents: 'auto',
            zIndex: 150
          }}
        >
          <div className="dmt-note-display-link">
            <dc.Icon icon="lucide-scroll-text" />
            <dc.Link 
              link={dc.resolvePath(selectedItem.data.linkedNote.replace(/\.md$/, ''))}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openNoteInNewTab(selectedItem.data.linkedNote);
              }}
            />
            <dc.Icon icon="lucide-external-link" />
          </div>
        </div>
      )}
      
      {/* Resize button */}
      {!isResizeMode && (
        <div
          className="dmt-resize-button"
          onClick={handleResizeButtonClick}
          style={{
            position: 'absolute',
            left: calculateResizeButtonPosition().x,
            top: calculateResizeButtonPosition().y,
            pointerEvents: 'auto'
          }}
          title="Resize Object"
        >
           <dc.Icon icon="lucide-scaling" />
        </div>
      )}
      
      {/* Note button (custom tooltip) - only for non-note_pin objects */}
      {selectedItem.data?.type !== 'note_pin' && (
        <div
          className="dmt-note-button"
          onClick={handleNoteButtonClick}
          style={{
            position: 'absolute',
            left: calculateLabelButtonPosition().x,
            top: calculateLabelButtonPosition().y,
            pointerEvents: 'auto'
          }}
          title="Add/Edit Label"
        >
          <dc.Icon icon="lucide-sticky-note" />
        </div>
      )}
      
      {/* Link note button */}
      <div
        className="dmt-link-note-button"
        onClick={() => handleEditNoteLink(selectedItem.id)}
        style={{
          position: 'absolute',
          left: calculateLinkNoteButtonPosition().x,
          top: calculateLinkNoteButtonPosition().y,
          pointerEvents: 'auto'
        }}
        title={selectedItem.data?.linkedNote ? "Edit linked note" : "Link note"}
      >
        <dc.Icon icon="lucide-scroll-text" />
      </div>
      
      {/* Color picker button */}
      {!isResizeMode && (
        <div 
          style={{ 
            position: 'absolute',
            left: calculateObjectColorButtonPosition().x,
            top: calculateObjectColorButtonPosition().y,
            pointerEvents: 'none'
          }}
        >
          <div style={{ position: 'relative', display: 'inline-block', pointerEvents: 'auto' }}>
            <div
              ref={objectColorBtnRef}
              className="dmt-object-color-button"
              onClick={handleObjectColorButtonClick}
              style={{
                backgroundColor: selectedItem.data.color || '#ffffff'
              }}
              title="Change Object Color"
            >
              <dc.Icon icon="lucide-palette" />
            </div>
            
            {showObjectColorPicker && (
              <ColorPicker
                isOpen={showObjectColorPicker}
                selectedColor={selectedItem.data.color || '#ffffff'}
                onColorSelect={handleObjectColorSelect}
                onClose={handleObjectColorPickerClose}
                onReset={handleObjectColorResetWrapper}
                customColors={customColors || []}
                onAddCustomColor={onAddCustomColor}
                onDeleteCustomColor={onDeleteCustomColor}
                pendingCustomColorRef={pendingObjectCustomColorRef}
                title="Object Color"
              />
            )}
          </div>
        </div>
      )}
    </>
  );
};

// Sub-component: Modal Overlays
const ModalOverlays = ({
  showTextModal,
  editingTextId,
  showNoteModal,
  editingObjectId,
  showNoteLinkModal,
  pendingNotePinId,
  editingNoteObjectId,
  mapData,
  customColors,
  handleTextSubmit,
  handleTextCancel,
  handleNoteModalSubmit,
  handleNoteCancel,
  handleNoteLinkSave,
  handleNoteLinkCancel,
  onAddCustomColor,
  onDeleteCustomColor
}) => {
  return (
    <>
      {/* Text Label Editor Modal */}
      {showTextModal && (() => {
        let currentLabel = null;
        if (editingTextId && mapData?.textLabels) {
          currentLabel = mapData.textLabels.find(l => l.id === editingTextId);
        }
        
        return (
          <TextLabelEditor
            initialValue={currentLabel?.content || ''}
            initialFontSize={currentLabel?.fontSize || 16}
            initialFontFace={currentLabel?.fontFace || 'sans'}
            initialColor={currentLabel?.color || '#ffffff'}
            isEditing={!!editingTextId}
            customColors={customColors || []}
            onAddCustomColor={onAddCustomColor}
            onDeleteCustomColor={onDeleteCustomColor}
            onSubmit={handleTextSubmit}
            onCancel={handleTextCancel}
          />
        );
      })()}
      
      {/* Object Note Modal */}
      {showNoteModal && editingObjectId && mapData && (
        <TextInputModal
          onSubmit={handleNoteModalSubmit}
          onCancel={handleNoteCancel}
          title={`Label for ${mapData.objects.find(obj => obj.id === editingObjectId)?.label || 'Object'}`}
          placeholder="Add a custom note..."
          initialValue={mapData.objects.find(obj => obj.id === editingObjectId)?.customTooltip || ''}
        />
      )}
      
      {/* Note Link Modal */}
      {showNoteLinkModal && mapData && (
        <NoteLinkModal
          isOpen={showNoteLinkModal}
          onClose={handleNoteLinkCancel}
          onSave={handleNoteLinkSave}
          currentNotePath={
            pendingNotePinId 
              ? mapData.objects?.find(obj => obj.id === pendingNotePinId)?.linkedNote || null
              : editingNoteObjectId
              ? mapData.objects?.find(obj => obj.id === editingNoteObjectId)?.linkedNote || null
              : null
          }
          objectType={
            pendingNotePinId
              ? mapData.objects?.find(obj => obj.id === pendingNotePinId)?.type || null
              : editingNoteObjectId
              ? mapData.objects?.find(obj => obj.id === editingNoteObjectId)?.type || null
              : null
          }
        />
      )}
    </>
  );
};

// Main component: Coordinates all action buttons and modals
const MapCanvasActionButtons = ({
  // Selection state
  selectedItem,
  mapData,
  
  // Text label handlers
  calculateEditButtonPosition,
  calculateRotateButtonPosition,
  handleEditClick,
  handleRotateClick,
  
  // Object handlers
  isResizeMode,
  showObjectColorPicker,
  objectColorBtnRef,
  pendingObjectCustomColorRef,
  calculateLabelButtonPosition,
  calculateLinkNoteButtonPosition,
  calculateResizeButtonPosition,
  calculateObjectColorButtonPosition,
  handleNoteButtonClick,
  handleResizeButtonClick,
  handleEditNoteLink,
  handleObjectColorButtonClick,
  handleObjectColorPickerClose,
  handleObjectColorSelect,
  handleObjectColorResetWrapper,
  
  // Modal state and handlers
  showTextModal,
  editingTextId,
  showNoteModal,
  editingObjectId,
  showNoteLinkModal,
  pendingNotePinId,
  editingNoteObjectId,
  handleTextSubmit,
  handleTextCancel,
  handleNoteModalSubmit,
  handleNoteCancel,
  handleNoteLinkSave,
  handleNoteLinkCancel,
  
  // Custom colors
  customColors,
  onAddCustomColor,
  onDeleteCustomColor
}) => {
  return (
    <>
      <TextLabelControls
        selectedItem={selectedItem}
        mapData={mapData}
        calculateEditButtonPosition={calculateEditButtonPosition}
        calculateRotateButtonPosition={calculateRotateButtonPosition}
        handleEditClick={handleEditClick}
        handleRotateClick={handleRotateClick}
      />
    
      
      <ModalOverlays
        showTextModal={showTextModal}
        editingTextId={editingTextId}
        showNoteModal={showNoteModal}
        editingObjectId={editingObjectId}
        showNoteLinkModal={showNoteLinkModal}
        pendingNotePinId={pendingNotePinId}
        editingNoteObjectId={editingNoteObjectId}
        mapData={mapData}
        customColors={customColors}
        handleTextSubmit={handleTextSubmit}
        handleTextCancel={handleTextCancel}
        handleNoteModalSubmit={handleNoteModalSubmit}
        handleNoteCancel={handleNoteCancel}
        handleNoteLinkSave={handleNoteLinkSave}
        handleNoteLinkCancel={handleNoteLinkCancel}
        onAddCustomColor={onAddCustomColor}
        onDeleteCustomColor={onDeleteCustomColor}
      />
    </>
  );
};

return { MapCanvasActionButtons };