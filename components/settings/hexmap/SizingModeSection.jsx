/**
 * SizingModeSection.jsx
 * 
 * Grid sizing configuration for hex maps with background images.
 * Provides Quick Setup (density presets) and Advanced (measurement) modes.
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapSettings } = await requireModuleByName("MapSettingsContext.jsx");

/**
 * Quick Setup tab content - density presets
 */
function DensityModeContent() {
  const {
    gridDensity,
    customColumns,
    hexBounds,
    imageDimensions,
    orientation,
    handleDensityChange,
    handleCustomColumnsChange,
    GRID_DENSITY_PRESETS,
    calculateGridFromColumns,
    hexSizeToMeasurement,
    MEASUREMENT_EDGE
  } = useMapSettings();
  
  return (
    <div>
      <label class="dmt-form-label" style={{ marginBottom: '8px' }}>Grid Density</label>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label class="dmt-radio-label" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
          <input
            type="radio"
            name="gridDensity"
            value="sparse"
            checked={gridDensity === 'sparse'}
            onChange={() => handleDensityChange('sparse')}
            style={{ marginTop: '2px' }}
          />
          <div>
            <span style={{ fontWeight: 500 }}>{GRID_DENSITY_PRESETS.sparse.label}</span>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {GRID_DENSITY_PRESETS.sparse.description}
            </p>
          </div>
        </label>
        
        <label class="dmt-radio-label" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
          <input
            type="radio"
            name="gridDensity"
            value="medium"
            checked={gridDensity === 'medium'}
            onChange={() => handleDensityChange('medium')}
            style={{ marginTop: '2px' }}
          />
          <div>
            <span style={{ fontWeight: 500 }}>{GRID_DENSITY_PRESETS.medium.label}</span>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {GRID_DENSITY_PRESETS.medium.description}
            </p>
          </div>
        </label>
        
        <label class="dmt-radio-label" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
          <input
            type="radio"
            name="gridDensity"
            value="dense"
            checked={gridDensity === 'dense'}
            onChange={() => handleDensityChange('dense')}
            style={{ marginTop: '2px' }}
          />
          <div>
            <span style={{ fontWeight: 500 }}>{GRID_DENSITY_PRESETS.dense.label}</span>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {GRID_DENSITY_PRESETS.dense.description}
            </p>
          </div>
        </label>
        
        <label class="dmt-radio-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="radio"
            name="gridDensity"
            value="custom"
            checked={gridDensity === 'custom'}
            onChange={() => handleDensityChange('custom')}
          />
          <span style={{ fontWeight: 500 }}>Custom</span>
          <input
            type="number"
            min="1"
            max="200"
            value={customColumns}
            onChange={(e) => handleCustomColumnsChange(e.target.value)}
            disabled={gridDensity !== 'custom'}
            style={{
              width: '60px',
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid var(--background-modifier-border)',
              background: 'var(--background-primary)',
              color: 'var(--text-normal)',
              fontSize: '13px',
              opacity: gridDensity !== 'custom' ? 0.5 : 1
            }}
          />
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>columns</span>
        </label>
      </div>
      
      {/* Show calculated result */}
      {imageDimensions && (
        <div style={{ marginTop: '12px', padding: '8px', background: 'var(--background-secondary)', borderRadius: '4px' }}>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Result: {hexBounds.maxCol} columns × {hexBounds.maxRow} rows
            {(() => {
              const columns = gridDensity === 'custom' ? customColumns : GRID_DENSITY_PRESETS[gridDensity]?.columns || 24;
              const calc = calculateGridFromColumns(imageDimensions.width, imageDimensions.height, columns, orientation);
              return ` (~${Math.round(hexSizeToMeasurement(calc.hexSize, MEASUREMENT_EDGE, orientation))}px hex width)`;
            })()}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Advanced tab content - measurement mode
 */
function MeasurementModeContent() {
  const {
    measurementMethod,
    measurementSize,
    hexBounds,
    imageDimensions,
    orientation,
    fineTuneEnabled,
    fineTuneOffset,
    handleMeasurementMethodChange,
    handleMeasurementSizeChange,
    handleFineTuneChange,
    handleFineTuneReset,
    MEASUREMENT_EDGE,
    MEASUREMENT_CORNER,
    measurementToHexSize,
    getFineTuneRange
  } = useMapSettings();
  
  const baseHexSize = measurementToHexSize(measurementSize, measurementMethod, orientation);
  const effectiveHexSize = fineTuneEnabled ? baseHexSize + fineTuneOffset : baseHexSize;
  const fineTuneRange = getFineTuneRange(baseHexSize);
  
  return (
    <div>
      <label class="dmt-form-label" style={{ marginBottom: '8px' }}>Hex Measurement</label>
      
      {/* Measurement method selector */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
          <input
            type="radio"
            name="measurementMethod"
            value={MEASUREMENT_EDGE}
            checked={measurementMethod === MEASUREMENT_EDGE}
            onChange={() => handleMeasurementMethodChange(MEASUREMENT_EDGE)}
          />
          <span style={{ fontSize: '13px' }}>Edge-to-edge</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
          <input
            type="radio"
            name="measurementMethod"
            value={MEASUREMENT_CORNER}
            checked={measurementMethod === MEASUREMENT_CORNER}
            onChange={() => handleMeasurementMethodChange(MEASUREMENT_CORNER)}
          />
          <span style={{ fontSize: '13px' }}>Corner-to-corner</span>
        </label>
      </div>
      
      {/* Size input */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Size:</span>
        <input
          type="number"
          min="10"
          max="500"
          step="1"
          value={measurementSize}
          onChange={(e) => handleMeasurementSizeChange(e.target.value)}
          style={{
            width: '80px',
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid var(--background-modifier-border)',
            background: 'var(--background-primary)',
            color: 'var(--text-normal)',
            fontSize: '13px'
          }}
        />
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>pixels</span>
      </div>
      
      {/* Calculated result */}
      <div style={{ padding: '8px', background: 'var(--background-secondary)', borderRadius: '4px', marginBottom: '12px' }}>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Calculated Grid: {hexBounds.maxCol} columns × {hexBounds.maxRow} rows
          {` (hexSize: ${effectiveHexSize.toFixed(1)}px)`}
        </p>
      </div>
      
      {/* Fine-tune section */}
      <details style={{ marginTop: '12px' }}>
        <summary style={{ 
          cursor: 'pointer', 
          fontWeight: '500', 
          fontSize: '13px',
          color: 'var(--text-normal)',
          padding: '4px 0',
          userSelect: 'none'
        }}>
          ⚙ Fine-Tune Alignment
        </summary>
        
        <div style={{ marginTop: '8px', padding: '12px', background: 'var(--background-secondary)', borderRadius: '4px' }}>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px' }}>
            Adjust if hexes don't align perfectly with your image grid. Small changes can make a big difference.
          </p>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Hex size:</span>
            <input
              type="number"
              min={fineTuneRange.min}
              max={fineTuneRange.max}
              step="0.5"
              value={effectiveHexSize.toFixed(1)}
              onChange={(e) => handleFineTuneChange(parseFloat(e.target.value))}
              style={{
                width: '80px',
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid var(--background-modifier-border)',
                background: 'var(--background-primary)',
                color: 'var(--text-normal)',
                fontSize: '13px'
              }}
            />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>px</span>
            
            {fineTuneOffset !== 0 && (
              <>
                <span style={{ fontSize: '12px', color: 'var(--text-accent)' }}>
                  ({fineTuneOffset > 0 ? '+' : ''}{fineTuneOffset.toFixed(1)})
                </span>
                <button
                  onClick={handleFineTuneReset}
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    background: 'var(--interactive-normal)',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    color: 'var(--text-normal)'
                  }}
                >
                  Reset
                </button>
              </>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}

/**
 * Sizing mode section with tabbed interface
 */
function SizingModeSection() {
  const {
    backgroundImagePath,
    imageDimensions,
    sizingMode,
    boundsLocked,
    imageOpacity,
    setImageOpacity,
    imageOffsetX,
    setImageOffsetX,
    imageOffsetY,
    setImageOffsetY,
    handleSizingModeChange,
    handleBoundsLockToggle,
    onOpenAlignmentMode
  } = useMapSettings();
  
  // Only show when image is selected and dimensions are loaded
  if (!backgroundImagePath || !imageDimensions) {
    return null;
  }
  
  return (
    <div style={{ marginTop: '20px' }}>
      {/* Tab buttons */}
      <div style={{ 
        display: 'flex', 
        gap: '4px',
        borderBottom: '1px solid var(--background-modifier-border)',
        marginBottom: '16px'
      }}>
        <button
          onClick={() => handleSizingModeChange('density')}
          style={{
            flex: 1,
            padding: '8px 16px',
            background: sizingMode === 'density' ? 'var(--background-modifier-hover)' : 'transparent',
            border: 'none',
            borderBottom: sizingMode === 'density' ? '2px solid var(--interactive-accent)' : '2px solid transparent',
            color: sizingMode === 'density' ? 'var(--text-normal)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: sizingMode === 'density' ? '600' : '400',
            transition: 'all 0.2s'
          }}
        >
          Quick Setup
        </button>
        <button
          onClick={() => handleSizingModeChange('measurement')}
          style={{
            flex: 1,
            padding: '8px 16px',
            background: sizingMode === 'measurement' ? 'var(--background-modifier-hover)' : 'transparent',
            border: 'none',
            borderBottom: sizingMode === 'measurement' ? '2px solid var(--interactive-accent)' : '2px solid transparent',
            color: sizingMode === 'measurement' ? 'var(--text-normal)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: sizingMode === 'measurement' ? '600' : '400',
            transition: 'all 0.2s'
          }}
        >
          Advanced
        </button>
      </div>
      
      {/* Tab content */}
      {sizingMode === 'density' && <DensityModeContent />}
      {sizingMode === 'measurement' && <MeasurementModeContent />}
      
      {/* Lock bounds checkbox - after tabs */}
      <label class="dmt-checkbox-label" style={{ marginTop: '16px', display: 'block' }}>
        <input
          type="checkbox"
          checked={boundsLocked}
          onChange={handleBoundsLockToggle}
          class="dmt-checkbox"
        />
        <span>Lock bounds to image dimensions</span>
      </label>
      
      {/* Opacity slider */}
      <div style={{ marginTop: '16px' }}>
        <label class="dmt-form-label" style={{ marginBottom: '8px', display: 'block' }}>
          Image Opacity: {Math.round(imageOpacity * 100)}%
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(imageOpacity * 100)}
            onChange={(e) => setImageOpacity(parseInt(e.target.value, 10) / 100)}
            style={{
              flex: 1,
              height: '6px',
              cursor: 'pointer',
              accentColor: 'var(--interactive-accent)'
            }}
          />
          <span style={{ 
            fontSize: '12px', 
            color: 'var(--text-muted)',
            minWidth: '35px',
            textAlign: 'right'
          }}>
            {Math.round(imageOpacity * 100)}%
          </span>
        </div>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Lower opacity makes the grid more visible over the image
        </p>
      </div>
      
      {/* Image offset controls */}
      <div style={{ marginTop: '16px' }}>
        <label class="dmt-form-label" style={{ marginBottom: '8px', display: 'block' }}>
          Image Offset (pixels)
        </label>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>X:</span>
            <input
              type="number"
              value={imageOffsetX}
              onChange={(e) => setImageOffsetX(parseInt(e.target.value, 10) || 0)}
              class="dmt-number-input"
              style={{
                width: '80px',
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid var(--background-modifier-border)',
                background: 'var(--background-primary)',
                color: 'var(--text-normal)',
                fontSize: '13px'
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Y:</span>
            <input
              type="number"
              value={imageOffsetY}
              onChange={(e) => setImageOffsetY(parseInt(e.target.value, 10) || 0)}
              class="dmt-number-input"
              style={{
                width: '80px',
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid var(--background-modifier-border)',
                background: 'var(--background-primary)',
                color: 'var(--text-normal)',
                fontSize: '13px'
              }}
            />
          </div>
        </div>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Fine-tune image position relative to grid center
        </p>
        <button
          onClick={() => onOpenAlignmentMode?.(imageOffsetX, imageOffsetY)}
          style={{
            marginTop: '8px',
            padding: '6px 12px',
            fontSize: '12px',
            fontWeight: '500',
            background: 'var(--interactive-normal)',
            color: 'var(--text-normal)',
            border: '1px solid var(--background-modifier-border)',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
          onMouseEnter={(e) => e.target.style.background = 'var(--interactive-hover)'}
          onMouseLeave={(e) => e.target.style.background = 'var(--interactive-normal)'}
        >
          <span>🔍</span>
          <span>Adjust Position Interactively</span>
        </button>
      </div>
    </div>
  );
}

return { SizingModeSection, DensityModeContent, MeasurementModeContent };