/**
 * AppearanceTab.tsx
 *
 * Appearance settings tab for MapSettingsModal.
 * Handles color customization and grid line width.
 */

import type { HexColor } from '#types/core/common.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { ColorPicker } = await requireModuleByName("ColorPicker.tsx");
const { CollapsibleSection } = await requireModuleByName("CollapsibleSection.tsx");
const { useAppearance, useModalShell } = await requireModuleByName("MapSettingsContext.tsx");
const { SettingItem, SettingHeading } = await requireModuleByName("SettingItem.tsx");
const { NativeToggle, NativeSlider } = await requireModuleByName("NativeControls.tsx");

/** Props for ColorPickerItem */
interface ColorPickerItemProps {
  colorKey: string;
  label: string;
  defaultColor: HexColor;
  align?: 'left' | 'right';
}

/**
 * Individual color picker item for the 2x2 grid
 */
function ColorPickerItem({ colorKey, label, defaultColor, align = 'left' }: ColorPickerItemProps): React.ReactElement {
  const {
    useGlobalSettings,
    overrides,
    activeColorPicker,
    setActiveColorPicker,
    pendingCustomColorRef,
    handleColorChange,
    globalSettings
  } = useAppearance();

  return (
    <div class="dmt-color-grid-item">
      <label class="dmt-form-label" style={{ marginBottom: '4px', fontSize: '12px' }}>{label}</label>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', position: 'relative' }}>
        <button
          class="dmt-color-button"
          disabled={useGlobalSettings}
          onClick={() => !useGlobalSettings && setActiveColorPicker(colorKey)}
          style={{
            backgroundColor: overrides[colorKey],
            cursor: useGlobalSettings ? 'not-allowed' : 'pointer',
            minWidth: '80px'
          }}
        >
          <span class="dmt-color-button-label">{overrides[colorKey]}</span>
        </button>

        <button
          class="dmt-color-reset-btn"
          disabled={useGlobalSettings}
          onClick={() => !useGlobalSettings && handleColorChange(colorKey, defaultColor)}
          title="Reset to default"
          style={{ cursor: useGlobalSettings ? 'not-allowed' : 'pointer' }}
        >
          <dc.Icon icon="lucide-rotate-ccw" />
        </button>

        <ColorPicker
          isOpen={activeColorPicker === colorKey && !useGlobalSettings}
          selectedColor={overrides[colorKey]}
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
function FogOfWarSection(): React.ReactElement {
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

  const [userToggled, setUserToggled] = dc.useState(false);
  const [isOpen, setIsOpen] = dc.useState(false);

  const handleToggle = (newIsOpen: boolean): void => {
    setUserToggled(true);
    setIsOpen(newIsOpen);
  };

  const opacityPercent = Math.round((overrides.fogOfWarOpacity ?? 0.9) * 100);
  const subtitle = overrides.fogOfWarImage
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
              class="dmt-color-button"
              disabled={useGlobalSettings}
              onClick={() => !useGlobalSettings && setActiveColorPicker('fogOfWarColor')}
              style={{
                backgroundColor: overrides.fogOfWarColor ?? '#000000',
                cursor: useGlobalSettings ? 'not-allowed' : 'pointer',
                minWidth: '80px'
              }}
            >
              <span class="dmt-color-button-label">{overrides.fogOfWarColor ?? '#000000'}</span>
            </button>

            <button
              class="dmt-color-reset-btn"
              disabled={useGlobalSettings}
              onClick={() => !useGlobalSettings && handleColorChange('fogOfWarColor', THEME.fogOfWar.color)}
              title="Reset to default"
              style={{ cursor: useGlobalSettings ? 'not-allowed' : 'pointer' }}
            >
              <dc.Icon icon="lucide-rotate-ccw" />
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
              class="dmt-color-reset-btn"
              disabled={useGlobalSettings}
              onClick={() => !useGlobalSettings && handleColorChange('fogOfWarOpacity', 0.9)}
              title="Reset to default (90%)"
              style={{ cursor: useGlobalSettings ? 'not-allowed' : 'pointer' }}
            >
              <dc.Icon icon="lucide-rotate-ccw" />
            </button>
          </div>
        </SettingItem>

        <SettingItem
          name="Fog Texture"
          description="Select a tileable image to use instead of solid color"
          vertical
        >
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Search for tileable image..."
              value={fogImageDisplayName}
              disabled={useGlobalSettings}
              onChange={(e: Event) => {
                if (useGlobalSettings) return;
                const value = (e.target as HTMLInputElement).value;
                setFogImageDisplayName(value);
                handleFogImageSearch(value);
              }}
              style={{
                width: '100%',
                padding: '8px 32px 8px 10px',
                borderRadius: '4px',
                border: '1px solid var(--background-modifier-border)',
                background: 'var(--background-primary)',
                color: 'var(--text-normal)',
                fontSize: '14px',
                cursor: useGlobalSettings ? 'not-allowed' : 'text'
              }}
            />

            {overrides.fogOfWarImage && !useGlobalSettings && (
              <button
                onClick={handleFogImageClear}
                style={{
                  position: 'absolute',
                  right: '6px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px',
                  fontSize: '16px',
                  lineHeight: '1'
                }}
                title="Clear image"
              >
                ×
              </button>
            )}

            {fogImageSearchResults.length > 0 && !useGlobalSettings && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                maxHeight: '200px',
                overflowY: 'auto',
                background: 'var(--background-primary)',
                border: '1px solid var(--background-modifier-border)',
                borderRadius: '4px',
                marginTop: '2px',
                zIndex: 1000,
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
              }}>
                {fogImageSearchResults.map((name: string, idx: number) => (
                  <div
                    key={idx}
                    onClick={() => handleFogImageSelect(name)}
                    style={{
                      padding: '8px 10px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      borderBottom: idx < fogImageSearchResults.length - 1 ? '1px solid var(--background-modifier-border)' : 'none'
                    }}
                    onMouseEnter={(e: MouseEvent) => (e.currentTarget as HTMLElement).style.background = 'var(--background-modifier-hover)'}
                    onMouseLeave={(e: MouseEvent) => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                  >
                    {name}
                  </div>
                ))}
              </div>
            )}
          </div>
        </SettingItem>

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
                class="dmt-color-reset-btn"
                disabled={useGlobalSettings}
                onClick={() => !useGlobalSettings && handleColorChange('fogOfWarBlurFactor', 0.20)}
                title="Reset to default (20%)"
                style={{ cursor: useGlobalSettings ? 'not-allowed' : 'pointer' }}
              >
                <dc.Icon icon="lucide-rotate-ccw" />
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
function AppearanceTab(): React.ReactElement {
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
    <div class="dmt-settings-tab-content">
      {globalSettings.objectSets && globalSettings.objectSets.length > 0 && (
        <SettingItem
          name="Object set"
          description="Override the global object set for this map"
        >
          <select
            class="dropdown"
            value={objectSetId || ''}
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
          class="dmt-color-grid"
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
              class="dmt-color-reset-btn"
              disabled={useGlobalSettings}
              onClick={() => !useGlobalSettings && handleLineWidthChange(1)}
              title="Reset to default (1px)"
              style={{ cursor: useGlobalSettings ? 'not-allowed' : 'pointer' }}
            >
              <dc.Icon icon="lucide-rotate-ccw" />
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

return { AppearanceTab, ColorPickerItem, FogOfWarSection };
