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
const { useMapSettings } = await requireModuleByName("MapSettingsContext.tsx");

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
  } = useMapSettings();

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
  } = useMapSettings();

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
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
        Customize how hidden areas appear on the map
      </p>

      <div style={{ marginBottom: '16px', opacity: useGlobalSettings ? 0.5 : 1 }}>
        <label class="dmt-form-label" style={{ marginBottom: '4px', fontSize: '12px' }}>Fog Color</label>
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
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Used if no image is set, or as fallback if image fails to load
        </p>
      </div>

      <div style={{ marginBottom: '16px', opacity: useGlobalSettings ? 0.5 : 1 }}>
        <label class="dmt-form-label" style={{ marginBottom: '8px', display: 'block' }}>
          Fog Opacity: {Math.round((overrides.fogOfWarOpacity ?? 0.9) * 100)}%
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <input
            type="range"
            min="10"
            max="100"
            value={Math.round((overrides.fogOfWarOpacity ?? 0.9) * 100)}
            onChange={(e: Event) => !useGlobalSettings && handleColorChange('fogOfWarOpacity', parseInt((e.target as HTMLInputElement).value, 10) / 100)}
            disabled={useGlobalSettings}
            style={{
              flex: 1,
              height: '6px',
              cursor: useGlobalSettings ? 'not-allowed' : 'pointer',
              accentColor: 'var(--interactive-accent)'
            }}
          />
          <span style={{
            fontSize: '12px',
            color: 'var(--text-muted)',
            minWidth: '35px',
            textAlign: 'right'
          }}>
            {Math.round((overrides.fogOfWarOpacity ?? 0.9) * 100)}%
          </span>
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
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Higher values make fog more opaque (10-100%)
        </p>
      </div>

      <div style={{ opacity: useGlobalSettings ? 0.5 : 1 }}>
        <label class="dmt-form-label" style={{ marginBottom: '4px', fontSize: '12px' }}>
          Fog Texture (optional)
        </label>
        <div style={{ position: 'relative', marginBottom: '8px' }}>
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
        <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          Select a tileable image to use instead of solid color. Image will be tiled across fogged areas.
        </p>
      </div>

      <div style={{ marginTop: '16px', opacity: useGlobalSettings ? 0.5 : 1 }}>
        <label class="dmt-checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: useGlobalSettings ? 'not-allowed' : 'pointer' }}>
          <input
            type="checkbox"
            checked={overrides.fogOfWarBlurEnabled ?? false}
            onChange={() => !useGlobalSettings && handleColorChange('fogOfWarBlurEnabled', !(overrides.fogOfWarBlurEnabled ?? false))}
            disabled={useGlobalSettings}
            class="dmt-checkbox"
          />
          <span>Soft edges</span>
        </label>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', marginLeft: '24px' }}>
          Adds a subtle blur effect at fog boundaries for a softer look
        </p>
      </div>

      {(overrides.fogOfWarBlurEnabled ?? false) && (
        <div style={{ marginTop: '12px', marginLeft: '24px', opacity: useGlobalSettings ? 0.5 : 1 }}>
          <label class="dmt-form-label" style={{ marginBottom: '8px', display: 'block', fontSize: '12px' }}>
            Blur Intensity: {Math.round((overrides.fogOfWarBlurFactor ?? 0.20) * 100)}%
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input
              type="range"
              min="5"
              max="50"
              value={Math.round((overrides.fogOfWarBlurFactor ?? 0.20) * 100)}
              onChange={(e: Event) => !useGlobalSettings && handleColorChange('fogOfWarBlurFactor', parseInt((e.target as HTMLInputElement).value, 10) / 100)}
              disabled={useGlobalSettings}
              style={{
                flex: 1,
                height: '6px',
                cursor: useGlobalSettings ? 'not-allowed' : 'pointer',
                accentColor: 'var(--interactive-accent)'
              }}
            />
            <span style={{
              fontSize: '12px',
              color: 'var(--text-muted)',
              minWidth: '35px',
              textAlign: 'right'
            }}>
              {Math.round((overrides.fogOfWarBlurFactor ?? 0.20) * 100)}%
            </span>
            <button
              class="dmt-color-reset-btn"
              disabled={useGlobalSettings}
              onClick={() => !useGlobalSettings && handleColorChange('fogOfWarBlurFactor', 0.20)}
              title="Reset to default (8%)"
              style={{ cursor: useGlobalSettings ? 'not-allowed' : 'pointer' }}
            >
              <dc.Icon icon="lucide-rotate-ccw" />
            </button>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Size of blur as percentage of cell size (5-50%)
          </p>
        </div>
      )}
    </CollapsibleSection>
  );
}

