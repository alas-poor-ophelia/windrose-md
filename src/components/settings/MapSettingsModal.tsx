/**
 * MapSettingsModal.tsx
 *
 * Modal for configuring per-map settings and UI preferences.
 * Organized into tabs:
 * 1. Appearance - Color customization
 * 2. Hex Grid (hex maps only) - Bounds, coordinate display, and background image
 * 3. Measurement - Distance settings
 * 4. Preferences - UI state persistence options
 *
 * Native path: uses Obsidian Modal via NativeModalPortal
 * Fallback path: custom drag/resize UI via Preact portal
 */

import type { MapType } from '#types/core/map.types';
import type { SettingsTabId } from '#types/settings/settings.types';
import { h } from 'preact';
import type { VNode, ComponentChildren } from 'preact';

import { NativeModalPortal } from '../modals/NativeModalPortal';
import { MapSettingsProvider, ModalShellContext, AppearanceContext, BackgroundImageContext, HexGridContext, useModalShell, useAppearance, useBackgroundImage, useHexGrid } from '../../context/MapSettingsContext';
import type { MapSettingsProviderProps } from '../../context/MapSettingsContext';
import { AppearanceTab } from './AppearanceTab';
import { HexGridTab } from './hexmap/HexGridTab';
import { GridBackgroundTab } from './gridmap/GridBackgroundTab';
import { MeasurementTab } from './MeasurementTab';
import { PreferencesTab } from './PreferencesTab';
import { ResizeConfirmDialog } from './ResizeConfirmDialog';














/** Tab configuration */
interface SettingsTab {
  id: string;
  label: string;
}

/** Props for MapSettingsModal */
export interface MapSettingsModalProps {
  isOpen: boolean;
  mapData: unknown;
  mapType: MapType;
  globalSettings: Record<string, unknown>;
  onSave: (updates: Record<string, unknown>) => void;
  onCancel: () => void;
  isInSubHex?: boolean;
  subMapName?: string | null;
  [key: string]: unknown;
}

/**
 * Tab bar + body shared by both native and fallback paths
 */
function TabContent({ tabs, activeTab, setActiveTab, mapType }: {
  tabs: SettingsTab[];
  activeTab: string;
  setActiveTab: (id: SettingsTabId) => void;
  mapType: MapType;
}): VNode {
  return (
    <>
      <div class="dmt-settings-tab-bar" style={{ flexShrink: 0 }}>
        {tabs.map((tab: SettingsTab) => (
          <button
            key={tab.id}
            class={`dmt-settings-tab ${activeTab === tab.id ? 'dmt-settings-tab-active' : ''}`}
            onClick={() => setActiveTab(tab.id as SettingsTabId)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div class="dmt-modal-body" style={{
        paddingTop: '16px',
        flex: 1,
        overflowY: 'auto',
        minHeight: 0
      }}>
        {activeTab === 'appearance' && <AppearanceTab />}
        {activeTab === 'hexgrid' && mapType === 'hex' && <HexGridTab />}
        {activeTab === 'gridbackground' && mapType === 'grid' && <GridBackgroundTab />}
        {activeTab === 'measurement' && <MeasurementTab />}
        {activeTab === 'preferences' && <PreferencesTab />}
      </div>
    </>
  );
}

/**
 * Inner modal content that uses the settings context.
 * Renders native Obsidian modal when bridge is available, fallback otherwise.
 */
function MapSettingsModalContent(): VNode | null {
  const shellCtx = useModalShell();
  const appearanceCtx = useAppearance();
  const bgImageCtx = useBackgroundImage();
  const hexGridCtx = useHexGrid();
  const {
    isOpen,
    activeTab,
    setActiveTab,
    tabs,
    mapType,
    isLoading,
    handleSave,
    handleCancel,
    isInSubHex,
    subMapName
  } = shellCtx;

  if (!isOpen) return null;

  const contextBridge = (children: unknown) =>
    h(ModalShellContext.Provider, { value: shellCtx },
      h(AppearanceContext.Provider, { value: appearanceCtx },
        h(BackgroundImageContext.Provider, { value: bgImageCtx },
          h(HexGridContext.Provider, { value: hexGridCtx }, children as ComponentChildren))));

  const modalTitle = isInSubHex && subMapName
    ? `Map Settings \u2014 ${subMapName}`
    : 'Map Settings';

  return (
    <NativeModalPortal
      title={modalTitle}
      modalClass="dmt-settings-native-modal"
      onClose={handleCancel}
      draggable
      resizable
      contextBridge={contextBridge}
    >
      <div class="dmt-settings-modal">
        {isInSubHex && (
          <div style={{
            padding: '6px 12px',
            marginBottom: '8px',
            background: 'var(--background-modifier-message)',
            borderRadius: '4px',
            fontSize: '12px',
            color: 'var(--text-muted)',
            borderLeft: '3px solid var(--interactive-accent)'
          }}>
            Editing sub-map settings. Changes apply only to this sub-map.
          </div>
        )}
        <TabContent tabs={tabs} activeTab={activeTab} setActiveTab={setActiveTab} mapType={mapType} />

        <div class="modal-button-container">
          <button onClick={handleCancel} disabled={isLoading}>Cancel</button>
          <button class="mod-cta" onClick={handleSave} disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
      <ResizeConfirmDialog />
    </NativeModalPortal>
  );
}

/**
 * Main MapSettingsModal component
 */
function MapSettingsModal(props: MapSettingsModalProps): VNode {
  return (
    <MapSettingsProvider {...props as unknown as MapSettingsProviderProps} onClose={props.onCancel}>
      <MapSettingsModalContent />
    </MapSettingsProvider>
  );
}

export { MapSettingsModal };