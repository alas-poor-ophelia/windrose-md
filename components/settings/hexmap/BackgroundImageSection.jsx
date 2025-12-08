/**
 * BackgroundImageSection.jsx
 * 
 * Background image configuration section for hex maps.
 * Handles image selection, opacity, and offset controls.
 * Collapsible - starts open, auto-collapses when image is selected.
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapSettings } = await requireModuleByName("MapSettingsContext.jsx");
const { CollapsibleSection } = await requireModuleByName("CollapsibleSection.jsx");

/**
 * Background image section with image picker and visual controls
 */
function BackgroundImageSection() {
  const {
    backgroundImagePath,
    backgroundImageDisplayName,
    setBackgroundImageDisplayName,
    imageDimensions,
    imageSearchResults,
    handleImageSearch,
    handleImageSelect,
    handleImageClear
  } = useMapSettings();
  
  // Track if user has manually toggled (to override auto-collapse behavior)
  const [userToggled, setUserToggled] = dc.useState(false);
  const [isOpen, setIsOpen] = dc.useState(true);
  
  // Auto-collapse when image is selected (only if user hasn't manually toggled)
  dc.useEffect(() => {
    if (backgroundImagePath && !userToggled) {
      setIsOpen(false);
    }
  }, [backgroundImagePath, userToggled]);
  
  const handleToggle = (newIsOpen) => {
    setUserToggled(true);
    setIsOpen(newIsOpen);
  };
  
  // Generate subtitle showing selected image or status
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
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
        Add an image to automatically size the hex grid
      </p>
      
      {/* Image picker */}
      <div style={{ position: 'relative', marginBottom: '12px' }}>
        <input
          type="text"
          placeholder="Search for image..."
          value={backgroundImageDisplayName}
          onChange={(e) => {
            setBackgroundImageDisplayName(e.target.value);
            handleImageSearch(e.target.value);
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
            {imageSearchResults.map((name, idx) => (
              <div
                key={idx}
                onClick={() => handleImageSelect(name)}
                style={{
                  padding: '8px 10px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  borderBottom: idx < imageSearchResults.length - 1 ? '1px solid var(--background-modifier-border)' : 'none'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--background-modifier-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                {name}
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Show dimensions when image is selected */}
      {imageDimensions && (
        <div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Detected: {imageDimensions.width} × {imageDimensions.height} px
          </p>
        </div>
      )}
    </CollapsibleSection>
  );
}

return { BackgroundImageSection };