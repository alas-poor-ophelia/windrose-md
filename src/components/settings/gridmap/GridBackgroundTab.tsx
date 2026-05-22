/**
 * GridBackgroundTab.tsx
 *
 * Background image settings tab for grid maps.
 * Allows users to set a background image and configure grid alignment.
 */

import type { VNode } from 'preact';

import { useEffect, useState } from 'preact/hooks';
import { useBackgroundImage, useModalShell } from '../../../context/MapSettingsContext';
import { CollapsibleSection } from '../../shared/CollapsibleSection';
import { SettingItem } from '../SettingItem';
import { NativeSlider } from '../NativeControls';









/** Map settings context shape for this component */

/**
 * Grid Background tab content - background image settings for grid maps
 */
function GridBackgroundTab(): VNode | null {
  const {
    backgroundImagePath,
    backgroundImageDisplayName,
    setBackgroundImageDisplayName,
    imageSearchResults,
    handleImageSearch,
    handleImageSelect,
    handleImageClear,
    imageOpacity,
    setImageOpacity,
    imageOffsetX,
    setImageOffsetX,
    imageOffsetY,
    setImageOffsetY,
    imageGridSize,
    setImageGridSize,
    onOpenAlignmentMode
  } = useBackgroundImage();
  const { mapType } = useModalShell();

  // Guard: only render for grid maps
  if (mapType !== 'grid') {
    return null;
  }

  // Track section open state
  const [imagePickerOpen, setImagePickerOpen] = useState(backgroundImagePath == null || backgroundImagePath === '');
  const [alignmentOpen, setAlignmentOpen] = useState(backgroundImagePath != null && backgroundImagePath !== '');

  // Auto-collapse image picker when image is selected
  useEffect(() => {
    if (backgroundImagePath != null && backgroundImagePath !== '') {
      setImagePickerOpen(false);
      setAlignmentOpen(true);
    }
  }, [backgroundImagePath]);

  return (
    <div class="dmt-settings-tab-content" style={{ paddingRight: '8px' }}>
      {/* Background Image Picker Section */}
      <CollapsibleSection
        title="Background Image"
        isOpen={imagePickerOpen}
        onToggle={setImagePickerOpen}
        subtitle={backgroundImagePath != null && backgroundImagePath !== '' ? (backgroundImageDisplayName || 'Image selected') : 'No image'}
      >
        <SettingItem name="Image" description="Add a background image for your grid map" vertical>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Search for image..."
              value={backgroundImageDisplayName}
              onChange={(e: Event) => {
                const value = (e.target as HTMLInputElement).value;
                setBackgroundImageDisplayName(value);
                void handleImageSearch(value);
              }}
              style={{
                width: '100%',
                padding: '8px 32px 8px 10px',
                borderRadius: '4px',
                border: '1px solid var(--background-modifier-border)',
                background: 'var(--background-primary)',
                color: 'var(--text-normal)',
                fontSize: '14px'
              }}
            />

            {backgroundImagePath != null && backgroundImagePath !== '' && (
              <button
                onClick={handleImageClear}
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
                x
              </button>
            )}

            {/* Autocomplete dropdown */}
            {imageSearchResults.length > 0 && (
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
                {imageSearchResults.map((name: string, idx: number) => (
                  <div
                    key={idx}
                    onClick={() => handleImageSelect(name)}
                    style={{
                      padding: '8px 10px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      borderBottom: idx < imageSearchResults.length - 1 ? '1px solid var(--background-modifier-border)' : 'none'
                    }}
                    onMouseEnter={(e: Event) => (e.currentTarget as HTMLElement).classList.add('windrose-dropdown-item-hover')}
                    onMouseLeave={(e: Event) => (e.currentTarget as HTMLElement).classList.remove('windrose-dropdown-item-hover')}
                  >
                    {name}
                  </div>
                ))}
              </div>
            )}
          </div>
        </SettingItem>
      </CollapsibleSection>

      {/* Grid Alignment Section - only show when image is selected */}
      {backgroundImagePath != null && backgroundImagePath !== '' && (
        <CollapsibleSection
          title="Grid Alignment"
          isOpen={alignmentOpen}
          onToggle={setAlignmentOpen}
          subtitle="Align Windrose grid with background"
        >
          <SettingItem
            name="Background Grid Size"
            description="Pixel size of each grid cell on your background image. Windrose will scale to match."
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input
                type="number"
                value={imageGridSize}
                min={1}
                max={500}
                onChange={(e: Event) => {
                  const value = parseInt((e.target as HTMLInputElement).value, 10);
                  if (!isNaN(value) && value > 0 && value <= 500) {
                    setImageGridSize(value);
                  }
                }}
                style={{
                  width: '80px',
                  padding: '6px 10px',
                  borderRadius: '4px',
                  border: '1px solid var(--background-modifier-border)',
                  background: 'var(--background-primary)',
                  color: 'var(--text-normal)',
                  fontSize: '14px'
                }}
              />
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>px</span>
            </div>
          </SettingItem>

          <SettingItem
            name={`Image Opacity: ${Math.round(imageOpacity * 100)}%`}
          >
            <NativeSlider
              min={0}
              max={100}
              step={5}
              value={Math.round(imageOpacity * 100)}
              onChange={(val: number) => setImageOpacity(val / 100)}
            />
          </SettingItem>

          <SettingItem name="Position Offset">
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>X</span>
              <input
                type="number"
                value={imageOffsetX}
                onChange={(e: Event) => setImageOffsetX(parseInt((e.target as HTMLInputElement).value, 10) || 0)}
                style={{
                  width: '60px',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: '1px solid var(--background-modifier-border)',
                  background: 'var(--background-primary)',
                  color: 'var(--text-normal)',
                  fontSize: '13px'
                }}
              />
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Y</span>
              <input
                type="number"
                value={imageOffsetY}
                onChange={(e: Event) => setImageOffsetY(parseInt((e.target as HTMLInputElement).value, 10) || 0)}
                style={{
                  width: '60px',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: '1px solid var(--background-modifier-border)',
                  background: 'var(--background-primary)',
                  color: 'var(--text-normal)',
                  fontSize: '13px'
                }}
              />
            </div>
          </SettingItem>

          {/* Interactive Alignment Mode Button */}
          {onOpenAlignmentMode && (
            <SettingItem
              name="Interactive Alignment"
              description="Drag the image to align with the grid"
            >
              <button
                onClick={() => onOpenAlignmentMode?.(imageOffsetX, imageOffsetY)}
                class="mod-cta"
                style={{ padding: '6px 12px', fontSize: '13px' }}
              >
                Open
              </button>
            </SettingItem>
          )}
        </CollapsibleSection>
      )}
    </div>
  );
}

export { GridBackgroundTab };