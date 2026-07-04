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
import { ImageSearchField } from '../ImageSearchField';









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

  // Track section open state — hooks must be before any conditional return
  const [imagePickerOpen, setImagePickerOpen] = useState(backgroundImagePath == null || backgroundImagePath === '');
  const [alignmentOpen, setAlignmentOpen] = useState(backgroundImagePath != null && backgroundImagePath !== '');

  // Auto-collapse image picker when image is selected
  useEffect(() => {
    if (backgroundImagePath != null && backgroundImagePath !== '') {
      setImagePickerOpen(false);
      setAlignmentOpen(true);
    }
  }, [backgroundImagePath]);

  if (mapType !== 'grid') {
    return null;
  }

  return (
    <div class="windrose-settings-tab-content" style={{ paddingRight: '8px' }}>
      {/* Background Image Picker Section */}
      <CollapsibleSection
        title="Background Image"
        isOpen={imagePickerOpen}
        onToggle={setImagePickerOpen}
        subtitle={backgroundImagePath != null && backgroundImagePath !== '' ? (backgroundImageDisplayName || 'Image selected') : 'No image'}
      >
        <SettingItem name="Image" description="Add a background image for your grid map" vertical>
          <ImageSearchField
            value={backgroundImageDisplayName}
            placeholder="Search for image..."
            onSearch={(value: string) => {
              setBackgroundImageDisplayName(value);
              void handleImageSearch(value);
            }}
            showClear={backgroundImagePath != null && backgroundImagePath !== ''}
            onClear={handleImageClear}
            results={imageSearchResults}
            onSelect={(image) => void handleImageSelect(image)}
            clearGlyph="x"
          />
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