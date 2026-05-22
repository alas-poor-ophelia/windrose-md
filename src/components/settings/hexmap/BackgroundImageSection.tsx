/**
 * BackgroundImageSection.tsx
 *
 * Background image configuration section for hex maps.
 * Handles image selection, opacity, and offset controls.
 * Collapsible - starts open, auto-collapses when image is selected.
 */

import type { VNode } from 'preact';

import { useEffect, useState } from 'preact/hooks';
import { useBackgroundImage } from '../../../context/MapSettingsContext';
import { CollapsibleSection } from '../../shared/CollapsibleSection';
import { SettingItem } from '../SettingItem';








/** Map settings context shape for this component */

/**
 * Background image section with image picker and visual controls
 */
function BackgroundImageSection(): VNode {
  const {
    backgroundImagePath,
    backgroundImageDisplayName,
    setBackgroundImageDisplayName,
    imageDimensions,
    imageSearchResults,
    handleImageSearch,
    handleImageSelect,
    handleImageClear
  } = useBackgroundImage();

  // Track if user has manually toggled (to override auto-collapse behavior)
  const [userToggled, setUserToggled] = useState(false);
  const [isOpen, setIsOpen] = useState(true);

  // Auto-collapse when image is selected (only if user hasn't manually toggled)
  useEffect(() => {
    if (backgroundImagePath && !userToggled) {
      setIsOpen(false);
    }
  }, [backgroundImagePath, userToggled]);

  const handleToggle = (newIsOpen: boolean): void => {
    setUserToggled(true);
    setIsOpen(newIsOpen);
  };

  const subtitle = backgroundImagePath
    ? backgroundImageDisplayName || 'Image selected'
    : 'No image';

  return (
    <CollapsibleSection
      title="Background Image"
      isOpen={isOpen}
      onToggle={handleToggle}
      subtitle={subtitle}
    >
      <SettingItem name="Image" description="Add an image to automatically size the hex grid" vertical>
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

          {backgroundImagePath && (
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
              ×
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

      {/* Show dimensions when image is selected */}
      {imageDimensions && (
        <div class="setting-item-description">
          Detected: {imageDimensions.width} × {imageDimensions.height} px
        </div>
      )}
    </CollapsibleSection>
  );
}

export { BackgroundImageSection };