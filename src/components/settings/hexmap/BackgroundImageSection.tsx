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
import { ImageSearchField } from '../ImageSearchField';








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
    if (backgroundImagePath != null && backgroundImagePath !== '' && !userToggled) {
      setIsOpen(false);
    }
  }, [backgroundImagePath, userToggled]);

  const handleToggle = (newIsOpen: boolean): void => {
    setUserToggled(true);
    setIsOpen(newIsOpen);
  };

  const subtitle = backgroundImagePath != null && backgroundImagePath !== ''
    ? (backgroundImageDisplayName || 'Image selected')
    : 'No image';

  return (
    <CollapsibleSection
      title="Background Image"
      isOpen={isOpen}
      onToggle={handleToggle}
      subtitle={subtitle}
    >
      <SettingItem name="Image" description="Add an image to automatically size the hex grid" vertical>
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
        />
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