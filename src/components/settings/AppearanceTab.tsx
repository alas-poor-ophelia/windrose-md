/**
 * AppearanceTab.tsx
 *
 * Appearance settings tab for MapSettingsModal.
 * Handles color customization and grid line width.
 */

import type { HexColor } from '#types/core/common.types';
import type { PluginSettings } from '#types/settings/settings.types';
import type { VNode } from 'preact';

import { useState, useMemo } from 'preact/hooks';
import { ColorPicker } from '../shared/ColorPicker';
import { CollapsibleSection } from '../shared/CollapsibleSection';
import { useAppearance, useModalShell } from '../../context/MapSettingsContext';
import type { SettingsOverrides } from '../../context/MapSettingsContext';
import { resolveThemeColor } from '../../core/dmtConstants';
import { SettingItem } from './SettingItem';
import { ImageSearchField } from './ImageSearchField';
import { NativeToggle, NativeSlider } from './NativeControls';
import { Icon } from '../shared/Icon';
import { fogPackImageFilename } from '../../content-packs/contentPackConstants';
import type { InstalledPack } from '#types/content-packs/contentPack.types';

type ColorOverrideKey = keyof SettingsOverrides & keyof PluginSettings;

/** Props for ColorPickerItem */
interface ColorPickerItemProps {
  colorKey: ColorOverrideKey;
  label: string;
  defaultColor: HexColor;
  align?: 'left' | 'right';
}

/**
 * Individual color picker item for the 2x2 grid
 */
function ColorPickerItem({ colorKey, label, defaultColor, align = 'left' }: ColorPickerItemProps): VNode {
  const {
    useGlobalSettings,
    overrides,
    activeColorPicker,
    setActiveColorPicker,
    pendingCustomColorRef,
    handleColorChange,
    globalSettings
  } = useAppearance();

  const displayColor = resolveThemeColor(overrides[colorKey] as string);

  return (
    <div class="windrose-color-grid-item">
      <label class="windrose-form-label" style={{ marginBottom: '4px', fontSize: '12px' }}>{label}</label>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', position: 'relative' }}>
        <button
          class="windrose-color-button"
          disabled={useGlobalSettings}
          onClick={() => !useGlobalSettings && setActiveColorPicker(colorKey)}
          style={{
            backgroundColor: displayColor,
            cursor: useGlobalSettings ? 'not-allowed' : 'pointer',
            minWidth: '80px'
          }}
        >
          <span class="windrose-color-button-label">{displayColor}</span>
        </button>

        <button
          class="windrose-color-reset-btn"
          disabled={useGlobalSettings}
          onClick={() => !useGlobalSettings && handleColorChange(colorKey, defaultColor)}
          title="Reset to default"
          style={{ cursor: useGlobalSettings ? 'not-allowed' : 'pointer' }}
        >
          <Icon icon="lucide-rotate-ccw" />
        </button>

        <ColorPicker
          isOpen={activeColorPicker === colorKey && !useGlobalSettings}
          selectedColor={displayColor}
          onColorSelect={(color: HexColor) => handleColorChange(colorKey, color)}
          onClose={() => setActiveColorPicker(null)}
          onReset={() => handleColorChange(colorKey, globalSettings[colorKey])}
          customColors={[]}
          pendingCustomColorRef={pendingCustomColorRef}
          title={label}
          position="below"
          align={align}
        />
      </div>
    </div>
  );
}

/**
 * Fog of War appearance section
 */
