/**
 * MapSettingsModal.jsx
 * 
 * Modal for configuring per-map settings and UI preferences.
 * Organized into tabs:
 * 1. Appearance - Color customization
 * 2. Hex Grid (hex maps only) - Bounds, coordinate display, and background image
 * 3. Measurement - Distance settings
 * 4. Preferences - UI state persistence options
 * 
 * This is the orchestrator component that composes all settings tabs
 * using the shared MapSettingsContext.
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { ModalPortal } = await requireModuleByName("ModalPortal.jsx");
const { MapSettingsProvider, useMapSettings } = await requireModuleByName("MapSettingsContext.jsx");
const { AppearanceTab } = await requireModuleByName("AppearanceTab.jsx");
const { HexGridTab } = await requireModuleByName("HexGridTab.jsx");
const { MeasurementTab } = await requireModuleByName("MeasurementTab.jsx");
const { PreferencesTab } = await requireModuleByName("PreferencesTab.jsx");
const { ResizeConfirmDialog } = await requireModuleByName("ResizeConfirmDialog.jsx");

/**
 * Inner modal content that uses the settings context
 */
function MapSettingsModalContent() {
  const {
    isOpen,
    activeTab,
    setActiveTab,
    tabs,
    mapType,
    isLoading,
    handleSave,
    handleCancel,
    mouseDownTargetRef
  } = useMapSettings();
  
  if (!isOpen) return null;
  
  return (
    <ModalPortal>
      <div 
        class="dmt-modal-overlay" 
        onMouseDown={(e) => mouseDownTargetRef.current = e.target}
        onClick={(e) => {
          if (mouseDownTargetRef.current === e.target) {
            handleCancel();
          }
          mouseDownTargetRef.current = null;
        }}
      >
        <div 
          class="dmt-modal-content dmt-settings-modal" 
          onClick={(e) => e.stopPropagation()}
          style={{ width: '480px', maxWidth: '90vw' }}
        >
          {/* Header */}
          <div class="dmt-modal-header">
            <h3>Map Settings</h3>
          </div>
          
          {/* Tab Bar */}
          <div class="dmt-settings-tab-bar">
            {tabs.map(tab => (
              <button
                key={tab.id}
                class={`dmt-settings-tab ${activeTab === tab.id ? 'dmt-settings-tab-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          
          {/* Tab Content */}
          <div class="dmt-modal-body" style={{ paddingTop: '16px' }}>
            {activeTab === 'appearance' && <AppearanceTab />}
            {activeTab === 'hexgrid' && mapType === 'hex' && <HexGridTab />}
            {activeTab === 'measurement' && <MeasurementTab />}
            {activeTab === 'preferences' && <PreferencesTab />}
          </div>
          
          {/* Footer */}
          <div class="dmt-modal-footer">
            <button 
              class="dmt-modal-btn dmt-modal-btn-cancel"
              onClick={handleCancel}
              disabled={isLoading}
            >
              Cancel
            </button>
            
            <button 
              class="dmt-modal-btn dmt-modal-btn-submit"
              onClick={handleSave}
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
      
      {/* Resize Confirmation Dialog */}
      <ResizeConfirmDialog />
    </ModalPortal>
  );
}

/**
 * Main MapSettingsModal component
 * Wraps content in the settings context provider
 */
function MapSettingsModal(props) {
  return (
    <MapSettingsProvider {...props}>
      <MapSettingsModalContent />
    </MapSettingsProvider>
  );
}

return { MapSettingsModal };