/**
 * Appearance tab content
 */
function AppearanceTab(): React.ReactElement {
  const {
    mapType,
    useGlobalSettings,
    overrides,
    globalSettings,
    handleToggleUseGlobal,
    handleLineWidthChange,
    handleColorChange,
    THEME
  } = useMapSettings();

  return (
    <div class="dmt-settings-tab-content">
      <div class="dmt-form-group" style={{ marginBottom: '16px' }}>
        <label class="dmt-checkbox-label">
          <input
            type="checkbox"
            checked={!useGlobalSettings}
            onChange={handleToggleUseGlobal}
            class="dmt-checkbox"
          />
          <span>Use custom colors for this map</span>
        </label>
      </div>

      <div
        class="dmt-color-grid"
        style={{
          opacity: useGlobalSettings ? 0.5 : 1,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '16px'
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

      {mapType === 'grid' && (
        <div
          class="dmt-form-group"
          style={{
            marginTop: '20px',
            opacity: useGlobalSettings ? 0.5 : 1
          }}
        >
          <label class="dmt-form-label" style={{ marginBottom: '8px' }}>
            Grid Line Width: {overrides.gridLineWidth ?? 1}px
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input
              type="range"
              min="1"
              max="5"
              value={overrides.gridLineWidth ?? 1}
              onInput={(e: Event) => handleLineWidthChange((e.target as HTMLInputElement).value)}
              disabled={useGlobalSettings}
              style={{
                flex: 1,
                cursor: useGlobalSettings ? 'not-allowed' : 'pointer'
              }}
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
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
            Thickness of the grid lines (1-5 pixels)
          </p>
        </div>
      )}

      <div style={{ marginTop: '20px' }}>
        <FogOfWarSection />
      </div>

      <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--background-modifier-border)' }}>
        <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Canvas Size</h4>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Canvas height settings (leave blank to use global defaults)
        </p>

        <div style={{ display: 'flex', gap: '12px', padding: '0 2px', opacity: useGlobalSettings ? 0.5 : 1 }}>
          <div class="dmt-form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label class="dmt-form-label">Desktop (pixels)</label>
            <input
              type="number"
              class="dmt-modal-input"
              placeholder={String(globalSettings.canvasHeight ?? 600)}
              value={useGlobalSettings ? '' : (overrides.canvasHeight ?? '')}
              onChange={(e: Event) => !useGlobalSettings && handleColorChange('canvasHeight', (e.target as HTMLInputElement).value === '' ? undefined : parseInt((e.target as HTMLInputElement).value, 10))}
              disabled={useGlobalSettings}
              style={{ opacity: useGlobalSettings ? 0.5 : 1 }}
            />
          </div>

          <div class="dmt-form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label class="dmt-form-label">Mobile/Touch (pixels)</label>
            <input
              type="number"
              class="dmt-modal-input"
              placeholder={String(globalSettings.canvasHeightMobile ?? 400)}
              value={useGlobalSettings ? '' : (overrides.canvasHeightMobile ?? '')}
              onChange={(e: Event) => !useGlobalSettings && handleColorChange('canvasHeightMobile', (e.target as HTMLInputElement).value === '' ? undefined : parseInt((e.target as HTMLInputElement).value, 10))}
              disabled={useGlobalSettings}
              style={{ opacity: useGlobalSettings ? 0.5 : 1 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

return { AppearanceTab, ColorPickerItem, FogOfWarSection };
