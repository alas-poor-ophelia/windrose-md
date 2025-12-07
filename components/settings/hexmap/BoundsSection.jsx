/**
 * BoundsSection.jsx
 * 
 * Map bounds configuration section for hex maps.
 * Handles column/row limits for the playable grid area.
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapSettings } = await requireModuleByName("MapSettingsContext.jsx");

/**
 * Map bounds configuration section
 */
function BoundsSection() {
  const {
    hexBounds,
    boundsLocked,
    backgroundImagePath,
    handleHexBoundsChange
  } = useMapSettings();
  
  // Generate display label for playable area (e.g., "A1 to Z20")
  const getPlayableAreaLabel = () => {
    const maxColLetter = String.fromCharCode(65 + Math.min(hexBounds.maxCol - 1, 25));
    const overflow = hexBounds.maxCol > 26 ? '+' : '';
    return `A1 to ${maxColLetter}${overflow}${hexBounds.maxRow}`;
  };
  
  const isDisabled = boundsLocked && backgroundImagePath;
  
  return (
    <div class="dmt-form-group">
      <label class="dmt-form-label">
        Map Bounds
        {isDisabled && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'normal', marginLeft: '8px' }}>
            (controlled by background image)
          </span>
        )}
      </label>
      <div style={{ 
        display: 'flex', 
        gap: '16px', 
        alignItems: 'center', 
        flexWrap: 'wrap',
        opacity: isDisabled ? 0.6 : 1
      }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Columns:</span>
          <input
            type="number"
            min="1"
            max="1000"
            value={hexBounds.maxCol}
            onChange={(e) => handleHexBoundsChange('maxCol', e.target.value)}
            disabled={isDisabled}
            class="dmt-number-input"
            style={{
              padding: '6px 10px',
              borderRadius: '4px',
              border: '1px solid var(--background-modifier-border)',
              background: isDisabled ? 'var(--background-secondary)' : 'var(--background-primary)',
              color: isDisabled ? 'var(--text-muted)' : 'var(--text-normal)',
              fontSize: '14px',
              width: '70px'
            }}
          />
        </div>
        <span style={{ color: 'var(--text-muted)' }}>×</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Rows:</span>
          <input
            type="number"
            min="1"
            max="1000"
            value={hexBounds.maxRow}
            onChange={(e) => handleHexBoundsChange('maxRow', e.target.value)}
            disabled={isDisabled}
            class="dmt-number-input"
            style={{
              padding: '6px 10px',
              borderRadius: '4px',
              border: '1px solid var(--background-modifier-border)',
              background: isDisabled ? 'var(--background-secondary)' : 'var(--background-primary)',
              color: isDisabled ? 'var(--text-muted)' : 'var(--text-normal)',
              fontSize: '14px',
              width: '70px'
            }}
          />
        </div>
      </div>
      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
        Playable area: {getPlayableAreaLabel()}
      </p>
    </div>
  );
}

return { BoundsSection };