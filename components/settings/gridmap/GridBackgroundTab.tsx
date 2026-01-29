/**
 * GridBackgroundTab.tsx
 *
 * Background image settings tab for grid maps.
 * Allows users to set a background image and configure grid alignment.
 */

import type { MapType } from '#types/core/map.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapSettings } = await requireModuleByName("MapSettingsContext.tsx");
const { CollapsibleSection } = await requireModuleByName("CollapsibleSection.tsx");

/** Map settings context shape for this component */
interface GridBackgroundContext {
  mapType: MapType;
  backgroundImagePath: string | null;
  backgroundImageDisplayName: string;
  setBackgroundImageDisplayName: (name: string) => void;
  imageSearchResults: string[];
  handleImageSearch: (query: string) => void;
  handleImageSelect: (name: string) => void;
  handleImageClear: () => void;
  imageOpacity: number;
  setImageOpacity: (opacity: number) => void;
  imageOffsetX: number;
  setImageOffsetX: (x: number) => void;
  imageOffsetY: number;
  setImageOffsetY: (y: number) => void;
  imageGridSize: number;
  setImageGridSize: (size: number) => void;
  onOpenAlignmentMode?: () => void;
}

/**
 * Grid Background tab content - background image settings for grid maps
 */
function GridBackgroundTab(): React.ReactElement | null {
  const {
    mapType,
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
  } = useMapSettings() as GridBackgroundContext;

  // Guard: only render for grid maps
  if (mapType !== 'grid') {
    return null;
  }

  // Track section open state
  const [imagePickerOpen, setImagePickerOpen] = dc.useState(!backgroundImagePath);
  const [alignmentOpen, setAlignmentOpen] = dc.useState(!!backgroundImagePath);

  // Auto-collapse image picker when image is selected
  dc.useEffect(() => {
    if (backgroundImagePath) {
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
        subtitle={backgroundImagePath ? backgroundImageDisplayName || 'Image selected' : 'No image'}
      >
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
          Add a background image for your grid map
        </p>

        {/* Image picker */}
        <div style={{ position: 'relative', marginBottom: '12px' }}>
          <input
            type="text"
            placeholder="Search for image..."
            value={backgroundImageDisplayName}
            onChange={(e: Event) => {
              const value = (e.target as HTMLInputElement).value;
              setBackgroundImageDisplayName(value);
              handleImageSearch(value);
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
                  onMouseEnter={(e: Event) => (e.currentTarget as HTMLElement).style.background = 'var(--background-modifier-hover)'}
                  onMouseLeave={(e: Event) => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                >
                  {name}
                </div>
              ))}
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Grid Alignment Section - only show when image is selected */}
      {backgroundImagePath && (
        <CollapsibleSection
          title="Grid Alignment"
          isOpen={alignmentOpen}
          onToggle={setAlignmentOpen}
          subtitle="Align Windrose grid with background"
        >
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Configure how Windrose's grid aligns with any pre-drawn grid on your background image.
          </p>

          {/* Image Grid Size */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500 }}>
              Background Grid Size (pixels)
            </label>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              If your background image has a pre-drawn grid, enter the pixel size of each grid cell.
              Windrose will scale the image to match its grid overlay.
            </p>
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
                width: '100px',
                padding: '6px 10px',
                borderRadius: '4px',
                border: '1px solid var(--background-modifier-border)',
                background: 'var(--background-primary)',
                color: 'var(--text-normal)',
                fontSize: '14px'
              }}
            />
            <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>px</span>
          </div>

          {/* Opacity */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500 }}>
              Image Opacity
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={imageOpacity}
                onChange={(e: Event) => setImageOpacity(parseFloat((e.target as HTMLInputElement).value))}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', width: '40px' }}>
                {Math.round(imageOpacity * 100)}%
              </span>
            </div>
          </div>

          {/* X/Y Offset */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500 }}>
              Position Offset
            </label>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>X Offset</label>
                <input
                  type="number"
                  value={imageOffsetX}
                  onChange={(e: Event) => setImageOffsetX(parseInt((e.target as HTMLInputElement).value, 10) || 0)}
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
                <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Y Offset</label>
                <input
                  type="number"
                  value={imageOffsetY}
                  onChange={(e: Event) => setImageOffsetY(parseInt((e.target as HTMLInputElement).value, 10) || 0)}
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
          </div>

          {/* Interactive Alignment Mode Button */}
          {onOpenAlignmentMode && (
            <button
              onClick={onOpenAlignmentMode}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '4px',
                border: '1px solid var(--interactive-accent)',
                background: 'transparent',
                color: 'var(--interactive-accent)',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500
              }}
            >
              Open Interactive Alignment Mode
            </button>
          )}
        </CollapsibleSection>
      )}
    </div>
  );
}

return { GridBackgroundTab };