function FogOfWarSection(): VNode {
  const {
    useGlobalSettings,
    overrides,
    activeColorPicker,
    setActiveColorPicker,
    pendingCustomColorRef,
    handleColorChange,
    globalSettings,
    fogImageDisplayName,
    fogImageSearchResults,
    setFogImageDisplayName,
    handleFogImageSearch,
    handleFogImageSelect,
    handleFogImageClear,
    THEME
  } = useAppearance();

  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = (newIsOpen: boolean): void => {
    setIsOpen(newIsOpen);
  };

  const opacityPercent = Math.round((overrides.fogOfWarOpacity ?? 0.9) * 100);
  const subtitle = overrides.fogOfWarImage != null && overrides.fogOfWarImage !== ''
    ? `Image, ${opacityPercent}% opacity`
    : `${overrides.fogOfWarColor ?? '#000000'}, ${opacityPercent}%`;

  return (
    <CollapsibleSection
      title="Fog of War"
      isOpen={isOpen}
      onToggle={handleToggle}
      subtitle={subtitle}
    >
      <div style={{ opacity: useGlobalSettings ? 0.5 : 1 }}>
        <SettingItem name="Fog Color" description="Used if no image is set, or as fallback">
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', position: 'relative' }}>
            <button
              class="windrose-color-button"
              disabled={useGlobalSettings}
              onClick={() => !useGlobalSettings && setActiveColorPicker('fogOfWarColor')}
              style={{
                backgroundColor: overrides.fogOfWarColor ?? '#000000',
                cursor: useGlobalSettings ? 'not-allowed' : 'pointer',
                minWidth: '80px'
              }}
            >
              <span class="windrose-color-button-label">{overrides.fogOfWarColor ?? '#000000'}</span>
            </button>

            <button
              class="windrose-color-reset-btn"
              disabled={useGlobalSettings}
              onClick={() => !useGlobalSettings && handleColorChange('fogOfWarColor', THEME.fogOfWar.color)}
              title="Reset to default"
              style={{ cursor: useGlobalSettings ? 'not-allowed' : 'pointer' }}
            >
              <Icon icon="lucide-rotate-ccw" />
            </button>

            <ColorPicker
              isOpen={activeColorPicker === 'fogOfWarColor' && !useGlobalSettings}
              selectedColor={overrides.fogOfWarColor ?? '#000000'}
              onColorSelect={(color: HexColor) => handleColorChange('fogOfWarColor', color)}
              onClose={() => setActiveColorPicker(null)}
              onReset={() => handleColorChange('fogOfWarColor', globalSettings.fogOfWarColor)}
              customColors={[]}
              pendingCustomColorRef={pendingCustomColorRef}
              title="Fog Color"
              position="below"
              align="left"
            />
          </div>
        </SettingItem>

        <SettingItem
          name={`Fog Opacity: ${Math.round((overrides.fogOfWarOpacity ?? 0.9) * 100)}%`}
          description="Higher values make fog more opaque (10-100%)"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <NativeSlider
              min={10}
              max={100}
              value={Math.round((overrides.fogOfWarOpacity ?? 0.9) * 100)}
              onChange={(val: number) => handleColorChange('fogOfWarOpacity', val / 100)}
              disabled={useGlobalSettings}
            />
            <button
              class="windrose-color-reset-btn"
              disabled={useGlobalSettings}
              onClick={() => !useGlobalSettings && handleColorChange('fogOfWarOpacity', 0.9)}
              title="Reset to default (90%)"
              style={{ cursor: useGlobalSettings ? 'not-allowed' : 'pointer' }}
            >
              <Icon icon="lucide-rotate-ccw" />
            </button>
          </div>
        </SettingItem>

        <SettingItem
          name="Fog Texture"
          description="Select a tileable image to use instead of solid color"
          vertical
        >
          <ImageSearchField
            value={fogImageDisplayName}
            placeholder="Search for tileable image..."
            disabled={useGlobalSettings}
            onSearch={(value: string) => {
              setFogImageDisplayName(value);
              void handleFogImageSearch(value);
            }}
            showClear={overrides.fogOfWarImage != null && overrides.fogOfWarImage !== ''}
            onClear={handleFogImageClear}
            results={fogImageSearchResults}
            onSelect={(image) => void handleFogImageSelect(image)}
          />
        </SettingItem>

        <InstalledFogPacks
          currentImage={overrides.fogOfWarImage}
          onSelect={(image) => void handleFogImageSelect(image)}
          disabled={useGlobalSettings}
        />

        <SettingItem
          name="Soft edges"
          description="Adds a subtle blur effect at fog boundaries"
        >
          <NativeToggle
            value={overrides.fogOfWarBlurEnabled ?? false}
            onChange={() => handleColorChange('fogOfWarBlurEnabled', !(overrides.fogOfWarBlurEnabled ?? false))}
            disabled={useGlobalSettings}
          />
        </SettingItem>

        {(overrides.fogOfWarBlurEnabled ?? false) && (
          <SettingItem
            name={`Blur Intensity: ${Math.round((overrides.fogOfWarBlurFactor ?? 0.20) * 100)}%`}
            description="Size of blur as percentage of cell size (5-50%)"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <NativeSlider
                min={5}
                max={50}
                value={Math.round((overrides.fogOfWarBlurFactor ?? 0.20) * 100)}
                onChange={(val: number) => handleColorChange('fogOfWarBlurFactor', val / 100)}
                disabled={useGlobalSettings}
              />
              <button
                class="windrose-color-reset-btn"
                disabled={useGlobalSettings}
                onClick={() => !useGlobalSettings && handleColorChange('fogOfWarBlurFactor', 0.20)}
                title="Reset to default (20%)"
                style={{ cursor: useGlobalSettings ? 'not-allowed' : 'pointer' }}
              >
                <Icon icon="lucide-rotate-ccw" />
              </button>
            </div>
          </SettingItem>
        )}
      </div>
    </CollapsibleSection>
  );
}

/**
 * Appearance tab content
 */
function AppearanceTab(): VNode {
  const { mapType } = useModalShell();
  const {
    useGlobalSettings,
    overrides,
    globalSettings,
    objectSetId,
    handleObjectSetChange,
    handleToggleUseGlobal,
    handleLineWidthChange,
    handleColorChange,
    THEME
  } = useAppearance();

  return (
    <div class="windrose-settings-tab-content">
      {globalSettings.objectSets && globalSettings.objectSets.length > 0 && (
        <SettingItem
          name="Object set"
          description="Override the global object set for this map"
        >
          <select
            class="dropdown"
            value={objectSetId ?? ''}
            onChange={(e) => handleObjectSetChange(e.currentTarget.value || null)}
          >
            <option value="">Use global</option>
            {globalSettings.objectSets.map((set) => (
              <option key={set.id} value={set.id}>{set.name}</option>
            ))}
          </select>
        </SettingItem>
      )}

      <SettingItem
        name="Custom colors"
        description="Override global color settings for this map"
      >
        <NativeToggle
          value={!useGlobalSettings}
          onChange={handleToggleUseGlobal}
        />
      </SettingItem>

      <div style={{ opacity: useGlobalSettings ? 0.5 : 1 }}>
        <div
          class="windrose-color-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            padding: '12px 0'
          }}
        >
          <ColorPickerItem
            colorKey="gridLineColor"
            label="Grid Lines"
            defaultColor={THEME.grid.lines}
          />
          <ColorPickerItem
            colorKey="backgroundColor"
            label="Background"
            defaultColor={THEME.grid.background}
            align="right"
          />
          <ColorPickerItem
            colorKey="borderColor"
            label="Cell Border"
            defaultColor={THEME.cells.border}
          />
          <ColorPickerItem
            colorKey="coordinateKeyColor"
            label="Coord Key"
            defaultColor={THEME.coordinateKey.color}
            align="right"
          />
        </div>
      </div>

      {mapType === 'grid' && (
        <SettingItem
          name={`Grid Line Width: ${overrides.gridLineWidth ?? 1}px`}
          description="Thickness of the grid lines (1-5 pixels)"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: useGlobalSettings ? 0.5 : 1 }}>
            <NativeSlider
              min={1}
              max={5}
              value={overrides.gridLineWidth ?? 1}
              onChange={(val: number) => handleLineWidthChange(val)}
              disabled={useGlobalSettings}
            />
            <button
              class="windrose-color-reset-btn"
              disabled={useGlobalSettings}
              onClick={() => !useGlobalSettings && handleLineWidthChange(1)}
              title="Reset to default (1px)"
              style={{ cursor: useGlobalSettings ? 'not-allowed' : 'pointer' }}
            >
              <Icon icon="lucide-rotate-ccw" />
            </button>
          </div>
        </SettingItem>
      )}

      <FogOfWarSection />

      <SettingItem
        name="Canvas Size"
        description="Height in pixels (leave blank for global defaults)"
        vertical
      >
        <div style={{ display: 'flex', gap: '12px', width: '100%', opacity: useGlobalSettings ? 0.5 : 1 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Desktop</label>
            <input
              type="number"
              placeholder={String(globalSettings.canvasHeight ?? 600)}
              value={useGlobalSettings ? '' : (overrides.canvasHeight ?? '')}
              onChange={(e: Event) => !useGlobalSettings && handleColorChange('canvasHeight', (e.target as HTMLInputElement).value === '' ? undefined : parseInt((e.target as HTMLInputElement).value, 10))}
              disabled={useGlobalSettings}
              style={{
                width: '100%',
                padding: '6px 10px',
                borderRadius: '4px',
                border: '1px solid var(--background-modifier-border)',
                background: 'var(--background-primary)',
                color: 'var(--text-normal)',
                fontSize: '14px'
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Mobile</label>
            <input
              type="number"
              placeholder={String(globalSettings.canvasHeightMobile ?? 400)}
              value={useGlobalSettings ? '' : (overrides.canvasHeightMobile ?? '')}
              onChange={(e: Event) => !useGlobalSettings && handleColorChange('canvasHeightMobile', (e.target as HTMLInputElement).value === '' ? undefined : parseInt((e.target as HTMLInputElement).value, 10))}
              disabled={useGlobalSettings}
              style={{
                width: '100%',
                padding: '6px 10px',
                borderRadius: '4px',
                border: '1px solid var(--background-modifier-border)',
                background: 'var(--background-primary)',
                color: 'var(--text-normal)',
                fontSize: '14px'
              }}
            />
          </div>
        </div>
      </SettingItem>
    </div>
  );
}

function InstalledFogPacks({ currentImage, onSelect, disabled }: {
  currentImage: string | null | undefined;
  onSelect: (displayName: string) => void;
  disabled: boolean;
}): VNode | null {
  const { globalSettings } = useAppearance();

  const fogPacks = useMemo(
    (): InstalledPack[] => (globalSettings.installedContentPacks ?? []).filter((p: InstalledPack) => p.type === 'fog-pack'),
    [globalSettings.installedContentPacks]
  );

  if (fogPacks.length === 0) return null;

  return (
    <div style={{ marginBottom: '8px' }}>
      {fogPacks.map((pack: InstalledPack) => {
        const filename = fogPackImageFilename(pack);
        const isActive = currentImage != null && currentImage.endsWith(filename);
        return (
          <div
            key={pack.id}
            onClick={() => !disabled && onSelect(filename)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              borderBottom: '1px solid var(--background-modifier-border)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.5 : 1,
              background: isActive ? 'var(--background-modifier-hover)' : 'transparent'
            }}
          >
            <span style={{ fontSize: '13px', color: 'var(--text-normal)' }}>{pack.name}</span>
            {isActive && (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>active</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export { AppearanceTab, ColorPickerItem, FogOfWarSection };